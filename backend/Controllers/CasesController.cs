namespace CaseManagement.Api.Controllers;

using CaseManagement.Api.HostIntegration;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Services;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
[RequirePermission(Permissions.CasesRead, Permissions.CasesWrite)]
public class CasesController : BaseApiController
{
    private readonly ICaseService _caseService;

    public CasesController(ICaseService caseService)
    {
        _caseService = caseService;
    }

    [HttpGet]
    public async Task<IActionResult> GetBoardCases(
        [FromQuery] Guid? departmentId,
        [FromQuery] string? caseType,
        [FromQuery] string? status,
        [FromQuery] int? page,
        [FromQuery] int? pageSize,
        [FromQuery] string? search,
        [FromQuery] string? priority,
        [FromQuery] string? channel,
        CancellationToken ct)
    {
        if (page.HasValue)
        {
            var paged = await _caseService.GetPaginatedBoardCasesAsync(
                status,
                page.Value,
                pageSize ?? 30,
                departmentId,
                caseType,
                search,
                priority,
                channel,
                ct);
            return Ok(paged);
        }

        var cases = await _caseService.GetBoardCasesAsync(departmentId, caseType, ct);
        return Ok(cases);
    }

    /// <summary>Open / SLA-breached counts for the Case Management header.</summary>
    [HttpGet("stats")]
    public async Task<IActionResult> GetCaseStats([FromQuery] Guid? departmentId, CancellationToken ct)
    {
        var stats = await _caseService.GetCaseStatsAsync(departmentId, ct);
        return Ok(stats);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetCaseDetails(Guid id, CancellationToken ct)
    {
        var caseDetails = await _caseService.GetCaseDetailsAsync(id, ct);
        if (caseDetails == null) return NotFound();
        return Ok(caseDetails);
    }

    [HttpPost]
    public async Task<IActionResult> CreateCase([FromBody] CreateCaseDto dto)
    {
        var newCase = await _caseService.CreateCaseAsync(dto, CurrentUserId);
        return CreatedAtAction(nameof(GetCaseDetails), new { id = newCase.Id }, newCase);
    }

    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateCaseStatusDto dto)
    {
        dto.UserId = CurrentUserId;
        await _caseService.UpdateCaseStatusAsync(id, dto);
        return Ok(new { message = "Status updated successfully." });
    }

    [HttpPut("{id:guid}/assign")]
    public async Task<IActionResult> AssignCase(Guid id, [FromBody] AssignCaseDto dto)
    {
        dto.UserId = CurrentUserId;
        await _caseService.AssignCaseAsync(id, dto);
        return Ok(new { message = "Case assigned successfully." });
    }

    [HttpPost("{id:guid}/notes")]
    public async Task<IActionResult> AddNote(Guid id, [FromBody] AddNoteDto dto)
    {
        dto.UserId = CurrentUserId;
        await _caseService.AddNoteAsync(id, dto);
        return Ok(new { message = "Note added successfully." });
    }

    [HttpPost("{id:guid}/timeline-interaction")]
    public async Task<IActionResult> AddTimelineInteraction(Guid id, [FromBody] AddTimelineInteractionDto dto)
    {
        dto.UserId = CurrentUserId;
        await _caseService.AddTimelineInteractionAsync(id, dto, CurrentUserId);
        return Ok(new { message = dto.IsInternal ? "Internal note posted successfully." : "Customer reply sent successfully." });
    }

    [HttpPost("{id:guid}/swarm")]
    public async Task<IActionResult> RequestSwarm(Guid id, [FromBody] RequestSwarmDto dto)
    {
        dto.UserId = CurrentUserId;
        await _caseService.RequestSwarmAsync(id, dto, CurrentUserId);
        return Ok(new { message = "Swarm requested successfully. Team Lead and Subject Matter Experts have been notified and added to the case." });
    }

    [HttpGet("{id:guid}/attachments")]
    public async Task<IActionResult> GetAttachments(Guid id, CancellationToken ct)
    {
        var attachments = await _caseService.GetAttachmentsAsync(id, ct);
        return Ok(attachments);
    }

    [HttpPost("{id:guid}/attachments")]
    public async Task<IActionResult> UploadAttachment(Guid id, [FromForm] Microsoft.AspNetCore.Http.IFormFile file, [FromForm] string? note)
    {
        var attachment = await _caseService.UploadAttachmentAsync(id, file, note, CurrentUserId);
        return Ok(attachment);
    }

    [HttpGet("{id:guid}/attachments/{attachmentId:guid}/download")]
    public async Task<IActionResult> DownloadAttachment(Guid id, Guid attachmentId)
    {
        var (fileBytes, contentType, fileName) = await _caseService.GetAttachmentDownloadAsync(id, attachmentId);
        return File(fileBytes, contentType, fileName);
    }

    [HttpPost("{id:guid}/coworkers")]
    public async Task<IActionResult> AddCoworkers(Guid id, [FromBody] AddCoworkersDto dto)
    {
        await _caseService.AddCoworkersAsync(id, dto.CoworkerIds, CurrentUserId);
        return Ok(new { message = "Coworkers added successfully." });
    }

    [HttpDelete("{id:guid}/coworkers/{coworkerId:guid}")]
    public async Task<IActionResult> RemoveCoworker(Guid id, Guid coworkerId)
    {
        await _caseService.RemoveCoworkerAsync(id, coworkerId, CurrentUserId);
        return Ok(new { message = "Coworker removed successfully." });
    }

    /// <summary>Case Collaboration feed: collaborators plus collaboration-only activity, newest first.</summary>
    [HttpGet("{id:guid}/collaboration")]
    public async Task<IActionResult> GetCollaboration(Guid id, [FromQuery] DateTime? before, [FromQuery] int limit = 50, CancellationToken ct = default)
    {
        var result = await _caseService.GetCollaborationAsync(id, before, limit, ct);
        return Ok(result);
    }

    [HttpPost("{id:guid}/collaboration/notes")]
    public async Task<IActionResult> AddCollaborationNote(Guid id, [FromBody] AddCollaborationNoteDto dto)
    {
        var activity = await _caseService.AddCollaborationNoteAsync(id, dto?.Content ?? string.Empty, CurrentUserId);
        return Ok(activity);
    }

    [HttpPut("{id:guid}/transfer")]
    public async Task<IActionResult> TransferDepartment(Guid id, [FromBody] TransferDepartmentDto dto)
    {
        await _caseService.TransferDepartmentAsync(id, dto, CurrentUserId);
        return Ok(new { message = "Department transferred successfully." });
    }

    [HttpGet("{id:guid}/related-customer-cases")]
    public async Task<IActionResult> GetRelatedCustomerCases(Guid id)
    {
        var cases = await _caseService.GetRelatedCustomerCasesAsync(id);
        return Ok(cases);
    }

    [HttpPost("{id:guid}/link")]
    public async Task<IActionResult> LinkCase(Guid id, [FromBody] LinkCaseDto dto)
    {
        dto.UserId = CurrentUserId;
        var result = await _caseService.LinkCaseAsync(id, dto);
        return Ok(result);
    }

    [HttpPost("{id:guid}/unlink")]
    public async Task<IActionResult> UnlinkCase(Guid id, [FromBody] UnlinkCaseDto dto)
    {
        dto.UserId = CurrentUserId;
        await _caseService.UnlinkCaseAsync(id, dto);
        return Ok(new { message = "Case unlinked successfully." });
    }

    [HttpPut("{id:guid}/resolve")]
    public async Task<IActionResult> ResolveCase(Guid id, [FromBody] ResolveCaseDto dto)
    {
        dto.UserId = CurrentUserId;
        await _caseService.ResolveCaseAsync(id, dto);
        return Ok(new { message = "Case resolved successfully." });
    }

    [HttpPut("{id:guid}/reopen")]
    public async Task<IActionResult> ReopenCase(Guid id, [FromBody] ReopenCaseDto dto)
    {
        dto.UserId = CurrentUserId;
        var result = await _caseService.ReopenCaseAsync(id, dto);
        return Ok(result);
    }

    [HttpPost("{id:guid}/escalate")]
    public async Task<IActionResult> EscalateCase(Guid id, [FromBody] EscalateCaseDto dto)
    {
        dto.UserId = CurrentUserId;
        await _caseService.EscalateCaseAsync(id, dto, CurrentUserId);
        return Ok(new { message = "Case escalated successfully." });
    }

    [HttpGet("escalation-matrix")]
    public async Task<IActionResult> GetEscalationMatrix([FromQuery] Guid? caseId, CancellationToken ct)
    {
        var matrix = await _caseService.GetEscalationMatrixConfigAsync(caseId, ct);
        return Ok(matrix);
    }

    [HttpGet("audit")]
    public async Task<IActionResult> GetAuditLogs([FromQuery] int page = 1, [FromQuery] int pageSize = 10, [FromQuery] string? actionType = null, [FromQuery] string? search = null, CancellationToken ct = default)
    {
        var logs = await _caseService.GetCaseAuditEventsAsync(page, pageSize, actionType, search, ct);
        return Ok(logs);
    }

    /// <summary>
    /// Paginated timeline events for the case detail view.
    /// Returns up to <paramref name="limit"/> events older than <paramref name="before"/>.
    /// </summary>
    [HttpGet("{id:guid}/timeline")]
    [HttpGet("{id:guid}/events")]
    public async Task<IActionResult> GetCaseTimeline(
        Guid id,
        [FromQuery] DateTime? before,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        var result = await _caseService.GetCaseTimelineEventsAsync(id, before, Math.Clamp(limit, 1, 200), ct);
        return Ok(result);
    }
}
