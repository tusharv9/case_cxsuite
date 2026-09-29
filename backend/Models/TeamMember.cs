namespace CaseManagement.Api.Models;

public class TeamMember : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
    
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    
    public string MemberRole { get; set; } = "Service Agent"; // e.g. "Service Agent — Voice/Chat", "Lead"
    public string PrimaryChannel { get; set; } = "Voice";
    public bool IsActive { get; set; } = true;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}
