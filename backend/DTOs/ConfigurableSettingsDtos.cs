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

    /// <summary>Read-only: the field is mandatory for the system to work, so "Required" cannot be turned off.</summary>
    public bool IsSystemRequired { get; set; } = false;
    public bool IsEditable { get; set; } = true;
    public bool IsSensitive { get; set; } = false;
    public string MaskingRule { get; set; } = "None";
    public int VisibleChars { get; set; } = 4;
    public int DisplayOrder { get; set; } = 0;
    public string FieldType { get; set; } = "Text";
    public string? ValidationRegex { get; set; }
    public string? ValidationMessage { get; set; }
    public int? MinLength { get; set; }
    public int? MaxLength { get; set; }
    public string? LookupTypeCode { get; set; }
    public bool IsCustomField { get; set; } = false;

    public static FieldConfigurationDto From(CaseManagement.Api.Models.FieldConfiguration entity) => new()
    {
        Id = entity.Id,
        ModuleKey = entity.ModuleKey,
        SectionKey = entity.SectionKey,
        ApiField = entity.ApiField,
        DisplayLabel = entity.DisplayLabel,
        IsVisible = entity.IsVisible || entity.IsSystemRequired,
        IsRequired = entity.IsRequired || entity.IsSystemRequired,
        IsSystemRequired = entity.IsSystemRequired,
        IsEditable = entity.IsEditable,
        IsSensitive = entity.IsSensitive,
        MaskingRule = entity.MaskingRule,
        VisibleChars = entity.VisibleChars,
        DisplayOrder = entity.DisplayOrder,
        FieldType = entity.FieldType,
        ValidationRegex = entity.ValidationRegex,
        ValidationMessage = entity.ValidationMessage,
        MinLength = entity.MinLength,
        MaxLength = entity.MaxLength,
        LookupTypeCode = entity.LookupTypeCode,
        IsCustomField = entity.IsCustomField
    };
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
    public string? ValidationRegex { get; set; }
    public string? ValidationMessage { get; set; }
    public int? MinLength { get; set; }
    public int? MaxLength { get; set; }
}

public class LookupTypeDto
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
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
    public string? ValidationRegex { get; set; }
    public string? ValidationMessage { get; set; }
    public int? MinLength { get; set; }
    public int? MaxLength { get; set; }
}

/// <summary>
/// A priority ("severity") as shown on the Settings screen. It is a view over one PrioritySlaRule row — the same
/// row the Cases SLA & Routing screen edits — so the two screens can never disagree.
/// </summary>
public class SeverityDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
    public int InternalHours { get; set; }
    public int ExternalHours { get; set; }
    public int FirstResponseMinutes { get; set; } = 240;
    public bool IsSystem { get; set; }
    public int CasesUsing { get; set; }
    public bool IsActive { get; set; } = true;
}

public class CreateSeverityDto
{
    public string Name { get; set; } = string.Empty;
    public int InternalHours { get; set; } = 22;
    public int ExternalHours { get; set; } = 24;
    public int FirstResponseMinutes { get; set; } = 240;
    public int DisplayOrder { get; set; } = 0;
}

public class UpdateSeverityDto
{
    public string Name { get; set; } = string.Empty;
    public int DisplayOrder { get; set; } = 0;
    public int? InternalHours { get; set; }
    public int? ExternalHours { get; set; }
    public int? FirstResponseMinutes { get; set; }
    public bool IsActive { get; set; } = true;
}

public class UpdateDepartmentDto
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
