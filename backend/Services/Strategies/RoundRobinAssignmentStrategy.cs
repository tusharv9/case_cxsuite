namespace CaseManagement.Api.Services.Strategies;

using CaseManagement.Api.Data;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

public class RoundRobinAssignmentStrategy : IAssignmentStrategy
{
    private readonly AppDbContext _context;

    public RoundRobinAssignmentStrategy(AppDbContext context)
    {
        _context = context;
    }

    public string AlgorithmName => "RoundRobin";

    public async Task<User?> SelectEligibleAgentAsync(Guid departmentId, Case newCase, Customer? customer, int maxCapacity, CancellationToken ct = default)
    {
        // 1. Get eligible agents in this team/department
        var teamMembers = await _context.TeamMembers
            .AsNoTracking()
            .Include(tm => tm.User)
            .Where(tm => tm.DepartmentId == departmentId && tm.IsActive)
            .Select(tm => tm.User)
            .ToListAsync(ct);

        // Fallback: also include users whose direct DepartmentId matches
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
            // Fallback to department owner / team lead
            var dept = await _context.Departments.Include(d => d.Owner).FirstOrDefaultAsync(d => d.Id == departmentId, ct);
            return dept?.Owner;
        }

        // 2. Filter by status: prefer Available, then Busy (with capacity), then any
        var onlineUsers = allUsers
            .Where(u => u.Status == UserStatus.Available || u.Status == UserStatus.Busy)
            .OrderBy(u => u.Id)
            .ToList();

        var candidates = onlineUsers.Any() ? onlineUsers : allUsers.OrderBy(u => u.Id).ToList();

        // 3. Pointer-based circular rotation
        var pointer = await _context.TeamAssignmentPointers
            .FirstOrDefaultAsync(p => p.DepartmentId == departmentId, ct);

        User selectedUser;

        if (pointer == null)
        {
            selectedUser = candidates.First();
            _context.TeamAssignmentPointers.Add(new TeamAssignmentPointer
            {
                DepartmentId = departmentId,
                LastAssignedUserId = selectedUser.Id,
                LastAssignedAt = DateTime.UtcNow
            });
        }
        else
        {
            var currentIndex = candidates.FindIndex(u => u.Id == pointer.LastAssignedUserId);
            var nextIndex = currentIndex >= 0 ? (currentIndex + 1) % candidates.Count : 0;
            selectedUser = candidates[nextIndex];

            pointer.LastAssignedUserId = selectedUser.Id;
            pointer.LastAssignedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync(ct);
        return selectedUser;
    }
}
