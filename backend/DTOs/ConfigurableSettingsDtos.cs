namespace CaseManagement.Api.DTOs;

public class FieldConfigurationDto
{
    public Guid Id { get; set; }
    public string ModuleKey { get; set; } = "Customer360";
    public string SectionKey { get; set; } = "AddNewCustomer";
    public string ApiField { get; set; } = string.Empty;
    public string DisplayLabel { get; set; } = string.Empty;
    public bool IsVisible { get; set; } = true;
    public bool IsRequired { get; set; } = false;
    public bool IsEditable { get; set; } = true;
    public bool IsSensitive { get; set; } = false;
    public string MaskingRule { get; set; } = "None";
    public int VisibleChars { get; set; } = 4;
    public int DisplayOrder { get; set; } = 0;
    public string FieldType { get; set; } = "Text";
    public string? ValidationRegex { get; set; }
    public int? MinLength { get; set; }
    public int? MaxLength { get; set; }
    public string? LookupTypeCode { get; set; }
    public bool IsCustomField { get; set; } = false;
}

public class UpdateFieldConfigurationsRequest
{
    public string ModuleKey { get; set; } = "Customer360";
    public string SectionKey { get; set; } = "AddNewCustomer";
    public List<FieldConfigurationDto> Fields { get; set; } = new();
}

public class CreateCustomFieldDto
{
    public string ModuleKey { get; set; } = "Customer360";
    public string SectionKey { get; set; } = "AddNewCustomer";
    public string ApiField { get; set; } = string.Empty;
    public string DisplayLabel { get; set; } = string.Empty;
    public string FieldType { get; set; } = "Text"; // Text, Dropdown, Date, Phone, Number, etc.
    public bool IsVisible { get; set; } = true;
    public bool IsRequired { get; set; } = false;
    public bool IsEditable { get; set; } = true;
    public bool IsSensitive { get; set; } = false;
    public string MaskingRule { get; set; } = "None";
    public int VisibleChars { get; set; } = 4;
    public int DisplayOrder { get; set; } = 0;
    public string? LookupTypeCode { get; set; }
}

public class LookupValueDto
{
    public Guid Id { get; set; }
    public Guid LookupTypeId { get; set; }
    public string TypeCode { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int DisplayOrder { get; set; } = 0;
    public bool IsActive { get; set; } = true;
}

public class CreateLookupValueDto
{
    public string TypeCode { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int DisplayOrder { get; set; } = 0;
}

public class UpdateLookupValueDto
{
    public string Value { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int DisplayOrder { get; set; } = 0;
    public bool IsActive { get; set; } = true;
}

public class CustomerCustomAttributeDto
{
    public string FieldKey { get; set; } = string.Empty;
    public string FieldValue { get; set; } = string.Empty;
}

public class CreateCaseTypeConfigDto
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Prefix { get; set; } = "C-";
    public int DisplayOrder { get; set; } = 1;
}

public class CreateDepartmentSubCategoryDto
{
    public Guid DepartmentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public int DisplayOrder { get; set; } = 1;
}

public class CreateOrUpdateSlaDto
{
    public string Severity { get; set; } = string.Empty;
    public int InternalHours { get; set; }
    public int ExternalHours { get; set; }
}

public class CreateOrUpdateEscalationTemplateDto
{
    public Guid DepartmentId { get; set; }
    public string EscalationReason { get; set; } = string.Empty;
    public string SubjectTemplate { get; set; } = string.Empty;
    public string BodyTemplate { get; set; } = string.Empty;
}

public class UpdateCaseTypeConfigDto
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Prefix { get; set; } = "C-";
    public int DisplayOrder { get; set; } = 1;
    public bool IsActive { get; set; } = true;
}

public class UpdateDepartmentSubCategoryDto
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public int DisplayOrder { get; set; } = 1;
    public bool IsActive { get; set; } = true;
}

/// <summary>Payload for editing a single configurable field from the Edit drawer.</summary>
public class UpdateFieldConfigurationDto
{
    public string DisplayLabel { get; set; } = string.Empty;
    public string FieldType { get; set; } = "Text";
    public bool IsVisible { get; set; } = true;
    public bool IsRequired { get; set; } = false;
    public bool IsEditable { get; set; } = true;
    public bool IsSensitive { get; set; } = false;
    public string MaskingRule { get; set; } = "None";
    public int VisibleChars { get; set; } = 4;
    public int DisplayOrder { get; set; } = 0;
    public string? LookupTypeCode { get; set; }
}

/// <summary>
/// A severity is master data (a CASE_SEVERITY lookup value) plus its SLA row, so both are
/// created/updated/removed together and the two never drift apart.
/// </summary>
public class SeverityDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public int InternalHours { get; set; }
    public int ExternalHours { get; set; }
    public bool IsSystem { get; set; }
    public int CasesUsing { get; set; }
    public bool IsActive { get; set; } = true;
}

public class CreateSeverityDto
{
    public string Name { get; set; } = string.Empty;
    public int InternalHours { get; set; } = 22;
    public int ExternalHours { get; set; } = 24;
    public int DisplayOrder { get; set; } = 0;
}

public class UpdateSeverityDto
{
    public string Name { get; set; } = string.Empty;
    public int DisplayOrder { get; set; } = 0;
    public bool IsActive { get; set; } = true;
}

public class UpdateDepartmentDto
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
