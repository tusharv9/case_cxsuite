namespace CaseManagement.Api.Models;

using Microsoft.EntityFrameworkCore;

[Index(nameof(CategoryName), IsUnique = true)]
public class PriorityCategoryMapping : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PrioritySlaRuleId { get; set; }
    public PrioritySlaRule PrioritySlaRule { get; set; } = null!;

    public string Priority { get; set; } = string.Empty; // e.g. "Critical", "High", "Medium", "Low"
    public string CategoryName { get; set; } = string.Empty; // Maps to DepartmentSubCategory.Name / Case.Subcategory

    public Guid? DepartmentSubCategoryId { get; set; }
    public DepartmentSubCategory? DepartmentSubCategory { get; set; }
}
