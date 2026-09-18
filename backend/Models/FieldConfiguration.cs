namespace CaseManagement.Api.Models;

public class FieldConfiguration : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public string ModuleKey { get; set; } = "Customer360"; // e.g., Customer360, CaseManagement
    public string SectionKey { get; set; } = "AddNewCustomer"; // e.g., AddNewCustomer, ExistingCustomer, Filters
    
    public string ApiField { get; set; } = string.Empty; // e.g. customerName, birthDate, preferredLanguage
    public string DisplayLabel { get; set; } = string.Empty;
    
    public bool IsVisible { get; set; } = true;
    public bool IsRequired { get; set; } = false;
    public bool IsEditable { get; set; } = true;
    public bool IsSensitive { get; set; } = false;
    
    public string MaskingRule { get; set; } = "None"; // None, FullMask, HideMiddle, HideFirstShowLast
    public int VisibleChars { get; set; } = 4;
    public int DisplayOrder { get; set; } = 0;
    
    public string FieldType { get; set; } = "Text"; // Text, Number, Date, Email, Phone, Dropdown, Checkbox
    public string? ValidationRegex { get; set; }
    public int? MinLength { get; set; }
    public int? MaxLength { get; set; }
    
    public string? LookupTypeCode { get; set; } // Reference code for LookupType options if FieldType is Dropdown
    public bool IsCustomField { get; set; } = false; // True if created via "+ ADD NEW FIELD"
}
