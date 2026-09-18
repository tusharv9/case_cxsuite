namespace CaseManagement.Api.Models;

public class DepartmentEscalationTemplate : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    public string EscalationReason { get; set; } = string.Empty; // e.g. "Regulatory / BNM", "SLA Breach", "Fraud Risk"
    public string SubjectTemplate { get; set; } = string.Empty;
    public string BodyTemplate { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
