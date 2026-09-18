namespace CaseManagement.Api.Models;

public class LookupValue : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LookupTypeId { get; set; }
    public string TypeCode { get; set; } = string.Empty; // Redundant code for easy indexing & querying
    public string Value { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int DisplayOrder { get; set; } = 0;
    public bool IsActive { get; set; } = true;

    public LookupType? LookupType { get; set; }
}
