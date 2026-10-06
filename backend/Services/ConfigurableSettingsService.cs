namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Repositories;
using Microsoft.EntityFrameworkCore;

public class ConfigurableSettingsService : IConfigurableSettingsService
{
    private const int MaxSlaHours = 8760; // one year

    private readonly IConfigurableSettingsRepository _repository;
    private readonly AppDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public ConfigurableSettingsService(IConfigurableSettingsRepository repository, AppDbContext context, INotificationService notificationService, IHttpContextAccessor httpContextAccessor)
    {
        _repository = repository;
        _context = context;
        _notificationService = notificationService;
        _httpContextAccessor = httpContextAccessor;
    }

    /// <summary>The user making the current request (set by UserAuthorizationMiddleware).</summary>
    private Guid? CurrentUserId =>
        _httpContextAccessor.HttpContext?.Items.TryGetValue("UserId", out var value) == true && value is Guid id ? id : null;

    private async Task RecordAuditLogAsync(string actionType, string entityName, string description, string? oldValue, string? newValue, CancellationToken ct)
    {
        try
        {
            // The audit row names the person who made the change.
            var userId = CurrentUserId;
            if (userId is null)
            {
                Console.WriteLine($"[ConfigAuditLog] Skipped '{entityName}': no acting user on the request.");
                return;
            }

            var audit = new CaseEvent
            {
                Id = Guid.NewGuid(),
                CaseId = null,
                EventType = EventType.Other,
                Message = description,
                CreatedAt = DateTime.UtcNow,
                UserId = userId.Value,
                Module = "Configurable Settings",
                EntityName = entityName,
                ActionType = actionType,
                OldValue = oldValue,
                NewValue = newValue
            };

            _context.CaseEvents.Add(audit);
            await _context.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ConfigAuditLog Error] {ex.Message}");
        }
    }

    /// <summary>Built-in field keys of the Create Case and Add Customer forms; a custom field may not reuse them.</summary>
    private static readonly HashSet<string> ReservedFieldKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "caseType", "title", "description", "selectCustomer", "departmentId", "subCategory", "severity", "sourceChannel",
        "preferredLanguage", "preferredCommunicationChannel", "communicationChannel", "customerId",
        "fullName", "idType", "idValue", "nric", "passport", "accountNumber", "dateOfBirth", "phoneNumber", "email", "branch", "customerSegment"
    };

    private static readonly string[] AllowedFieldTypes = { "Text", "Number", "Date", "Email", "Phone", "Dropdown", "Checkbox" };

    /// <summary>
    /// Rejects field metadata the validation engine could not honour, at SAVE time — so a typo in a pattern is an
    /// immediate, clear error for the administrator instead of a silently ignored rule later.
    /// </summary>
    private async Task ValidateFieldMetadataAsync(string label, string fieldType, string? regex, int? minLength, int? maxLength, string? lookupTypeCode, bool visible, CancellationToken ct)
    {
        if (!AllowedFieldTypes.Contains(fieldType ?? string.Empty, StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException($"'{fieldType}' is not a valid field type for '{label}'. Valid types: {string.Join(", ", AllowedFieldTypes)}.");
        if (minLength is < 0 || maxLength is < 0)
            throw new InvalidOperationException($"Length limits for '{label}' cannot be negative.");
        if (minLength.HasValue && maxLength.HasValue && minLength > maxLength)
            throw new InvalidOperationException($"Minimum length for '{label}' cannot be greater than its maximum length.");
        if (!string.IsNullOrWhiteSpace(regex))
        {
            try { _ = new System.Text.RegularExpressions.Regex(regex, System.Text.RegularExpressions.RegexOptions.None, TimeSpan.FromMilliseconds(250)); }
            catch (ArgumentException ex) { throw new InvalidOperationException($"The validation pattern for '{label}' is not a valid regular expression: {ex.Message}"); }
        }
        if (string.Equals(fieldType, "Dropdown", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(lookupTypeCode))
        {
            var known = await _context.LookupTypes.AsNoTracking().AnyAsync(t => t.Code == lookupTypeCode, ct);
            if (!known) throw new InvalidOperationException($"The list '{lookupTypeCode}' chosen for '{label}' does not exist.");
        }
    }

    public async Task<IEnumerable<FieldConfigurationDto>> GetFieldConfigurationsAsync(string moduleKey, string? sectionKey = null, CancellationToken ct = default)
    {
        var fields = await _repository.GetFieldConfigurationsAsync(moduleKey, sectionKey, ct);
        return fields.Select(MapToDto);
    }

    public async Task SaveFieldConfigurationsAsync(string moduleKey, string sectionKey, IEnumerable<FieldConfigurationDto> fields, CancellationToken ct = default)
    {
        foreach (var dto in fields)
            await ValidateFieldMetadataAsync(dto.DisplayLabel, dto.FieldType, dto.ValidationRegex, dto.MinLength, dto.MaxLength, dto.LookupTypeCode, dto.IsVisible, ct);

        var entities = fields.Select(dto => MapToEntity(dto, moduleKey, sectionKey));
        await _repository.SaveFieldConfigurationsAsync(moduleKey, sectionKey, entities, ct);
        await RecordAuditLogAsync("UPDATE", $"Section Fields: {sectionKey}", $"Saved field configurations layout for {sectionKey}", null, $"{fields.Count()} fields updated", ct);
    }

    public async Task<FieldConfigurationDto> AddCustomFieldAsync(CreateCustomFieldDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.DisplayLabel))
            throw new InvalidOperationException("A field needs a display label.");
        await ValidateFieldMetadataAsync(dto.DisplayLabel, dto.FieldType, dto.ValidationRegex, dto.MinLength, dto.MaxLength, dto.LookupTypeCode, dto.IsVisible, ct);

        var entity = new FieldConfiguration
        {
            ModuleKey = string.IsNullOrWhiteSpace(dto.ModuleKey) ? "Customer360" : dto.ModuleKey,
            SectionKey = string.IsNullOrWhiteSpace(dto.SectionKey) ? "AddNewCustomer" : dto.SectionKey,
            ApiField = string.IsNullOrWhiteSpace(dto.ApiField) ? SanitizeApiField(dto.DisplayLabel) : dto.ApiField,
            DisplayLabel = dto.DisplayLabel,
            FieldType = dto.FieldType,
            IsVisible = dto.IsVisible,
            IsRequired = dto.IsRequired,
            IsEditable = dto.IsEditable,
            IsSensitive = dto.IsSensitive,
            MaskingRule = dto.MaskingRule,
            VisibleChars = dto.VisibleChars,
            DisplayOrder = dto.DisplayOrder,
            LookupTypeCode = string.IsNullOrWhiteSpace(dto.LookupTypeCode) ? null : dto.LookupTypeCode,
            ValidationRegex = string.IsNullOrWhiteSpace(dto.ValidationRegex) ? null : dto.ValidationRegex,
            ValidationMessage = string.IsNullOrWhiteSpace(dto.ValidationMessage) ? null : dto.ValidationMessage.Trim(),
            MinLength = dto.MinLength,
            MaxLength = dto.MaxLength,
            IsCustomField = true
        };

        // The key becomes a property name in API payloads and a column value key: keep it a plain identifier, and
        // never let it shadow one of the form's built-in fields.
        if (!System.Text.RegularExpressions.Regex.IsMatch(entity.ApiField, @"^[A-Za-z][A-Za-z0-9_]{0,49}$"))
            throw new InvalidOperationException($"'{entity.ApiField}' is not a valid field key. Use letters, digits and underscores, starting with a letter (max 50).");
        if (ReservedFieldKeys.Contains(entity.ApiField))
            throw new InvalidOperationException($"'{entity.ApiField}' is a built-in field name and cannot be used for a custom field.");

        if (await _repository.FieldExistsAsync(entity.ModuleKey, entity.SectionKey, entity.ApiField, null, ct))
        {
            throw new InvalidOperationException($"A field with the key '{entity.ApiField}' already exists in this section.");
        }

        var created = await _repository.AddFieldConfigurationAsync(entity, ct);
        await RecordAuditLogAsync("CREATE", $"Field: {created.DisplayLabel}", $"Created custom configurable field '{created.DisplayLabel}' ({created.ApiField}) in section {created.SectionKey}", null, $"Label: {created.DisplayLabel}, Type: {created.FieldType}, Section: {created.SectionKey}", ct);
        return MapToDto(created);
    }

    public async Task<FieldConfigurationDto?> UpdateFieldConfigurationAsync(Guid id, UpdateFieldConfigurationDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.DisplayLabel))
            throw new InvalidOperationException("Display label is required.");

        var fieldType = string.IsNullOrWhiteSpace(dto.FieldType) ? "Text" : dto.FieldType;
        await ValidateFieldMetadataAsync(dto.DisplayLabel, fieldType, dto.ValidationRegex, dto.MinLength, dto.MaxLength, dto.LookupTypeCode, dto.IsVisible, ct);

        // Looked up by id alone: the old code searched only the Customer360 module, so the audit "before" value
        // was missing for every other module.
        var existing = await _repository.GetFieldConfigurationAsync(id, ct);
        var oldVal = existing != null ? $"Label: {existing.DisplayLabel}, Type: {existing.FieldType}, Visible: {existing.IsVisible}, Required: {existing.IsRequired}, Masking: {existing.MaskingRule}" : null;

        var entity = new FieldConfiguration
        {
            DisplayLabel = dto.DisplayLabel.Trim(),
            FieldType = fieldType,
            IsVisible = dto.IsVisible,
            IsRequired = dto.IsRequired,
            IsEditable = dto.IsEditable,
            IsSensitive = dto.IsSensitive,
            MaskingRule = string.IsNullOrWhiteSpace(dto.MaskingRule) ? "None" : dto.MaskingRule,
            VisibleChars = dto.VisibleChars < 0 ? 0 : dto.VisibleChars,
            DisplayOrder = dto.DisplayOrder,
            LookupTypeCode = string.IsNullOrWhiteSpace(dto.LookupTypeCode) ? null : dto.LookupTypeCode,
            ValidationRegex = string.IsNullOrWhiteSpace(dto.ValidationRegex) ? null : dto.ValidationRegex,
            ValidationMessage = string.IsNullOrWhiteSpace(dto.ValidationMessage) ? null : dto.ValidationMessage.Trim(),
            MinLength = dto.MinLength,
            MaxLength = dto.MaxLength
        };

        var updated = await _repository.UpdateFieldConfigurationAsync(id, entity, ct);
        if (updated != null)
        {
            var newVal = $"Label: {updated.DisplayLabel}, Type: {updated.FieldType}, Visible: {updated.IsVisible}, Required: {updated.IsRequired}, Masking: {updated.MaskingRule}";
            await RecordAuditLogAsync("UPDATE", $"Field: {updated.DisplayLabel}", $"Updated field configuration '{updated.DisplayLabel}'", oldVal, newVal, ct);
        }
        return updated == null ? null : MapToDto(updated);
    }

    public async Task<bool> DeleteFieldConfigurationAsync(Guid id, CancellationToken ct = default)
    {
        var existing = await _repository.GetFieldConfigurationAsync(id, ct);
        if (existing is { IsSystemRequired: true })
            throw new InvalidOperationException($"'{existing.DisplayLabel}' is a built-in field the system needs and cannot be deleted.");
        var oldVal = existing != null ? $"Label: {existing.DisplayLabel}, ApiField: {existing.ApiField}, Section: {existing.SectionKey}, Type: {existing.FieldType}" : $"ID: {id}";
        var fieldName = existing?.DisplayLabel ?? "Field";

        var success = await _repository.DeleteFieldConfigurationAsync(id, ct);
        if (success)
        {
            await RecordAuditLogAsync("DELETE", $"Field: {fieldName}", $"Deleted configurable field '{fieldName}'", oldVal, null, ct);
        }
        return success;
    }

    public async Task<IEnumerable<LookupTypeDto>> GetLookupTypesAsync(CancellationToken ct = default)
    {
        var types = await _context.LookupTypes.AsNoTracking().OrderBy(t => t.Name).ToListAsync(ct);
        return types.Select(t => new LookupTypeDto { Code = t.Code, Name = t.Name, Description = t.Description });
    }

    public async Task<IEnumerable<LookupValueDto>> GetLookupValuesAsync(string typeCode, bool activeOnly = true, CancellationToken ct = default)
    {
        var values = await _repository.GetLookupValuesAsync(typeCode, activeOnly, ct);
        return values.Select(MapLookupDto);
    }

    public async Task<LookupValueDto> AddLookupValueAsync(CreateLookupValueDto dto, CancellationToken ct = default)
    {
        var entity = new LookupValue
        {
            TypeCode = dto.TypeCode,
            Value = dto.Value.Trim(),
            Label = string.IsNullOrWhiteSpace(dto.Label) ? dto.Value.Trim() : dto.Label.Trim(),
            DisplayOrder = dto.DisplayOrder,
            IsActive = true
        };

        if (string.IsNullOrWhiteSpace(entity.Value))
            throw new InvalidOperationException("Value is required.");

        if (await _repository.LookupValueExistsAsync(entity.TypeCode, entity.Value, null, ct))
            throw new InvalidOperationException($"'{entity.Value}' already exists in this list.");

        var created = await _repository.AddLookupValueAsync(entity, ct);
        await RecordAuditLogAsync("CREATE", $"Lookup: {created.Label} ({created.TypeCode})", $"Added lookup item '{created.Label}' for category '{created.TypeCode}'", null, $"Value: {created.Value}, TypeCode: {created.TypeCode}", ct);
        return MapLookupDto(created);
    }

    public async Task<LookupValueDto?> UpdateLookupValueAsync(Guid id, UpdateLookupValueDto dto, CancellationToken ct = default)
    {
        var entity = new LookupValue
        {
            Value = dto.Value.Trim(),
            Label = string.IsNullOrWhiteSpace(dto.Label) ? dto.Value.Trim() : dto.Label.Trim(),
            DisplayOrder = dto.DisplayOrder,
            IsActive = dto.IsActive
        };

        var current = await _repository.GetLookupValueAsync(id, ct);
        if (current == null) return null;

        var oldVal = $"Label: {current.Label}, Value: {current.Value}, Active: {current.IsActive}";

        if (await _repository.LookupValueExistsAsync(current.TypeCode, entity.Value, id, ct))
            throw new InvalidOperationException($"'{entity.Value}' already exists in this list.");

        var updated = await _repository.UpdateLookupValueAsync(id, entity, ct);
        if (updated != null)
        {
            var newVal = $"Label: {updated.Label}, Value: {updated.Value}, Active: {updated.IsActive}";
            await RecordAuditLogAsync("UPDATE", $"Lookup: {updated.Label} ({updated.TypeCode})", $"Updated lookup item '{updated.Label}' for category '{updated.TypeCode}'", oldVal, newVal, ct);
        }
        return updated == null ? null : MapLookupDto(updated);
    }

    public async Task<bool> DeleteLookupValueAsync(Guid id, CancellationToken ct = default)
    {
        var existing = await _repository.GetLookupValueAsync(id, ct);
        var oldVal = existing != null ? $"Label: {existing.Label}, Value: {existing.Value}, TypeCode: {existing.TypeCode}" : $"ID: {id}";
        var label = existing?.Label ?? existing?.Value ?? "Lookup Item";

        var success = await _repository.DeleteLookupValueAsync(id, ct);
        if (success)
        {
            await RecordAuditLogAsync("DELETE", $"Lookup: {label}", $"Deleted lookup item '{label}' from configurable settings", oldVal, null, ct);
        }
        return success;
    }

    private static string SanitizeApiField(string label)
    {
        if (string.IsNullOrWhiteSpace(label)) return "customField_" + Guid.NewGuid().ToString("N")[..8];
        var cleaned = new string(label.Where(c => char.IsLetterOrDigit(c)).ToArray());
        if (string.IsNullOrEmpty(cleaned)) return "customField_" + Guid.NewGuid().ToString("N")[..8];
        return char.ToLowerInvariant(cleaned[0]) + cleaned[1..];
    }

    private static FieldConfigurationDto MapToDto(FieldConfiguration entity) => FieldConfigurationDto.From(entity);

    private static FieldConfiguration MapToEntity(FieldConfigurationDto dto, string defaultModule, string defaultSection)
    {
        return new FieldConfiguration
        {
            Id = dto.Id,
            ModuleKey = string.IsNullOrWhiteSpace(dto.ModuleKey) ? defaultModule : dto.ModuleKey,
            SectionKey = string.IsNullOrWhiteSpace(dto.SectionKey) ? defaultSection : dto.SectionKey,
            ApiField = dto.ApiField,
            DisplayLabel = dto.DisplayLabel,
            IsVisible = dto.IsVisible,
            IsRequired = dto.IsRequired,
            IsEditable = dto.IsEditable,
            IsSensitive = dto.IsSensitive,
            MaskingRule = dto.MaskingRule,
            VisibleChars = dto.VisibleChars,
            DisplayOrder = dto.DisplayOrder,
            FieldType = dto.FieldType,
            ValidationRegex = string.IsNullOrWhiteSpace(dto.ValidationRegex) ? null : dto.ValidationRegex,
            ValidationMessage = string.IsNullOrWhiteSpace(dto.ValidationMessage) ? null : dto.ValidationMessage.Trim(),
            MinLength = dto.MinLength,
            MaxLength = dto.MaxLength,
            LookupTypeCode = dto.LookupTypeCode,
            IsCustomField = dto.IsCustomField
        };
    }

    private static LookupValueDto MapLookupDto(LookupValue entity)
    {
        return new LookupValueDto
        {
            Id = entity.Id,
            LookupTypeId = entity.LookupTypeId,
            TypeCode = entity.TypeCode,
            Value = entity.Value,
            Label = entity.Label,
            DisplayOrder = entity.DisplayOrder,
            IsActive = entity.IsActive
        };
    }

    // Case Management Settings Implementation
    public async Task<IEnumerable<CaseTypeConfigDto>> GetCaseTypesAsync(bool activeOnly = true, CancellationToken ct = default)
    {
        var items = await _repository.GetCaseTypesAsync(activeOnly, ct);
        return items.Select(c => new CaseTypeConfigDto
        {
            Id = c.Id,
            Code = c.Code,
            Name = c.Name,
            Prefix = c.Prefix,
            DisplayOrder = c.DisplayOrder,
            IsActive = c.IsActive
        });
    }

    public async Task<CaseTypeConfigDto> AddCaseTypeAsync(CreateCaseTypeConfigDto dto, CancellationToken ct = default)
    {
        var entity = new CaseTypeConfig
        {
            Code = dto.Code.Trim(),
            Name = string.IsNullOrWhiteSpace(dto.Name) ? dto.Code.Trim() : dto.Name.Trim(),
            Prefix = string.IsNullOrWhiteSpace(dto.Prefix) ? "C-" : dto.Prefix.Trim().ToUpper(),
            DisplayOrder = dto.DisplayOrder,
            IsActive = true
        };

        if (await _repository.CaseTypeExistsAsync(entity.Code, entity.Name, null, ct))
            throw new InvalidOperationException($"A case type with the code '{entity.Code}' or name '{entity.Name}' already exists.");

        var created = await _repository.AddCaseTypeAsync(entity, ct);
        await RecordAuditLogAsync("CREATE", $"Case Type: {created.Name}", $"Created case type '{created.Name}' ({created.Code})", null, $"Name: {created.Name}, Code: {created.Code}, Prefix: {created.Prefix}", ct);
        await _notificationService.CreateConfigChangedNotificationAsync("System Setting Updated", $"Case Type '{created.Name}' was created.", ct);
        return new CaseTypeConfigDto
        {
            Id = created.Id,
            Code = created.Code,
            Name = created.Name,
            Prefix = created.Prefix,
            DisplayOrder = created.DisplayOrder,
            IsActive = created.IsActive
        };
    }

    public async Task<CaseTypeConfigDto?> UpdateCaseTypeAsync(Guid id, UpdateCaseTypeConfigDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Code)) throw new InvalidOperationException("Code is required.");

        var existingList = await _repository.GetCaseTypesAsync(false, ct);
        var existing = existingList.FirstOrDefault(c => c.Id == id);
        var oldVal = existing != null ? $"Name: {existing.Name}, Code: {existing.Code}, Prefix: {existing.Prefix}, Active: {existing.IsActive}" : null;

        var name = string.IsNullOrWhiteSpace(dto.Name) ? dto.Code.Trim() : dto.Name.Trim();
        if (await _repository.CaseTypeExistsAsync(dto.Code.Trim(), name, id, ct))
            throw new InvalidOperationException($"A case type with the code '{dto.Code.Trim()}' or name '{name}' already exists.");

        var entity = new CaseTypeConfig
        {
            Code = dto.Code.Trim(),
            Name = name,
            Prefix = string.IsNullOrWhiteSpace(dto.Prefix) ? "C-" : dto.Prefix.Trim().ToUpper(),
            DisplayOrder = dto.DisplayOrder,
            IsActive = dto.IsActive
        };

        var updated = await _repository.UpdateCaseTypeAsync(id, entity, ct);
        if (updated == null) return null;

        var newVal = $"Name: {updated.Name}, Code: {updated.Code}, Prefix: {updated.Prefix}, Active: {updated.IsActive}";
        await RecordAuditLogAsync("UPDATE", $"Case Type: {updated.Name}", $"Updated case type '{updated.Name}'", oldVal, newVal, ct);
        await _notificationService.CreateConfigChangedNotificationAsync("System Setting Updated", $"Case Type '{updated.Name}' configuration was updated.", ct);

        return new CaseTypeConfigDto
        {
            Id = updated.Id,
            Code = updated.Code,
            Name = updated.Name,
            Prefix = updated.Prefix,
            DisplayOrder = updated.DisplayOrder,
            IsActive = updated.IsActive
        };
    }

    public async Task<bool> DeleteCaseTypeAsync(Guid id, CancellationToken ct = default)
    {
        var existingList = await _repository.GetCaseTypesAsync(false, ct);
        var existing = existingList.FirstOrDefault(c => c.Id == id);
        var oldVal = existing != null ? $"Name: {existing.Name}, Code: {existing.Code}, Prefix: {existing.Prefix}" : $"ID: {id}";
        var caseTypeName = existing?.Name ?? "Case Type";

        if (existing != null)
        {
            var inUse = await _repository.CountCasesByCaseTypeAsync(existing.Code, existing.Name, ct);
            if (inUse > 0)
                throw new InvalidOperationException(
                    $"Case type '{existing.Name}' cannot be deleted because {inUse} case(s) use it. Deactivate it instead.");
        }

        var success = await _repository.DeleteCaseTypeAsync(id, ct);
        if (success)
        {
            await RecordAuditLogAsync("DELETE", $"Case Type: {caseTypeName}", $"Deleted case type '{caseTypeName}'", oldVal, null, ct);
            await _notificationService.CreateConfigChangedNotificationAsync("System Setting Updated", $"Case Type '{caseTypeName}' was deleted.", ct);
        }
        return success;
    }

    public async Task<IEnumerable<DepartmentSubCategoryDto>> GetSubCategoriesAsync(Guid? departmentId = null, bool activeOnly = true, CancellationToken ct = default)
    {
        var items = await _repository.GetSubCategoriesAsync(departmentId, activeOnly, ct);
        return items.Select(s => new DepartmentSubCategoryDto
        {
            Id = s.Id,
            DepartmentId = s.DepartmentId,
            DepartmentName = s.Department?.Name ?? string.Empty,
            Name = s.Name,
            Code = s.Code,
            DisplayOrder = s.DisplayOrder,
            IsActive = s.IsActive
        });
    }

    public async Task<DepartmentSubCategoryDto> AddSubCategoryAsync(CreateDepartmentSubCategoryDto dto, CancellationToken ct = default)
    {
        var entity = new DepartmentSubCategory
        {
            DepartmentId = dto.DepartmentId,
            Name = dto.Name.Trim(),
            Code = string.IsNullOrWhiteSpace(dto.Code) ? dto.Name.Trim().Replace(" ", "_") : dto.Code.Trim(),
            DisplayOrder = dto.DisplayOrder,
            IsActive = true
        };

        if (!await _repository.DepartmentExistsAsync(entity.DepartmentId, ct))
            throw new InvalidOperationException("The selected department no longer exists.");

        if (await _repository.SubCategoryExistsAsync(entity.DepartmentId, entity.Name, null, ct))
            throw new InvalidOperationException($"Sub-category '{entity.Name}' already exists for this department.");

        var created = await _repository.AddSubCategoryAsync(entity, ct);
        return new DepartmentSubCategoryDto
        {
            Id = created.Id,
            DepartmentId = created.DepartmentId,
            DepartmentName = created.Department?.Name ?? string.Empty,
            Name = created.Name,
            Code = created.Code,
            DisplayOrder = created.DisplayOrder,
            IsActive = created.IsActive
        };
    }

    public async Task<DepartmentSubCategoryDto?> UpdateSubCategoryAsync(Guid id, UpdateDepartmentSubCategoryDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) throw new InvalidOperationException("Sub-category name is required.");

        var existing = (await _repository.GetSubCategoriesAsync(null, false, ct)).FirstOrDefault(s => s.Id == id);
        if (existing == null) return null;

        // The sub-category keeps its parent department: renaming must never turn it into a
        // free-floating global value.
        if (await _repository.SubCategoryExistsAsync(existing.DepartmentId, dto.Name.Trim(), id, ct))
            throw new InvalidOperationException($"Sub-category '{dto.Name.Trim()}' already exists for this department.");

        var entity = new DepartmentSubCategory
        {
            Name = dto.Name.Trim(),
            Code = string.IsNullOrWhiteSpace(dto.Code) ? dto.Name.Trim().Replace(" ", "_") : dto.Code.Trim(),
            DisplayOrder = dto.DisplayOrder,
            IsActive = dto.IsActive
        };

        var updated = await _repository.UpdateSubCategoryAsync(id, entity, ct);
        if (updated == null) return null;

        return new DepartmentSubCategoryDto
        {
            Id = updated.Id,
            DepartmentId = updated.DepartmentId,
            DepartmentName = updated.Department?.Name ?? string.Empty,
            Name = updated.Name,
            Code = updated.Code,
            DisplayOrder = updated.DisplayOrder,
            IsActive = updated.IsActive
        };
    }

    public async Task<bool> DeleteSubCategoryAsync(Guid id, CancellationToken ct = default)
    {
        var existing = (await _repository.GetSubCategoriesAsync(null, false, ct)).FirstOrDefault(s => s.Id == id);
        if (existing == null) return false;

        var inUse = await _repository.CountCasesBySubCategoryAsync(existing.DepartmentId, existing.Name, ct);
        if (inUse > 0)
            throw new InvalidOperationException(
                $"Sub-category '{existing.Name}' cannot be deleted because {inUse} case(s) use it. Deactivate it instead.");

        return await _repository.DeleteSubCategoryAsync(id, ct);
    }

    // ===== PRIORITY ("SEVERITY") MASTER DATA =====
    // A priority is one PrioritySlaRule row. The Cases SLA & Routing screen edits its targets and which
    // sub-categories map to it; this screen edits its name, order, active flag and (in whole hours) its
    // targets. Same rows, so the two screens can never disagree.

    private static void ValidateSlaHours(int hours, string label)
    {
        if (hours <= 0)
            throw new InvalidOperationException($"{label} must be at least 1 hour.");
        if (hours > MaxSlaHours)
            throw new InvalidOperationException($"{label} cannot exceed {MaxSlaHours} hours (1 year).");
    }

    private static int ToHours(int minutes) => (int)Math.Ceiling(minutes / 60.0);

    private async Task<SeverityDto> ToSeverityDtoAsync(PrioritySlaRule rule, CancellationToken ct) => new()
    {
        Id = rule.Id,
        Name = rule.Priority,
        DisplayOrder = rule.DisplayOrder,
        InternalHours = ToHours(rule.InternalResolutionMinutes),
        ExternalHours = ToHours(rule.ExternalResolutionMinutes),
        FirstResponseMinutes = rule.FirstResponseMinutes,
        IsSystem = false,
        CasesUsing = await _repository.CountCasesBySeverityAsync(rule.Priority, ct),
        IsActive = rule.IsActive
    };

    public async Task<IEnumerable<SeverityDto>> GetSeverityConfigurationsAsync(CancellationToken ct = default)
    {
        var rules = await _context.PrioritySlaRules.AsNoTracking()
            .OrderBy(r => r.DisplayOrder).ThenBy(r => r.Priority).ToListAsync(ct);

        var result = new List<SeverityDto>();
        foreach (var rule in rules) result.Add(await ToSeverityDtoAsync(rule, ct));
        return result;
    }

    public async Task<SeverityDto> AddSeverityAsync(CreateSeverityDto dto, CancellationToken ct = default)
    {
        var name = dto.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Priority name is required.");
        if (name.Length > 50)
            throw new InvalidOperationException("Priority name cannot exceed 50 characters.");

        var lowered = name.ToLower();
        if (await _context.PrioritySlaRules.AnyAsync(r => r.Priority.ToLower() == lowered, ct))
            throw new InvalidOperationException($"Priority '{name}' already exists.");

        var internalHours = dto.InternalHours <= 0 ? 22 : dto.InternalHours;
        var externalHours = dto.ExternalHours <= 0 ? 24 : dto.ExternalHours;
        var firstResponseMinutes = dto.FirstResponseMinutes > 0 ? dto.FirstResponseMinutes : 240;
        ValidateSlaHours(internalHours, "Internal SLA");
        ValidateSlaHours(externalHours, "External SLA");

        var nextOrder = (await _context.PrioritySlaRules.MaxAsync(r => (int?)r.DisplayOrder, ct) ?? 0) + 1;
        var rule = new PrioritySlaRule
        {
            Id = Guid.NewGuid(),
            Priority = name,
            DisplayOrder = dto.DisplayOrder > 0 ? dto.DisplayOrder : nextOrder,
            IsActive = true,
            FirstResponseValue = firstResponseMinutes,
            FirstResponseUnit = "Minutes",
            FirstResponseMinutes = firstResponseMinutes,
            InternalResolutionValue = internalHours,
            InternalResolutionUnit = "Hours",
            InternalResolutionMinutes = internalHours * 60,
            ExternalResolutionValue = externalHours,
            ExternalResolutionUnit = "Hours",
            ExternalResolutionMinutes = externalHours * 60,
            Version = 1,
            CreatedAt = DateTime.UtcNow
        };
        _context.PrioritySlaRules.Add(rule);
        await _context.SaveChangesAsync(ct);

        await RecordAuditLogAsync("CREATE", $"Priority: {name}", $"Created priority '{name}'", null,
            $"Internal: {internalHours}h, External: {externalHours}h, First response: {firstResponseMinutes}m", ct);
        return await ToSeverityDtoAsync(rule, ct);
    }

    public async Task<SeverityDto?> UpdateSeverityAsync(Guid id, UpdateSeverityDto dto, CancellationToken ct = default)
    {
        var name = dto.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Priority name is required.");
        if (name.Length > 50)
            throw new InvalidOperationException("Priority name cannot exceed 50 characters.");

        var rule = await _context.PrioritySlaRules.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule == null) return null;

        var lowered = name.ToLower();
        if (await _context.PrioritySlaRules.AnyAsync(r => r.Id != id && r.Priority.ToLower() == lowered, ct))
            throw new InvalidOperationException($"Priority '{name}' already exists.");

        if (!dto.IsActive && rule.IsActive &&
            !await _context.PrioritySlaRules.AnyAsync(r => r.Id != id && r.IsActive, ct))
            throw new InvalidOperationException("At least one priority must stay active.");

        var oldName = rule.Priority;
        var oldSummary = $"Name: {oldName}, Order: {rule.DisplayOrder}, Active: {rule.IsActive}, Internal: {ToHours(rule.InternalResolutionMinutes)}h, External: {ToHours(rule.ExternalResolutionMinutes)}h";

        rule.Priority = name;
        rule.DisplayOrder = dto.DisplayOrder > 0 ? dto.DisplayOrder : rule.DisplayOrder;
        rule.IsActive = dto.IsActive;

        // Targets are edited in whole hours here; only values that were supplied change.
        var slaChanged = false;
        if (dto.InternalHours.HasValue)
        {
            ValidateSlaHours(dto.InternalHours.Value, "Internal SLA");
            var minutes = dto.InternalHours.Value * 60;
            slaChanged |= minutes != rule.InternalResolutionMinutes;
            rule.InternalResolutionValue = dto.InternalHours.Value;
            rule.InternalResolutionUnit = "Hours";
            rule.InternalResolutionMinutes = minutes;
        }
        if (dto.ExternalHours.HasValue)
        {
            ValidateSlaHours(dto.ExternalHours.Value, "External SLA");
            var minutes = dto.ExternalHours.Value * 60;
            slaChanged |= minutes != rule.ExternalResolutionMinutes;
            rule.ExternalResolutionValue = dto.ExternalHours.Value;
            rule.ExternalResolutionUnit = "Hours";
            rule.ExternalResolutionMinutes = minutes;
        }
        if (dto.FirstResponseMinutes.HasValue)
        {
            if (dto.FirstResponseMinutes.Value <= 0)
                throw new InvalidOperationException("First response target must be at least 1 minute.");
            slaChanged |= dto.FirstResponseMinutes.Value != rule.FirstResponseMinutes;
            rule.FirstResponseValue = dto.FirstResponseMinutes.Value;
            rule.FirstResponseUnit = "Minutes";
            rule.FirstResponseMinutes = dto.FirstResponseMinutes.Value;
        }
        if (slaChanged) rule.Version += 1;   // cases snapshot this version
        rule.UpdatedAt = DateTime.UtcNow;

        // Everything that refers to the priority BY NAME follows a rename, so nothing is left dangling.
        if (!oldName.Equals(name, StringComparison.Ordinal))
        {
            await _repository.RenameCaseSeverityAsync(oldName, name, ct);
            await RenamePriorityInRoutingRulesAsync(oldName, name, ct);
        }

        await _context.SaveChangesAsync(ct);

        await RecordAuditLogAsync("UPDATE", $"Priority: {name}", $"Updated priority '{name}'", oldSummary,
            $"Name: {name}, Order: {rule.DisplayOrder}, Active: {rule.IsActive}, Internal: {ToHours(rule.InternalResolutionMinutes)}h, External: {ToHours(rule.ExternalResolutionMinutes)}h", ct);
        return await ToSeverityDtoAsync(rule, ct);
    }

    public async Task<bool> DeleteSeverityAsync(Guid id, CancellationToken ct = default)
    {
        var rule = await _context.PrioritySlaRules.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule == null) return false;

        var inUse = await _repository.CountCasesBySeverityAsync(rule.Priority, ct);
        if (inUse > 0)
            throw new InvalidOperationException(
                $"'{rule.Priority}' cannot be deleted because {inUse} case(s) use it. Deactivate it instead.");

        var referencingRules = await RoutingRulesReferencingPriorityAsync(rule.Priority, ct);
        if (referencingRules.Count > 0)
            throw new InvalidOperationException(
                $"'{rule.Priority}' cannot be deleted because routing rule(s) match on it: {string.Join(", ", referencingRules)}.");

        if (!await _context.PrioritySlaRules.AnyAsync(r => r.Id != id, ct))
            throw new InvalidOperationException("At least one priority must remain configured.");

        _context.PrioritySlaRules.Remove(rule);   // its sub-category mappings are removed with it (cascade)
        await _context.SaveChangesAsync(ct);

        await RecordAuditLogAsync("DELETE", $"Priority: {rule.Priority}", $"Deleted priority '{rule.Priority}'", rule.Priority, null, ct);
        return true;
    }

    private static string? ConditionPriority(string conditionsJson)
    {
        try
        {
            return System.Text.Json.JsonSerializer
                .Deserialize<RuleConditionsDto>(conditionsJson, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true })?.Priority;
        }
        catch (System.Text.Json.JsonException) { return null; }
    }

    private async Task<List<string>> RoutingRulesReferencingPriorityAsync(string priority, CancellationToken ct)
    {
        var rules = await _context.RoutingRules.AsNoTracking().Select(r => new { r.Name, r.ConditionsJson }).ToListAsync(ct);
        return rules
            .Where(r => string.Equals(ConditionPriority(r.ConditionsJson), priority, StringComparison.OrdinalIgnoreCase))
            .Select(r => r.Name).ToList();
    }

    private async Task RenamePriorityInRoutingRulesAsync(string oldName, string newName, CancellationToken ct)
    {
        var options = new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        foreach (var rule in await _context.RoutingRules.ToListAsync(ct))
        {
            if (!string.Equals(ConditionPriority(rule.ConditionsJson), oldName, StringComparison.OrdinalIgnoreCase)) continue;
            var conditions = System.Text.Json.JsonSerializer.Deserialize<RuleConditionsDto>(rule.ConditionsJson, options)!;
            conditions.Priority = newName;
            rule.ConditionsJson = System.Text.Json.JsonSerializer.Serialize(conditions);
            rule.UpdatedAt = DateTime.UtcNow;
        }
    }
}
