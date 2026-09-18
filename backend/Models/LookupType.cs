namespace CaseManagement.Api.Models;

public class LookupType : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = string.Empty; // e.g. PREFERRED_LANGUAGE, HOME_BRANCH, ID_TYPE
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    public ICollection<LookupValue> Values { get; set; } = new List<LookupValue>();
}
