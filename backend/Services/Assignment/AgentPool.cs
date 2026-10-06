namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

public sealed record AgentCandidate(User User, int OpenCases);

public enum NoAgentReason { None, NoMembers, NoneOnline, AllAtCapacity }

/// <summary>
/// Who can take a team's next case, and why nobody can when nobody can.
/// Eligible = an ACTIVE member of the team who is marked assignable, whose Host account is active, who is Available or
/// Busy right now, and who has fewer open cases than the team's capacity. Membership (TeamMembers) is the only source —
/// a user's "home department" no longer makes them eligible, so removing someone from a team really removes them.
/// </summary>
public sealed record AgentPool(IReadOnlyList<AgentCandidate> Eligible, NoAgentReason Reason, int Members, int Online)
{
    public string Describe(string teamName) => Reason switch
    {
        NoAgentReason.NoMembers => $"'{teamName}' has no active members who receive cases.",
        NoAgentReason.NoneOnline => $"None of the {Members} agent(s) in '{teamName}' is available right now.",
        NoAgentReason.AllAtCapacity => $"All {Online} available agent(s) in '{teamName}' are at capacity.",
        _ => string.Empty,
    };
}

public interface IAgentPoolService
{
    Task<AgentPool> GetAsync(Guid departmentId, int capacity, CancellationToken ct = default);
}

public class AgentPoolService : IAgentPoolService
{
    private readonly AppDbContext _context;

    public AgentPoolService(AppDbContext context) => _context = context;

    public async Task<AgentPool> GetAsync(Guid departmentId, int capacity, CancellationToken ct = default)
    {
        var members = await _context.TeamMembers.AsNoTracking()
            .Where(m => m.DepartmentId == departmentId && m.IsActive && m.IsAssignable && m.User.IsActive)
            .Select(m => m.User)
            .ToListAsync(ct);

        if (members.Count == 0) return new AgentPool(Array.Empty<AgentCandidate>(), NoAgentReason.NoMembers, 0, 0);

        var online = members.Where(u => u.Status is UserStatus.Available or UserStatus.Busy).ToList();
        if (online.Count == 0) return new AgentPool(Array.Empty<AgentCandidate>(), NoAgentReason.NoneOnline, members.Count, 0);

        var ids = online.Select(u => u.Id).ToList();
        var open = await _context.Cases.AsNoTracking()
            .Where(c => ids.Contains(c.OwnerId) && c.Status != CaseStatus.Resolved && c.Status != CaseStatus.Closed && c.Status != CaseStatus.Cancelled)
            .GroupBy(c => c.OwnerId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, ct);

        var eligible = online
            .Select(u => new AgentCandidate(u, open.GetValueOrDefault(u.Id)))
            .Where(c => c.OpenCases < capacity)
            .OrderBy(c => c.User.Id)
            .ToList();

        return new AgentPool(eligible, eligible.Count == 0 ? NoAgentReason.AllAtCapacity : NoAgentReason.None, members.Count, online.Count);
    }
}
