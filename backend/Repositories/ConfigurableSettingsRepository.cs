namespace CaseManagement.Api.Repositories;

using CaseManagement.Api.Data;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

public class ConfigurableSettingsRepository : IConfigurableSettingsRepository
{
    private readonly AppDbContext _context;

    public ConfigurableSettingsRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<FieldConfiguration>> GetFieldConfigurationsAsync(string moduleKey, string? sectionKey = null, CancellationToken ct = default)
    {
        var query = _context.FieldConfigurations.AsNoTracking().Where(f => f.ModuleKey == moduleKey);
        if (!string.IsNullOrWhiteSpace(sectionKey))
        {
            query = query.Where(f => f.SectionKey == sectionKey);
        }
        return await query.OrderBy(f => f.DisplayOrder).ToListAsync(ct);
    }

    public async Task SaveFieldConfigurationsAsync(string moduleKey, string sectionKey, IEnumerable<FieldConfiguration> fields, CancellationToken ct = default)
    {
        var existing = await _context.FieldConfigurations
            .Where(f => f.ModuleKey == moduleKey && f.SectionKey == sectionKey)
            .ToListAsync(ct);

        foreach (var updated in fields)
        {
            var target = existing.FirstOrDefault(e => e.Id == updated.Id || (e.ApiField == updated.ApiField));
            if (target != null)
            {
                target.DisplayLabel = updated.DisplayLabel;
                target.IsVisible = updated.IsVisible;
                target.IsRequired = updated.IsRequired;
                target.IsEditable = updated.IsEditable;
                target.IsSensitive = updated.IsSensitive;
                target.MaskingRule = updated.MaskingRule;
                target.VisibleChars = updated.VisibleChars;
                target.DisplayOrder = updated.DisplayOrder;
                target.FieldType = updated.FieldType;
                target.ValidationRegex = updated.ValidationRegex;
                target.MinLength = updated.MinLength;
                target.MaxLength = updated.MaxLength;
                target.LookupTypeCode = updated.LookupTypeCode;
                target.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                updated.Id = updated.Id == Guid.Empty ? Guid.NewGuid() : updated.Id;
                updated.ModuleKey = moduleKey;
                updated.SectionKey = sectionKey;
                updated.CreatedAt = DateTime.UtcNow;
                _context.FieldConfigurations.Add(updated);
            }
        }

        await _context.SaveChangesAsync(ct);
    }

    public async Task<FieldConfiguration> AddFieldConfigurationAsync(FieldConfiguration field, CancellationToken ct = default)
    {
        field.Id = Guid.NewGuid();
        field.CreatedAt = DateTime.UtcNow;
        _context.FieldConfigurations.Add(field);
        await _context.SaveChangesAsync(ct);
        return field;
    }

    public async Task<FieldConfiguration?> UpdateFieldConfigurationAsync(Guid id, FieldConfiguration updated, CancellationToken ct = default)
    {
        var target = await _context.FieldConfigurations.FindAsync(new object[] { id }, ct);
        if (target == null) return null;

        target.DisplayLabel = updated.DisplayLabel;
        target.FieldType = updated.FieldType;
        target.IsVisible = updated.IsVisible;
        target.IsRequired = updated.IsRequired;
        target.IsEditable = updated.IsEditable;
        target.IsSensitive = updated.IsSensitive;
        target.MaskingRule = updated.MaskingRule;
        target.VisibleChars = updated.VisibleChars;
        target.DisplayOrder = updated.DisplayOrder;
        target.LookupTypeCode = updated.LookupTypeCode;
        target.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(ct);
        return target;
    }

    public async Task<bool> FieldExistsAsync(string moduleKey, string sectionKey, string apiField, Guid? excludeId = null, CancellationToken ct = default)
    {
        return await _context.FieldConfigurations.AnyAsync(f =>
            f.ModuleKey == moduleKey &&
            f.SectionKey == sectionKey &&
            f.ApiField.ToLower() == apiField.ToLower() &&
            (excludeId == null || f.Id != excludeId), ct);
    }

    public async Task<bool> DeleteFieldConfigurationAsync(Guid id, CancellationToken ct = default)
    {
        var target = await _context.FieldConfigurations.FindAsync(new object[] { id }, ct);
        if (target == null) return false;

        _context.FieldConfigurations.Remove(target);
        await _context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<IEnumerable<LookupType>> GetAllLookupTypesAsync(CancellationToken ct = default)
    {
        return await _context.LookupTypes
            .Include(lt => lt.Values.OrderBy(v => v.DisplayOrder))
            .AsNoTracking()
            .ToListAsync(ct);
    }

    public async Task<IEnumerable<LookupValue>> GetLookupValuesAsync(string typeCode, bool activeOnly = true, CancellationToken ct = default)
    {
        var query = _context.LookupValues.AsNoTracking().Where(v => v.TypeCode == typeCode);
        if (activeOnly) query = query.Where(v => v.IsActive);
        return await query.OrderBy(v => v.DisplayOrder).ThenBy(v => v.Value).ToListAsync(ct);
    }

    public async Task<LookupValue> AddLookupValueAsync(LookupValue value, CancellationToken ct = default)
    {
        var lookupType = await _context.LookupTypes.FirstOrDefaultAsync(lt => lt.Code == value.TypeCode, ct);
        if (lookupType == null)
        {
            lookupType = new LookupType
            {
                Id = Guid.NewGuid(),
                Code = value.TypeCode,
                Name = value.TypeCode,
                Description = $"Lookup type for {value.TypeCode}",
                CreatedAt = DateTime.UtcNow
            };
            _context.LookupTypes.Add(lookupType);
            await _context.SaveChangesAsync(ct);
        }

        value.Id = Guid.NewGuid();
        value.LookupTypeId = lookupType.Id;
        value.CreatedAt = DateTime.UtcNow;
        if (string.IsNullOrWhiteSpace(value.Label)) value.Label = value.Value;

        _context.LookupValues.Add(value);
        await _context.SaveChangesAsync(ct);
        return value;
    }

    public async Task<LookupValue?> UpdateLookupValueAsync(Guid id, LookupValue updated, CancellationToken ct = default)
    {
        var target = await _context.LookupValues.FindAsync(new object[] { id }, ct);
        if (target == null) return null;

        target.Value = updated.Value;
        target.Label = updated.Label;
        target.DisplayOrder = updated.DisplayOrder;
        target.IsActive = updated.IsActive;
        target.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(ct);
        return target;
    }

    public async Task<bool> DeleteLookupValueAsync(Guid id, CancellationToken ct = default)
    {
        var target = await _context.LookupValues.FindAsync(new object[] { id }, ct);
        if (target == null) return false;

        _context.LookupValues.Remove(target);
        await _context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<LookupValue?> GetLookupValueAsync(Guid id, CancellationToken ct = default)
    {
        return await _context.LookupValues.AsNoTracking().FirstOrDefaultAsync(v => v.Id == id, ct);
    }

    public async Task<bool> LookupValueExistsAsync(string typeCode, string value, Guid? excludeId = null, CancellationToken ct = default)
    {
        return await _context.LookupValues.AnyAsync(v =>
            v.TypeCode == typeCode &&
            v.Value.ToLower() == value.ToLower() &&
            (excludeId == null || v.Id != excludeId), ct);
    }

    // Case Management Settings Implementation
    public async Task<IEnumerable<CaseTypeConfig>> GetCaseTypesAsync(bool activeOnly = true, CancellationToken ct = default)
    {
        var query = _context.CaseTypeConfigs.AsNoTracking();
        if (activeOnly) query = query.Where(c => c.IsActive);
        return await query.OrderBy(c => c.DisplayOrder).ThenBy(c => c.Name).ToListAsync(ct);
    }

    public async Task<CaseTypeConfig> AddCaseTypeAsync(CaseTypeConfig config, CancellationToken ct = default)
    {
        config.Id = Guid.NewGuid();
        config.CreatedAt = DateTime.UtcNow;
        _context.CaseTypeConfigs.Add(config);
        await _context.SaveChangesAsync(ct);
        return config;
    }

    public async Task<CaseTypeConfig?> UpdateCaseTypeAsync(Guid id, CaseTypeConfig updated, CancellationToken ct = default)
    {
        var target = await _context.CaseTypeConfigs.FindAsync(new object[] { id }, ct);
        if (target == null) return null;

        target.Code = updated.Code;
        target.Name = updated.Name;
        target.Prefix = updated.Prefix;
        target.DisplayOrder = updated.DisplayOrder;
        target.IsActive = updated.IsActive;
        target.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(ct);
        return target;
    }

    public async Task<bool> CaseTypeExistsAsync(string code, string name, Guid? excludeId = null, CancellationToken ct = default)
    {
        return await _context.CaseTypeConfigs.AnyAsync(c =>
            (c.Code.ToLower() == code.ToLower() || c.Name.ToLower() == name.ToLower()) &&
            (excludeId == null || c.Id != excludeId), ct);
    }

    public async Task<bool> DeleteCaseTypeAsync(Guid id, CancellationToken ct = default)
    {
        var target = await _context.CaseTypeConfigs.FindAsync(new object[] { id }, ct);
        if (target == null) return false;

        _context.CaseTypeConfigs.Remove(target);
        await _context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<IEnumerable<DepartmentSubCategory>> GetSubCategoriesAsync(Guid? departmentId = null, bool activeOnly = true, CancellationToken ct = default)
    {
        var query = _context.DepartmentSubCategories.Include(s => s.Department).AsNoTracking();
        if (departmentId.HasValue && departmentId.Value != Guid.Empty) query = query.Where(s => s.DepartmentId == departmentId.Value);
        if (activeOnly) query = query.Where(s => s.IsActive);
        return await query.OrderBy(s => s.DisplayOrder).ThenBy(s => s.Name).ToListAsync(ct);
    }

    public async Task<DepartmentSubCategory> AddSubCategoryAsync(DepartmentSubCategory subCategory, CancellationToken ct = default)
    {
        subCategory.Id = Guid.NewGuid();
        subCategory.CreatedAt = DateTime.UtcNow;
        _context.DepartmentSubCategories.Add(subCategory);
        await _context.SaveChangesAsync(ct);
        await _context.Entry(subCategory).Reference(s => s.Department).LoadAsync(ct);
        return subCategory;
    }

    public async Task<DepartmentSubCategory?> UpdateSubCategoryAsync(Guid id, DepartmentSubCategory updated, CancellationToken ct = default)
    {
        var target = await _context.DepartmentSubCategories.FindAsync(new object[] { id }, ct);
        if (target == null) return null;

        target.Name = updated.Name;
        target.Code = updated.Code;
        target.DisplayOrder = updated.DisplayOrder;
        target.IsActive = updated.IsActive;
        target.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(ct);
        await _context.Entry(target).Reference(t => t.Department).LoadAsync(ct);
        return target;
    }

    public async Task<bool> SubCategoryExistsAsync(Guid departmentId, string name, Guid? excludeId = null, CancellationToken ct = default)
    {
        return await _context.DepartmentSubCategories.AnyAsync(s =>
            s.DepartmentId == departmentId &&
            s.Name.ToLower() == name.ToLower() &&
            (excludeId == null || s.Id != excludeId), ct);
    }

    public async Task<bool> DepartmentExistsAsync(Guid departmentId, CancellationToken ct = default)
    {
        return await _context.Departments.AnyAsync(d => d.Id == departmentId, ct);
    }

    public async Task<bool> DeleteSubCategoryAsync(Guid id, CancellationToken ct = default)
    {
        var target = await _context.DepartmentSubCategories.FindAsync(new object[] { id }, ct);
        if (target == null) return false;

        _context.DepartmentSubCategories.Remove(target);
        await _context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<IEnumerable<SlaConfiguration>> GetSlaConfigurationsAsync(CancellationToken ct = default)
    {
        return await _context.SlaConfigurations.AsNoTracking().Where(s => s.IsActive).ToListAsync(ct);
    }

    public async Task<SlaConfiguration> SaveSlaConfigurationAsync(SlaConfiguration sla, CancellationToken ct = default)
    {
        var existing = await _context.SlaConfigurations.FirstOrDefaultAsync(s => s.Severity.ToLower() == sla.Severity.ToLower(), ct);
        if (existing != null)
        {
            existing.InternalHours = sla.InternalHours;
            existing.ExternalHours = sla.ExternalHours;
            existing.FirstResponseMinutes = sla.FirstResponseMinutes;
            existing.IsActive = sla.IsActive;
            existing.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(ct);
            return existing;
        }

        sla.Id = Guid.NewGuid();
        sla.CreatedAt = DateTime.UtcNow;
        _context.SlaConfigurations.Add(sla);
        await _context.SaveChangesAsync(ct);
        return sla;
    }

    public async Task<bool> DeleteSlaConfigurationBySeverityAsync(string severity, CancellationToken ct = default)
    {
        var target = await _context.SlaConfigurations.FirstOrDefaultAsync(s => s.Severity.ToLower() == severity.ToLower(), ct);
        if (target == null) return false;

        _context.SlaConfigurations.Remove(target);
        await _context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> RenameSlaConfigurationAsync(string oldSeverity, string newSeverity, CancellationToken ct = default)
    {
        var target = await _context.SlaConfigurations.FirstOrDefaultAsync(s => s.Severity.ToLower() == oldSeverity.ToLower(), ct);
        if (target == null) return false;

        target.Severity = newSeverity;
        target.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<int> CountCasesBySeverityAsync(string severity, CancellationToken ct = default)
    {
        return await _context.Cases.CountAsync(c => c.Severity.ToLower() == severity.ToLower(), ct);
    }

    /// <summary>
    /// Renaming a severity has to carry the cases already stored under the old name across,
    /// otherwise those rows would point at a severity that no longer exists.
    /// </summary>
    public async Task<int> RenameCaseSeverityAsync(string oldSeverity, string newSeverity, CancellationToken ct = default)
    {
        return await _context.Cases
            .Where(c => c.Severity.ToLower() == oldSeverity.ToLower())
            .ExecuteUpdateAsync(setters => setters.SetProperty(c => c.Severity, newSeverity), ct);
    }

    public async Task<DepartmentEscalationTemplate?> GetEscalationTemplateAsync(Guid departmentId, string reason, CancellationToken ct = default)
    {
        return await _context.DepartmentEscalationTemplates
            .Include(t => t.Department)
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.DepartmentId == departmentId && t.EscalationReason.ToLower() == reason.ToLower() && t.IsActive, ct);
    }

    public async Task<IEnumerable<DepartmentEscalationTemplate>> GetAllEscalationTemplatesAsync(Guid? departmentId = null, CancellationToken ct = default)
    {
        var query = _context.DepartmentEscalationTemplates.Include(t => t.Department).AsNoTracking();
        if (departmentId.HasValue && departmentId.Value != Guid.Empty) query = query.Where(t => t.DepartmentId == departmentId.Value);
        return await query.Where(t => t.IsActive).ToListAsync(ct);
    }

    public async Task<DepartmentEscalationTemplate> SaveEscalationTemplateAsync(DepartmentEscalationTemplate template, CancellationToken ct = default)
    {
        var existing = await _context.DepartmentEscalationTemplates
            .FirstOrDefaultAsync(t => t.DepartmentId == template.DepartmentId && t.EscalationReason.ToLower() == template.EscalationReason.ToLower(), ct);

        if (existing != null)
        {
            existing.SubjectTemplate = template.SubjectTemplate;
            existing.BodyTemplate = template.BodyTemplate;
            existing.IsActive = template.IsActive;
            existing.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(ct);
            return existing;
        }

        template.Id = Guid.NewGuid();
        template.CreatedAt = DateTime.UtcNow;
        _context.DepartmentEscalationTemplates.Add(template);
        await _context.SaveChangesAsync(ct);
        return template;
    }

    public async Task<bool> DeleteEscalationTemplateAsync(Guid id, CancellationToken ct = default)
    {
        var target = await _context.DepartmentEscalationTemplates.FindAsync(new object[] { id }, ct);
        if (target == null) return false;

        _context.DepartmentEscalationTemplates.Remove(target);
        await _context.SaveChangesAsync(ct);
        return true;
    }
}
