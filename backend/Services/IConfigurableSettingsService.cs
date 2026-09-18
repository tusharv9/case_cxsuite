namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;

public interface IConfigurableSettingsService
{
    Task<IEnumerable<FieldConfigurationDto>> GetFieldConfigurationsAsync(string moduleKey, string? sectionKey = null, CancellationToken ct = default);
    Task SaveFieldConfigurationsAsync(string moduleKey, string sectionKey, IEnumerable<FieldConfigurationDto> fields, CancellationToken ct = default);
    Task<FieldConfigurationDto> AddCustomFieldAsync(CreateCustomFieldDto dto, CancellationToken ct = default);
    Task<FieldConfigurationDto?> UpdateFieldConfigurationAsync(Guid id, UpdateFieldConfigurationDto dto, CancellationToken ct = default);
    Task<bool> DeleteFieldConfigurationAsync(Guid id, CancellationToken ct = default);

    Task<IEnumerable<LookupValueDto>> GetLookupValuesAsync(string typeCode, bool activeOnly = true, CancellationToken ct = default);
    Task<LookupValueDto> AddLookupValueAsync(CreateLookupValueDto dto, CancellationToken ct = default);
    Task<LookupValueDto?> UpdateLookupValueAsync(Guid id, UpdateLookupValueDto dto, CancellationToken ct = default);
    Task<bool> DeleteLookupValueAsync(Guid id, CancellationToken ct = default);

    // Case Management Settings
    Task<IEnumerable<CaseTypeConfigDto>> GetCaseTypesAsync(bool activeOnly = true, CancellationToken ct = default);
    Task<CaseTypeConfigDto> AddCaseTypeAsync(CreateCaseTypeConfigDto dto, CancellationToken ct = default);
    Task<CaseTypeConfigDto?> UpdateCaseTypeAsync(Guid id, UpdateCaseTypeConfigDto dto, CancellationToken ct = default);
    Task<bool> DeleteCaseTypeAsync(Guid id, CancellationToken ct = default);

    Task<IEnumerable<DepartmentSubCategoryDto>> GetSubCategoriesAsync(Guid? departmentId = null, bool activeOnly = true, CancellationToken ct = default);
    Task<DepartmentSubCategoryDto> AddSubCategoryAsync(CreateDepartmentSubCategoryDto dto, CancellationToken ct = default);
    Task<DepartmentSubCategoryDto?> UpdateSubCategoryAsync(Guid id, UpdateDepartmentSubCategoryDto dto, CancellationToken ct = default);
    Task<bool> DeleteSubCategoryAsync(Guid id, CancellationToken ct = default);

    Task<IEnumerable<SlaConfigurationDto>> GetSlaConfigurationsAsync(CancellationToken ct = default);
    Task<SlaConfigurationDto> SaveSlaConfigurationAsync(CreateOrUpdateSlaDto dto, CancellationToken ct = default);

    // Severity master data — kept in step with SLA Configuration and with stored cases.
    Task<IEnumerable<string>> GetSeveritiesAsync(CancellationToken ct = default);
    Task<IEnumerable<SeverityDto>> GetSeverityConfigurationsAsync(CancellationToken ct = default);
    Task<SeverityDto> AddSeverityAsync(CreateSeverityDto dto, CancellationToken ct = default);
    Task<SeverityDto?> UpdateSeverityAsync(Guid id, UpdateSeverityDto dto, CancellationToken ct = default);
    Task<bool> DeleteSeverityAsync(Guid id, CancellationToken ct = default);

    Task<DepartmentEscalationTemplateDto?> GetEscalationTemplateAsync(Guid departmentId, string reason, CancellationToken ct = default);
    Task<IEnumerable<DepartmentEscalationTemplateDto>> GetAllEscalationTemplatesAsync(Guid? departmentId = null, CancellationToken ct = default);
    Task<DepartmentEscalationTemplateDto> SaveEscalationTemplateAsync(CreateOrUpdateEscalationTemplateDto dto, CancellationToken ct = default);
    Task<bool> DeleteEscalationTemplateAsync(Guid id, CancellationToken ct = default);
}
