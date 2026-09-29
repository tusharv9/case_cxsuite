namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

public class TeamService : ITeamService
{
    private readonly AppDbContext _context;

    public TeamService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<TeamDto>> GetTeamsAsync(CancellationToken ct = default)
    {
        var departments = await _context.Departments
            .AsNoTracking()
            .Include(d => d.Owner)
            .Include(d => d.Members)
                .ThenInclude(m => m.User)
            .Include(d => d.Cases)
            .Where(d => d.IsActive)
            .OrderBy(d => d.Name)
            .AsSplitQuery()
            .ToListAsync(ct);

        var result = new List<TeamDto>();

        foreach (var d in departments)
        {
            var openCasesCount = d.Cases.Count(c => c.Status != CaseStatus.Resolved && c.Status != CaseStatus.Closed);
            
            // Collect members: from TeamMembers joined table + any users whose DepartmentId is this dept
            var memberDict = new Dictionary<Guid, TeamMemberDto>();

            // First add Team Lead if assigned
            if (d.Owner != null)
            {
                memberDict[d.Owner.Id] = new TeamMemberDto
                {
                    Id = Guid.Empty,
                    UserId = d.Owner.Id,
                    Name = d.Owner.Name,
                    Email = d.Owner.Email,
                    Role = string.IsNullOrEmpty(d.Owner.Role) ? "Team Lead" : d.Owner.Role,
                    Status = d.Owner.Status.ToString(),
                    IsLead = true,
                    PrimaryChannel = "Voice"
                };
            }

            // Next add explicit TeamMembers
            foreach (var m in d.Members.Where(m => m.IsActive))
            {
                if (m.User != null)
                {
                    memberDict[m.User.Id] = new TeamMemberDto
                    {
                        Id = m.Id,
                        UserId = m.User.Id,
                        Name = m.User.Name,
                        Email = m.User.Email,
                        Role = !string.IsNullOrWhiteSpace(m.MemberRole) ? m.MemberRole : (string.IsNullOrWhiteSpace(m.User.Role) ? "Service Agent" : m.User.Role),
                        Status = m.User.Status.ToString(),
                        IsLead = d.OwnerId == m.User.Id,
                        PrimaryChannel = m.PrimaryChannel
                    };
                }
            }

            result.Add(new TeamDto
            {
                Id = d.Id,
                Name = d.Name,
                Code = d.Code,
                Function = string.IsNullOrEmpty(d.Function) ? "Operational Squad" : d.Function,
                Channels = string.IsNullOrEmpty(d.Channels) ? "Voice,Chat,Email" : d.Channels,
                TeamLeadId = d.OwnerId,
                TeamLeadName = d.Owner?.Name ?? "Unassigned",
                TeamLeadEmail = d.Owner?.Email ?? "",
                MemberCount = memberDict.Count,
                QueueCount = openCasesCount,
                CreatedAt = d.CreatedAt,
                Members = memberDict.Values.OrderByDescending(m => m.IsLead).ThenBy(m => m.Name).ToList()
            });
        }

        return result;
    }

    public async Task<TeamDto?> GetTeamByIdAsync(Guid id, CancellationToken ct = default)
    {
        var teams = await GetTeamsAsync(ct);
        return teams.FirstOrDefault(t => t.Id == id);
    }

    public async Task<TeamDto> CreateTeamAsync(CreateTeamDto dto, Guid currentUserId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            throw new InvalidOperationException("Team name is required.");

        var name = dto.Name.Trim();
        var code = !string.IsNullOrWhiteSpace(dto.Code) 
            ? dto.Code.Trim().ToUpperInvariant() 
            : GenerateTeamCode(name);

        if (await _context.Departments.AnyAsync(d => d.Name.ToLower() == name.ToLower() || d.Code.ToLower() == code.ToLower(), ct))
        {
            throw new InvalidOperationException($"A team or department with name '{name}' or code '{code}' already exists.");
        }

        var department = new Department
        {
            Id = Guid.NewGuid(),
            Name = name,
            Code = code,
            Function = dto.Function?.Trim() ?? "Operational Squad",
            Channels = !string.IsNullOrWhiteSpace(dto.Channels) ? dto.Channels.Trim() : "Voice,Chat,Email",
            OwnerId = dto.TeamLeadId,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _context.Departments.Add(department);

        // Add selected members if provided
        if (dto.MemberUserIds != null && dto.MemberUserIds.Any())
        {
            var distinctUserIds = dto.MemberUserIds.Distinct().ToList();
            var users = await _context.Users.Where(u => distinctUserIds.Contains(u.Id)).ToListAsync(ct);

            foreach (var user in users)
            {
                var role = user.Id == dto.TeamLeadId ? "Team Lead" : (string.IsNullOrWhiteSpace(user.Role) ? "Service Agent" : user.Role);
                _context.TeamMembers.Add(new TeamMember
                {
                    Id = Guid.NewGuid(),
                    DepartmentId = department.Id,
                    UserId = user.Id,
                    MemberRole = role,
                    PrimaryChannel = "Voice",
                    IsActive = true,
                    JoinedAt = DateTime.UtcNow
                });
            }
        }

        await RecordAuditLogAsync("CREATE", department.Name, $"Created team '{department.Name}'", null, JsonSerializer.Serialize(dto), currentUserId);

        await _context.SaveChangesAsync(ct);

        return (await GetTeamByIdAsync(department.Id, ct))!;
    }

    public async Task<TeamDto> UpdateTeamAsync(Guid id, UpdateTeamDto dto, Guid currentUserId, CancellationToken ct = default)
    {
        var department = await _context.Departments
            .Include(d => d.Members)
            .FirstOrDefaultAsync(d => d.Id == id, ct);

        if (department == null)
            throw new KeyNotFoundException($"Team with ID '{id}' was not found.");

        var oldState = JsonSerializer.Serialize(new { department.Name, department.Function, department.Channels, department.OwnerId });

        if (!string.IsNullOrWhiteSpace(dto.Name))
            department.Name = dto.Name.Trim();

        if (dto.Function != null)
            department.Function = dto.Function.Trim();

        if (dto.Channels != null)
            department.Channels = dto.Channels.Trim();

        if (dto.TeamLeadId.HasValue)
            department.OwnerId = dto.TeamLeadId.Value;

        department.UpdatedAt = DateTime.UtcNow;

        if (dto.MemberUserIds != null)
        {
            var distinctUserIds = dto.MemberUserIds.Distinct().ToList();
            // Remove existing members not in list
            var toRemove = department.Members.Where(m => !distinctUserIds.Contains(m.UserId)).ToList();
            _context.TeamMembers.RemoveRange(toRemove);

            // Add new members
            var existingUserIds = department.Members.Select(m => m.UserId).ToHashSet();
            var toAddUserIds = distinctUserIds.Where(uid => !existingUserIds.Contains(uid)).ToList();
            var usersToAdd = await _context.Users.Where(u => toAddUserIds.Contains(u.Id)).ToListAsync(ct);

            foreach (var user in usersToAdd)
            {
                _context.TeamMembers.Add(new TeamMember
                {
                    Id = Guid.NewGuid(),
                    DepartmentId = department.Id,
                    UserId = user.Id,
                    MemberRole = string.IsNullOrWhiteSpace(user.Role) ? "Service Agent" : user.Role,
                    PrimaryChannel = "Voice",
                    IsActive = true,
                    JoinedAt = DateTime.UtcNow
                });
            }
        }

        await RecordAuditLogAsync("UPDATE", department.Name, $"Updated team '{department.Name}'", oldState, JsonSerializer.Serialize(dto), currentUserId);

        await _context.SaveChangesAsync(ct);

        return (await GetTeamByIdAsync(department.Id, ct))!;
    }

    public async Task DeleteTeamAsync(Guid id, Guid currentUserId, CancellationToken ct = default)
    {
        var department = await _context.Departments
            .Include(d => d.Cases)
            .Include(d => d.Members)
            .AsSplitQuery()
            .FirstOrDefaultAsync(d => d.Id == id, ct);

        if (department == null)
            throw new KeyNotFoundException($"Team with ID '{id}' was not found.");

        var activeCasesCount = department.Cases.Count(c => c.Status != CaseStatus.Resolved && c.Status != CaseStatus.Closed);
        if (activeCasesCount > 0)
        {
            throw new InvalidOperationException($"Cannot delete team '{department.Name}' because it currently has {activeCasesCount} active cases in queue. Please reassign or close cases before deleting.");
        }

        _context.TeamMembers.RemoveRange(department.Members);
        _context.Departments.Remove(department);

        await RecordAuditLogAsync("DELETE", department.Name, $"Deleted team '{department.Name}'", department.Name, null, currentUserId);

        await _context.SaveChangesAsync(ct);
    }

    public async Task AddMemberAsync(Guid teamId, AddTeamMemberDto dto, Guid currentUserId, CancellationToken ct = default)
    {
        var exists = await _context.TeamMembers.AnyAsync(tm => tm.DepartmentId == teamId && tm.UserId == dto.UserId, ct);
        if (exists) return;

        var user = await _context.Users.FindAsync(new object[] { dto.UserId }, ct);
        if (user == null) throw new KeyNotFoundException("User not found.");

        _context.TeamMembers.Add(new TeamMember
        {
            Id = Guid.NewGuid(),
            DepartmentId = teamId,
            UserId = dto.UserId,
            MemberRole = !string.IsNullOrWhiteSpace(dto.MemberRole) ? dto.MemberRole : (string.IsNullOrWhiteSpace(user.Role) ? "Service Agent" : user.Role),
            PrimaryChannel = !string.IsNullOrWhiteSpace(dto.PrimaryChannel) ? dto.PrimaryChannel : "Voice",
            IsActive = true,
            JoinedAt = DateTime.UtcNow
        });

        await RecordAuditLogAsync("ADD_MEMBER", user.Name, $"Added member '{user.Name}' to team", null, dto.MemberRole, currentUserId);
        await _context.SaveChangesAsync(ct);
    }

    public async Task RemoveMemberAsync(Guid teamId, Guid userId, Guid currentUserId, CancellationToken ct = default)
    {
        var member = await _context.TeamMembers.FirstOrDefaultAsync(tm => tm.DepartmentId == teamId && tm.UserId == userId, ct);
        if (member != null)
        {
            _context.TeamMembers.Remove(member);
            await RecordAuditLogAsync("REMOVE_MEMBER", userId.ToString(), "Removed member from team", null, null, currentUserId);
            await _context.SaveChangesAsync(ct);
        }
    }

    private string GenerateTeamCode(string name)
    {
        var words = name.Split(new[] { ' ', '-', '_' }, StringSplitOptions.RemoveEmptyEntries);
        if (words.Length == 1)
        {
            return words[0].Length >= 3 ? words[0].Substring(0, 3).ToUpperInvariant() : words[0].ToUpperInvariant() + "T";
        }
        var initials = string.Concat(words.Select(w => w[0])).ToUpperInvariant();
        return initials.Length > 5 ? initials.Substring(0, 5) : initials;
    }

    private async Task RecordAuditLogAsync(string actionType, string entityName, string description, string? oldValue, string? newValue, Guid userId)
    {
        try
        {
            var audit = new CaseEvent
            {
                Id = Guid.NewGuid(),
                CaseId = null,
                EventType = EventType.Other,
                Message = description,
                CreatedAt = DateTime.UtcNow,
                UserId = userId != Guid.Empty ? userId : Guid.Empty,
                Module = "Teams",
                EntityName = entityName,
                ActionType = actionType,
                OldValue = oldValue,
                NewValue = newValue
            };

            _context.CaseEvents.Add(audit);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[TeamAuditLog Error] {ex.Message}");
        }
    }
}
