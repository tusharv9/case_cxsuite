namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Repositories;
using Microsoft.EntityFrameworkCore;

public class ConfigurableSettingsService : IConfigurableSettingsService
{
    /// <summary>Lookup type that holds the administrator-configurable case severities.</summary>
    public const string SeverityLookupCode = "CASE_SEVERITY";

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

    public async Task<IEnumerable<FieldConfigurationDto>> GetFieldConfigurationsAsync(string moduleKey, string? sectionKey = null, CancellationToken ct = default)
    {
        var fields = await _repository.GetFieldConfigurationsAsync(moduleKey, sectionKey, ct);
        return fields.Select(MapToDto);
    }

    public async Task SaveFieldConfigurationsAsync(string moduleKey, string sectionKey, IEnumerable<FieldConfigurationDto> fields, CancellationToken ct = default)
    {
        var entities = fields.Select(dto => MapToEntity(dto, moduleKey, sectionKey));
        await _repository.SaveFieldConfigurationsAsync(moduleKey, sectionKey, entities, ct);
        await RecordAuditLogAsync("UPDATE", $"Section Fields: {sectionKey}", $"Saved field configurations layout for {sectionKey}", null, $"{fields.Count()} fields updated", ct);
    }

    public async Task<FieldConfigurationDto> AddCustomFieldAsync(CreateCustomFieldDto dto, CancellationToken ct = default)
    {
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
            LookupTypeCode = dto.LookupTypeCode,
            IsCustomField = true
        };

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

        var existingList = await _repository.GetFieldConfigurationsAsync("Customer360", null, ct);
        var existing = existingList.FirstOrDefault(f => f.Id == id);
        var oldVal = existing != null ? $"Label: {existing.DisplayLabel}, Type: {existing.FieldType}, Visible: {existing.IsVisible}, Required: {existing.IsRequired}, Masking: {existing.MaskingRule}" : null;

        var entity = new FieldConfiguration
        {
            DisplayLabel = dto.DisplayLabel.Trim(),
            FieldType = string.IsNullOrWhiteSpace(dto.FieldType) ? "Text" : dto.FieldType,
            IsVisible = dto.IsVisible,
            IsRequired = dto.IsRequired,
            IsEditable = dto.IsEditable,
            IsSensitive = dto.IsSensitive,
            MaskingRule = string.IsNullOrWhiteSpace(dto.MaskingRule) ? "None" : dto.MaskingRule,
            VisibleChars = dto.VisibleChars < 0 ? 0 : dto.VisibleChars,
            DisplayOrder = dto.DisplayOrder,
            LookupTypeCode = string.IsNullOrWhiteSpace(dto.LookupTypeCode) ? null : dto.LookupTypeCode
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
        var existingList = await _repository.GetFieldConfigurationsAsync("Customer360", null, ct);
        var existing = existingList.FirstOrDefault(f => f.Id == id);
        var oldVal = existing != null ? $"Label: {existing.DisplayLabel}, ApiField: {existing.ApiField}, Section: {existing.SectionKey}, Type: {existing.FieldType}" : $"ID: {id}";
        var fieldName = existing?.DisplayLabel ?? "Field";

        var success = await _repository.DeleteFieldConfigurationAsync(id, ct);
        if (success)
        {
            await RecordAuditLogAsync("DELETE", $"Field: {fieldName}", $"Deleted configurable field '{fieldName}'", oldVal, null, ct);
        }
        return success;
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

    private static FieldConfigurationDto MapToDto(FieldConfiguration entity)
    {
        return new FieldConfigurationDto
        {
            Id = entity.Id,
            ModuleKey = entity.ModuleKey,
            SectionKey = entity.SectionKey,
            ApiField = entity.ApiField,
            DisplayLabel = entity.DisplayLabel,
            IsVisible = entity.IsVisible,
            IsRequired = entity.IsRequired,
            IsEditable = entity.IsEditable,
            IsSensitive = entity.IsSensitive,
            MaskingRule = entity.MaskingRule,
            VisibleChars = entity.VisibleChars,
            DisplayOrder = entity.DisplayOrder,
            FieldType = entity.FieldType,
            ValidationRegex = entity.ValidationRegex,
            MinLength = entity.MinLength,
            MaxLength = entity.MaxLength,
            LookupTypeCode = entity.LookupTypeCode,
            IsCustomField = entity.IsCustomField
        };
    }

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
            ValidationRegex = dto.ValidationRegex,
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
        return await _repository.DeleteSubCategoryAsync(id, ct);
    }

    public async Task<IEnumerable<SlaConfigurationDto>> GetSlaConfigurationsAsync(CancellationToken ct = default)
    {
        var items = await _repository.GetSlaConfigurationsAsync(ct);
        return items.Select(s => new SlaConfigurationDto
        {
            Id = s.Id,
            Severity = s.Severity,
            InternalHours = s.InternalHours,
            ExternalHours = s.ExternalHours,
            FirstResponseMinutes = s.FirstResponseMinutes,
            IsActive = s.IsActive
        });
    }

    /// <summary>SLA hours are whole hours: zero, negative and absurd values are rejected.</summary>
    private static void ValidateSlaHours(int hours, string label)
    {
        if (hours <= 0)
            throw new InvalidOperationException($"{label} must be at least 1 hour.");
        if (hours > MaxSlaHours)
            throw new InvalidOperationException($"{label} cannot exceed {MaxSlaHours} hours (1 year).");
    }

    // ===== SEVERITY MASTER DATA =====
    // A severity is one CASE_SEVERITY lookup value plus one SLA configuration row. Both are
    // written together so the SLA Configuration screen always lists exactly the configured
    // severities, and cases can only ever be stored with a severity that exists here.

    private static readonly string[] SystemSeverities = { "Low", "Medium", "High", "Critical" };

    public async Task<IEnumerable<string>> GetSeveritiesAsync(CancellationToken ct = default)
    {
        var values = (await _repository.GetLookupValuesAsync(SeverityLookupCode, true, ct))
            .Select(v => v.Value)
            .ToList();

        if (values.Count > 0) return values;

        // Falls back to whatever SLA rows exist so a database seeded before severities became
        // configurable still resolves.
        var fromSla = (await _repository.GetSlaConfigurationsAsync(ct)).Select(x => x.Severity).ToList();
        return fromSla.Count > 0 ? fromSla : SystemSeverities;
    }

    public async Task<IEnumerable<SeverityDto>> GetSeverityConfigurationsAsync(CancellationToken ct = default)
    {
        var lookups = (await _repository.GetLookupValuesAsync(SeverityLookupCode, false, ct)).ToList();
        var slas = (await _repository.GetSlaConfigurationsAsync(ct)).ToList();

        var result = new List<SeverityDto>();
        foreach (var lookup in lookups)
        {
            var sla = slas.FirstOrDefault(s => s.Severity.Equals(lookup.Value, StringComparison.OrdinalIgnoreCase));
            result.Add(new SeverityDto
            {
                Id = lookup.Id,
                Name = lookup.Value,
                DisplayOrder = lookup.DisplayOrder,
                InternalHours = sla?.InternalHours ?? 0,
                ExternalHours = sla?.ExternalHours ?? 0,
                FirstResponseMinutes = sla?.FirstResponseMinutes ?? 240,
                IsSystem = SystemSeverities.Contains(lookup.Value, StringComparer.OrdinalIgnoreCase),
                CasesUsing = await _repository.CountCasesBySeverityAsync(lookup.Value, ct),
                IsActive = lookup.IsActive
            });
        }

        return result;
    }

    public async Task<SeverityDto> AddSeverityAsync(CreateSeverityDto dto, CancellationToken ct = default)
    {
        var name = dto.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Severity name is required.");
        if (name.Length > 50)
            throw new InvalidOperationException("Severity name cannot exceed 50 characters.");

        if (await _repository.LookupValueExistsAsync(SeverityLookupCode, name, null, ct))
            throw new InvalidOperationException($"Severity '{name}' already exists.");

        var internalHours = dto.InternalHours <= 0 ? 22 : dto.InternalHours;
        var externalHours = dto.ExternalHours <= 0 ? 24 : dto.ExternalHours;
        var firstResponseMinutes = dto.FirstResponseMinutes > 0 ? dto.FirstResponseMinutes : 240;
        ValidateSlaHours(internalHours, "Internal SLA");
        ValidateSlaHours(externalHours, "External SLA");

        var created = await _repository.AddLookupValueAsync(new LookupValue
        {
            TypeCode = SeverityLookupCode,
            Value = name,
            Label = name,
            DisplayOrder = dto.DisplayOrder,
            IsActive = true
        }, ct);

        // The matching SLA row is created in the same operation, so a new severity is never
        // missing from SLA Configuration.
        await _repository.SaveSlaConfigurationAsync(new SlaConfiguration
        {
            Severity = name,
            InternalHours = internalHours,
            ExternalHours = externalHours,
            FirstResponseMinutes = firstResponseMinutes,
            IsActive = true
        }, ct);

        return new SeverityDto
        {
            Id = created.Id,
            Name = created.Value,
            DisplayOrder = created.DisplayOrder,
            InternalHours = internalHours,
            ExternalHours = externalHours,
            FirstResponseMinutes = firstResponseMinutes,
            IsSystem = false,
            CasesUsing = 0
        };
    }

    public async Task<SeverityDto?> UpdateSeverityAsync(Guid id, UpdateSeverityDto dto, CancellationToken ct = default)
    {
        var name = dto.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("Severity name is required.");

        var current = await _repository.GetLookupValueAsync(id, ct);
        if (current == null || current.TypeCode != SeverityLookupCode) return null;

        if (await _repository.LookupValueExistsAsync(SeverityLookupCode, name, id, ct))
            throw new InvalidOperationException($"Severity '{name}' already exists.");

        var oldName = current.Value;

        await _repository.UpdateLookupValueAsync(id, new LookupValue
        {
            Value = name,
            Label = name,
            DisplayOrder = dto.DisplayOrder,
            IsActive = dto.IsActive
        }, ct);

        if (!oldName.Equals(name, StringComparison.Ordinal))
        {
            await _repository.RenameSlaConfigurationAsync(oldName, name, ct);
            // Cases already stored under the previous name follow the rename so no case is
            // left pointing at a severity that no longer exists.
            await _repository.RenameCaseSeverityAsync(oldName, name, ct);
        }

        var sla = (await _repository.GetSlaConfigurationsAsync(ct))
            .FirstOrDefault(x => x.Severity.Equals(name, StringComparison.OrdinalIgnoreCase));

        // SLA hours are edited together with the severity (the separate SLA Configuration
        // screen was removed). Only values that were supplied are changed.
        if (dto.InternalHours.HasValue || dto.ExternalHours.HasValue || dto.FirstResponseMinutes.HasValue)
        {
            var internalHours = dto.InternalHours ?? sla?.InternalHours ?? 22;
            var externalHours = dto.ExternalHours ?? sla?.ExternalHours ?? 24;
            var firstResponse = dto.FirstResponseMinutes ?? sla?.FirstResponseMinutes ?? 240;
            ValidateSlaHours(internalHours, "Internal SLA");
            ValidateSlaHours(externalHours, "External SLA");
            if (firstResponse <= 0)
                throw new InvalidOperationException("First response target must be at least 1 minute.");

            sla = await _repository.SaveSlaConfigurationAsync(new SlaConfiguration
            {
                Severity = name,
                InternalHours = internalHours,
                ExternalHours = externalHours,
                FirstResponseMinutes = firstResponse,
                IsActive = true
            }, ct);
        }

        return new SeverityDto
        {
            Id = id,
            Name = name,
            DisplayOrder = dto.DisplayOrder,
            InternalHours = sla?.InternalHours ?? 0,
            ExternalHours = sla?.ExternalHours ?? 0,
            FirstResponseMinutes = sla?.FirstResponseMinutes ?? 240,
            IsSystem = SystemSeverities.Contains(name, StringComparer.OrdinalIgnoreCase),
            CasesUsing = await _repository.CountCasesBySeverityAsync(name, ct),
            IsActive = dto.IsActive
        };
    }

    public async Task<bool> DeleteSeverityAsync(Guid id, CancellationToken ct = default)
    {
        var current = await _repository.GetLookupValueAsync(id, ct);
        if (current == null || current.TypeCode != SeverityLookupCode) return false;

        var inUse = await _repository.CountCasesBySeverityAsync(current.Value, ct);
        if (inUse > 0)
            throw new InvalidOperationException(
                $"'{current.Value}' cannot be deleted because {inUse} case(s) currently use it.");

        var remaining = (await _repository.GetLookupValuesAsync(SeverityLookupCode, true, ct)).Count();
        if (remaining <= 1)
            throw new InvalidOperationException("At least one severity must remain configured.");

        await _repository.DeleteSlaConfigurationBySeverityAsync(current.Value, ct);
        return await _repository.DeleteLookupValueAsync(id, ct);
    }
}
