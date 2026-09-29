namespace CaseManagement.Api.Services.Strategies;

using CaseManagement.Api.Data;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

public class SkillBasedAssignmentStrategy : IAssignmentStrategy
{
    private readonly AppDbContext _context;

    public SkillBasedAssignmentStrategy(AppDbContext context)
    {
        _context = context;
    }

    public string AlgorithmName => "SkillBased";

    public async Task<User?> SelectEligibleAgentAsync(Guid departmentId, Case newCase, Customer? customer, int maxCapacity, CancellationToken ct = default)
    {
        // 1. Determine required skills based on case attributes
        var requiredSkills = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(newCase.SourceChannel))
            requiredSkills.Add(newCase.SourceChannel.Trim());

        if (!string.IsNullOrWhiteSpace(newCase.CommunicationChannel))
            requiredSkills.Add(newCase.CommunicationChannel.Trim());

        if (!string.IsNullOrWhiteSpace(newCase.CaseType))
            requiredSkills.Add(newCase.CaseType.Trim());

        if (customer != null && !string.IsNullOrWhiteSpace(customer.CustomerSegment))
            requiredSkills.Add(customer.CustomerSegment.Trim());

        if (!string.IsNullOrWhiteSpace(newCase.Title))
        {
            var titleLower = newCase.Title.ToLowerInvariant();
            if (titleLower.Contains("fraud") || titleLower.Contains("unauthorised") || titleLower.Contains("stolen"))
                requiredSkills.Add("Fraud");
            if (titleLower.Contains("loan") || titleLower.Contains("financing") || titleLower.Contains("asb"))
                requiredSkills.Add("Loans");
            if (titleLower.Contains("card") || titleLower.Contains("atm"))
                requiredSkills.Add("Cards");
        }

        // 2. Get eligible squad members
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

        var onlineUsers = allUsers
            .Where(u => u.Status == UserStatus.Available || u.Status == UserStatus.Busy)
            .ToList();

        var candidates = onlineUsers.Any() ? onlineUsers : allUsers;
        var candidateIds = candidates.Select(c => c.Id).ToList();

        // 3. Load skills for candidates
        var agentSkills = await _context.AgentSkills
            .AsNoTracking()
            .Where(s => candidateIds.Contains(s.UserId))
            .ToListAsync(ct);

        var skillsByUser = agentSkills
            .GroupBy(s => s.UserId)
            .ToDictionary(g => g.Key, g => g.ToList());

        // 4. Compute skill matching scores
        var scoredCandidates = candidates.Select(u =>
        {
            int score = 0;
            if (skillsByUser.TryGetValue(u.Id, out var userSkills))
            {
                foreach (var req in requiredSkills)
                {
                    var match = userSkills.FirstOrDefault(s => string.Equals(s.SkillName, req, StringComparison.OrdinalIgnoreCase) ||
                                                               req.Contains(s.SkillName, StringComparison.OrdinalIgnoreCase));
                    if (match != null)
                    {
                        score += match.ProficiencyLevel * 10;
                    }
                }
            }

            // Also check User.Role for keywords if skills table row wasn't explicitly populated
            if (score == 0 && !string.IsNullOrWhiteSpace(u.Role))
            {
                foreach (var req in requiredSkills)
                {
                    if (u.Role.Contains(req, StringComparison.OrdinalIgnoreCase))
                    {
                        score += 5;
                    }
                }
            }

            return new { User = u, Score = score };
        }).ToList();

        // If at least one candidate has matching skills, pick the highest score
        var bestMatches = scoredCandidates.Where(c => c.Score > 0).OrderByDescending(c => c.Score).ToList();

        if (bestMatches.Any())
        {
            var topScore = bestMatches.First().Score;
            var topTier = bestMatches.Where(c => c.Score == topScore).Select(c => c.User).ToList();
            
            // Prefer Available over Busy
            return topTier.OrderByDescending(u => u.Status == UserStatus.Available).ThenBy(u => u.Id).First();
        }

        // 5. Graceful fallback: return least occupied or available agent
        return candidates.OrderByDescending(u => u.Status == UserStatus.Available).ThenBy(u => u.Id).First();
    }
}
