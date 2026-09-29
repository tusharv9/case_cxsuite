namespace CaseManagement.Api.Models;

using Microsoft.EntityFrameworkCore;

[Index(nameof(Priority), IsUnique = true)]
public class PrioritySlaRule : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Priority { get; set; } = string.Empty; // Fixed: Critical, High, Medium, Low

    // First Response SLA
    public int FirstResponseValue { get; set; } = 30;
    public string FirstResponseUnit { get; set; } = "Minutes"; // "Minutes" | "Hours"
    public int FirstResponseMinutes { get; set; } = 30;

    // Internal Resolution SLA
    public int InternalResolutionValue { get; set; } = 2;
    public string InternalResolutionUnit { get; set; } = "Hours"; // "Minutes" | "Hours"
    public int InternalResolutionMinutes { get; set; } = 120;

    // External Resolution SLA
    public int ExternalResolutionValue { get; set; } = 4;
    public string ExternalResolutionUnit { get; set; } = "Hours"; // "Minutes" | "Hours"
    public int ExternalResolutionMinutes { get; set; } = 240;

    public int Version { get; set; } = 1;

    public ICollection<PriorityCategoryMapping> CategoryMappings { get; set; } = new List<PriorityCategoryMapping>();
}
