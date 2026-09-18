namespace CaseManagement.Api.Models;

using Microsoft.EntityFrameworkCore;

[Index(nameof(Email), IsUnique = true)]
public class User : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty; // e.g. "Micro-Finance Officer", "Sr. CC Agent", "Supervisor"
    
    public UserStatus Status { get; set; } = UserStatus.Available;
    
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
}
