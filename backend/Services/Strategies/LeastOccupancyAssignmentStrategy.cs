namespace CaseManagement.Api.Services.Strategies;

using CaseManagement.Api.Data;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

public class LeastOccupancyAssignmentStrategy : IAssignmentStrategy
{
    private readonly AppDbContext _context;

    public LeastOccupancyAssignmentStrategy(AppDbContext context)
    {
        _context = context;
    }

    public string AlgorithmName => "LeastOccupancy";

    public async Task<User?> SelectEligibleAgentAsync(Guid departmentId, Case newCase, Customer? customer, int maxCapacity, CancellationToken ct = default)
    {
        // 1. Get eligible agents in this team/department
        var teamMembers = await _context.TeamMembers
            .AsNoTracking()
            .Include(tm => tm.User)
            .Where(tm => tm.DepartmentId == departmentId && tm.IsActive)
            .Select(tm => tm.User)
            .ToListAsync(ct);

        var directUsers = await _context.Users
            .AsNoTracking()
            .Where(u => u.DepartmentId == departmentId)
            .ToListAsync(ct);

        var allUsers = teamMembers.Concat(directUsers)
            .GroupBy(u => u.Id)
            .Select(g => g.First())
            .ToList();

        if (!allUsers.Any())
        {
            var dept = await _context.Departments.Include(d => d.Owner).FirstOrDefaultAsync(d => d.Id == departmentId, ct);
            return dept?.Owner;
        }

        // 2. Filter online agents
        var onlineUsers = allUsers
            .Where(u => u.Status == UserStatus.Available || u.Status == UserStatus.Busy)
            .ToList();

        var candidates = onlineUsers.Any() ? onlineUsers : allUsers;
        var candidateIds = candidates.Select(c => c.Id).ToList();

        // 3. Query active case counts per candidate from actual database
        var activeCaseCounts = await _context.Cases
            .AsNoTracking()
            .Where(c => candidateIds.Contains(c.OwnerId) &&
                        c.Status != CaseStatus.Resolved &&
                        c.Status != CaseStatus.Closed)
            .GroupBy(c => c.OwnerId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, ct);

        // 4. Select candidate with lowest active case count
        var candidateWorkloads = candidates.Select(u => new
        {
            User = u,
            ActiveCount = activeCaseCounts.TryGetValue(u.Id, out var count) ? count : 0
        }).ToList();

        // Respect capacity if possible
        var withinCapacity = candidateWorkloads.Where(w => w.ActiveCount < maxCapacity).ToList();
        var pool = withinCapacity.Any() ? withinCapacity : candidateWorkloads;

        // Order by lowest workload, then Available before Busy, then user ID for deterministic tie-breaker
        var selected = pool
            .OrderBy(w => w.ActiveCount)
            .ThenByDescending(w => w.User.Status == UserStatus.Available)
            .ThenBy(w => w.User.Id)
            .First();

        return selected.User;
    }
}
