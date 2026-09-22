namespace CaseManagement.Api.Models;

using Microsoft.EntityFrameworkCore;

[Index(nameof(Severity), IsUnique = true)]
public class SlaConfiguration : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Severity { get; set; } = string.Empty; // e.g. "Low", "Medium", "High", "Critical", "Urgent"
    public int InternalHours { get; set; }
    public int ExternalHours { get; set; }
    public int FirstResponseMinutes { get; set; } = 240; // Critical: 30, High: 60, Medium: 240, Low: 480
    public bool IsActive { get; set; } = true;
}
