namespace CaseManagement.Api.DTOs;

public class TeamDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Function { get; set; } = string.Empty;
    public string Channels { get; set; } = "Voice,Chat,Email";
    
    public Guid? TeamLeadId { get; set; }
    public string TeamLeadName { get; set; } = string.Empty;
    public string TeamLeadEmail { get; set; } = string.Empty;
    
    public int MemberCount { get; set; }
    public int QueueCount { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    
    public List<TeamMemberDto> Members { get; set; } = new();
}

public class TeamMemberDto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Status { get; set; } = "Available";
    public bool IsLead { get; set; }
    public string PrimaryChannel { get; set; } = "Voice";
}

public class CreateTeamDto
{
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public string Function { get; set; } = string.Empty;
    public Guid? TeamLeadId { get; set; }
    public string Channels { get; set; } = "Voice,Chat,Email";
    public bool IsActive { get; set; } = true;
    public List<Guid>? MemberUserIds { get; set; }
}

public class UpdateTeamDto
{
    public string? Name { get; set; }
    public string? Code { get; set; }
    public string? Function { get; set; }
    public Guid? TeamLeadId { get; set; }
    public string? Channels { get; set; }
    public bool? IsActive { get; set; }
    public List<Guid>? MemberUserIds { get; set; }
}

public class AddTeamMemberDto
{
    public Guid UserId { get; set; }
    public string? MemberRole { get; set; }
    public string? PrimaryChannel { get; set; }
}
