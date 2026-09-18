namespace CaseManagement.Api.Controllers;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Services;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class ConfigurableSettingsController : BaseApiController
{
    private readonly IConfigurableSettingsService _settingsService;
    private readonly INotificationService _notificationService;

    public ConfigurableSettingsController(IConfigurableSettingsService settingsService, INotificationService notificationService)
    {
        _settingsService = settingsService;
        _notificationService = notificationService;
    }

    [HttpGet("notification-rules")]
    public async Task<IActionResult> GetNotificationRules(CancellationToken ct = default)
    {
        var rules = await _notificationService.GetNotificationRulesAsync(ct);
        return Ok(rules);
    }

    [HttpPut("notification-rules/{id:guid}")]
    public async Task<IActionResult> UpdateNotificationRule(Guid id, [FromBody] UpdateNotificationRuleDto dto, CancellationToken ct = default)
    {
        if (dto == null) return BadRequest(new { message = "Request body is required." });
        var updated = await _notificationService.UpdateNotificationRuleAsync(id, dto, GetCurrentUserIdSafe(), ct);
        if (updated == null) return NotFound(new { message = "Notification rule not found." });
        return Ok(updated);
    }

    [HttpPatch("notification-rules/{id:guid}/toggle")]
    public async Task<IActionResult> ToggleNotificationRule(Guid id, CancellationToken ct = default)
    {
        var updated = await _notificationService.ToggleNotificationRuleAsync(id, GetCurrentUserIdSafe(), ct);
        if (updated == null) return NotFound(new { message = "Notification rule not found." });
        return Ok(updated);
    }

    [HttpGet("fields")]
    public async Task<IActionResult> GetFields([FromQuery] string moduleKey = "Customer360", [FromQuery] string? sectionKey = null, CancellationToken ct = default)
    {
        var fields = await _settingsService.GetFieldConfigurationsAsync(moduleKey, sectionKey, ct);
        return Ok(fields);
    }

    [HttpPut("fields")]
    public async Task<IActionResult> SaveFields([FromBody] UpdateFieldConfigurationsRequest request, CancellationToken ct = default)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.ModuleKey) || string.IsNullOrWhiteSpace(request.SectionKey))
        {
            return BadRequest(new { message = "ModuleKey and SectionKey are required." });
        }

        await _settingsService.SaveFieldConfigurationsAsync(request.ModuleKey, request.SectionKey, request.Fields, ct);
        return Ok(new { message = "Field configurations saved successfully." });
    }

    [HttpPost("fields")]
    public async Task<IActionResult> AddCustomField([FromBody] CreateCustomFieldDto dto, CancellationToken ct = default)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.DisplayLabel))
        {
            return BadRequest(new { message = "DisplayLabel is required." });
        }

        var created = await _settingsService.AddCustomFieldAsync(dto, ct);
        return Ok(created);
    }

    [HttpPut("fields/{id:guid}")]
    public async Task<IActionResult> UpdateField(Guid id, [FromBody] UpdateFieldConfigurationDto dto, CancellationToken ct = default)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.DisplayLabel))
        {
            return BadRequest(new { message = "DisplayLabel is required." });
        }

        var updated = await _settingsService.UpdateFieldConfigurationAsync(id, dto, ct);
        if (updated == null) return NotFound(new { message = "Field configuration not found." });
        return Ok(updated);
    }

    [HttpDelete("fields/{id:guid}")]
    public async Task<IActionResult> DeleteCustomField(Guid id, CancellationToken ct = default)
    {
        var success = await _settingsService.DeleteFieldConfigurationAsync(id, ct);
        if (!success) return NotFound(new { message = "Field configuration not found." });
        return Ok(new { message = "Field deleted successfully." });
    }

    [HttpGet("lookups/{typeCode}")]
    public async Task<IActionResult> GetLookupValues(string typeCode, [FromQuery] bool activeOnly = true, CancellationToken ct = default)
    {
        var values = await _settingsService.GetLookupValuesAsync(typeCode, activeOnly, ct);
        return Ok(values);
    }

    [HttpPost("lookups")]
    public async Task<IActionResult> AddLookupValue([FromBody] CreateLookupValueDto dto, CancellationToken ct = default)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.TypeCode) || string.IsNullOrWhiteSpace(dto.Value))
        {
            return BadRequest(new { message = "TypeCode and Value are required." });
        }

        var created = await _settingsService.AddLookupValueAsync(dto, ct);
        return Ok(created);
    }

    [HttpPut("lookups/{id:guid}")]
    public async Task<IActionResult> UpdateLookupValue(Guid id, [FromBody] UpdateLookupValueDto dto, CancellationToken ct = default)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.Value))
        {
            return BadRequest(new { message = "Value is required." });
        }

        var updated = await _settingsService.UpdateLookupValueAsync(id, dto, ct);
        if (updated == null) return NotFound(new { message = "Lookup value not found." });
        return Ok(updated);
    }

    [HttpDelete("lookups/{id:guid}")]
    public async Task<IActionResult> DeleteLookupValue(Guid id, CancellationToken ct = default)
    {
        var success = await _settingsService.DeleteLookupValueAsync(id, ct);
        if (!success) return NotFound(new { message = "Lookup value not found." });
        return Ok(new { message = "Lookup value deleted successfully." });
    }

    // Case Management Settings Endpoints
    [HttpGet("casetypes")]
    public async Task<IActionResult> GetCaseTypes([FromQuery] bool activeOnly = true, CancellationToken ct = default)
    {
        var types = await _settingsService.GetCaseTypesAsync(activeOnly, ct);
        return Ok(types);
    }

    [HttpPost("casetypes")]
    public async Task<IActionResult> AddCaseType([FromBody] CreateCaseTypeConfigDto dto, CancellationToken ct = default)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.Code))
        {
            return BadRequest(new { message = "Code is required." });
        }

        var created = await _settingsService.AddCaseTypeAsync(dto, ct);
        return Ok(created);
    }

    [HttpPut("casetypes/{id:guid}")]
    public async Task<IActionResult> UpdateCaseType(Guid id, [FromBody] UpdateCaseTypeConfigDto dto, CancellationToken ct = default)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.Code))
        {
            return BadRequest(new { message = "Code is required." });
        }

        var updated = await _settingsService.UpdateCaseTypeAsync(id, dto, ct);
        if (updated == null) return NotFound(new { message = "Case type not found." });
        return Ok(updated);
    }

    [HttpDelete("casetypes/{id:guid}")]
    public async Task<IActionResult> DeleteCaseType(Guid id, CancellationToken ct = default)
    {
        var success = await _settingsService.DeleteCaseTypeAsync(id, ct);
        if (!success) return NotFound(new { message = "Case type not found." });
        return Ok(new { message = "Case type deleted successfully." });
    }

    [HttpGet("subcategories")]
    public async Task<IActionResult> GetSubCategories([FromQuery] Guid? departmentId = null, [FromQuery] bool activeOnly = true, CancellationToken ct = default)
    {
        var items = await _settingsService.GetSubCategoriesAsync(departmentId, activeOnly, ct);
        return Ok(items);
    }

    [HttpPost("subcategories")]
    public async Task<IActionResult> AddSubCategory([FromBody] CreateDepartmentSubCategoryDto dto, CancellationToken ct = default)
    {
        if (dto == null || dto.DepartmentId == Guid.Empty || string.IsNullOrWhiteSpace(dto.Name))
        {
            return BadRequest(new { message = "DepartmentId and Name are required." });
        }

        var created = await _settingsService.AddSubCategoryAsync(dto, ct);
        return Ok(created);
    }

    [HttpPut("subcategories/{id:guid}")]
    public async Task<IActionResult> UpdateSubCategory(Guid id, [FromBody] UpdateDepartmentSubCategoryDto dto, CancellationToken ct = default)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.Name))
        {
            return BadRequest(new { message = "Name is required." });
        }

        var updated = await _settingsService.UpdateSubCategoryAsync(id, dto, ct);
        if (updated == null) return NotFound(new { message = "Sub-category not found." });
        return Ok(updated);
    }

    [HttpDelete("subcategories/{id:guid}")]
    public async Task<IActionResult> DeleteSubCategory(Guid id, CancellationToken ct = default)
    {
        var success = await _settingsService.DeleteSubCategoryAsync(id, ct);
        if (!success) return NotFound(new { message = "Sub-category not found." });
        return Ok(new { message = "Sub-category deleted successfully." });
    }

    [HttpGet("sla")]
    public async Task<IActionResult> GetSlaConfigurations(CancellationToken ct = default)
    {
        var slas = await _settingsService.GetSlaConfigurationsAsync(ct);
        return Ok(slas);
    }

    [HttpPost("sla")]
    public async Task<IActionResult> SaveSlaConfiguration([FromBody] CreateOrUpdateSlaDto dto, CancellationToken ct = default)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.Severity))
        {
            return BadRequest(new { message = "Severity is required." });
        }

        var saved = await _settingsService.SaveSlaConfigurationAsync(dto, ct);
        return Ok(saved);
    }

    // Severity master data (drives SLA Configuration and the Create Case severity dropdown)
    [HttpGet("severities")]
    public async Task<IActionResult> GetSeverities(CancellationToken ct = default)
    {
        var severities = await _settingsService.GetSeverityConfigurationsAsync(ct);
        return Ok(severities);
    }

    [HttpPost("severities")]
    public async Task<IActionResult> AddSeverity([FromBody] CreateSeverityDto dto, CancellationToken ct = default)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.Name))
        {
            return BadRequest(new { message = "Severity name is required." });
        }

        var created = await _settingsService.AddSeverityAsync(dto, ct);
        return Ok(created);
    }

    [HttpPut("severities/{id:guid}")]
    public async Task<IActionResult> UpdateSeverity(Guid id, [FromBody] UpdateSeverityDto dto, CancellationToken ct = default)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.Name))
        {
            return BadRequest(new { message = "Severity name is required." });
        }

        var updated = await _settingsService.UpdateSeverityAsync(id, dto, ct);
        if (updated == null) return NotFound(new { message = "Severity not found." });
        return Ok(updated);
    }

    [HttpDelete("severities/{id:guid}")]
    public async Task<IActionResult> DeleteSeverity(Guid id, CancellationToken ct = default)
    {
        var success = await _settingsService.DeleteSeverityAsync(id, ct);
        if (!success) return NotFound(new { message = "Severity not found." });
        return Ok(new { message = "Severity deleted successfully." });
    }

    [HttpGet("escalation-templates")]
    public async Task<IActionResult> GetEscalationTemplates([FromQuery] Guid? departmentId = null, [FromQuery] string? reason = null, CancellationToken ct = default)
    {
        if (departmentId.HasValue && !string.IsNullOrWhiteSpace(reason))
        {
            var template = await _settingsService.GetEscalationTemplateAsync(departmentId.Value, reason, ct);
            return Ok(template);
        }

        var templates = await _settingsService.GetAllEscalationTemplatesAsync(departmentId, ct);
        return Ok(templates);
    }

    [HttpPost("escalation-templates")]
    public async Task<IActionResult> SaveEscalationTemplate([FromBody] CreateOrUpdateEscalationTemplateDto dto, CancellationToken ct = default)
    {
        if (dto == null || dto.DepartmentId == Guid.Empty || string.IsNullOrWhiteSpace(dto.EscalationReason))
        {
            return BadRequest(new { message = "DepartmentId and EscalationReason are required." });
        }

        var saved = await _settingsService.SaveEscalationTemplateAsync(dto, ct);
        return Ok(saved);
    }

    [HttpDelete("escalation-templates/{id:guid}")]
    public async Task<IActionResult> DeleteEscalationTemplate(Guid id, CancellationToken ct = default)
    {
        var success = await _settingsService.DeleteEscalationTemplateAsync(id, ct);
        if (!success) return NotFound(new { message = "Escalation template not found." });
        return Ok(new { message = "Escalation template deleted successfully." });
    }
}
