namespace CaseManagement.Api.Models;

public class DepartmentSubCategory : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;

    public string Name { get; set; } = string.Empty; // e.g. "Personal Loan", "General Inquiry"
    public string Code { get; set; } = string.Empty;
    public int DisplayOrder { get; set; } = 1;
    public bool IsActive { get; set; } = true;
}
