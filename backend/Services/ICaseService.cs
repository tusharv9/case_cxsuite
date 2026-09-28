namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;

public interface ICaseService
{
    Task<Case> CreateCaseAsync(CreateCaseDto dto, Guid createdByUserId);
    Task<CaseDetailDto?> GetCaseDetailsAsync(Guid caseId, CancellationToken ct = default);
    Task<IEnumerable<SearchCaseHitDto>> SearchCasesAsync(string query, int limit, CancellationToken ct = default);
    Task<IEnumerable<CaseSummaryDto>> GetBoardCasesAsync(Guid? departmentId = null, string? caseType = null, CancellationToken ct = default);
    Task<PagedResponseDto<CaseSummaryDto>> GetPaginatedBoardCasesAsync(string? status = null, int page = 1, int pageSize = 30, Guid? departmentId = null, string? caseType = null, string? search = null, string? priority = null, string? channel = null, CancellationToken ct = default);
    Task UpdateCaseStatusAsync(Guid caseId, UpdateCaseStatusDto dto);
    Task AssignCaseAsync(Guid caseId, AssignCaseDto dto);
    Task AddNoteAsync(Guid caseId, AddNoteDto dto);
    Task AddCoworkersAsync(Guid caseId, List<Guid> coworkerUserIds, Guid addedByUserId);
    Task RemoveCoworkerAsync(Guid caseId, Guid coworkerUserId, Guid removedByUserId);
    Task TransferDepartmentAsync(Guid caseId, TransferDepartmentDto dto, Guid transferredByUserId);
    Task<List<RelatedCustomerCaseDto>> GetRelatedCustomerCasesAsync(Guid caseId);
    Task<LinkCaseResultDto> LinkCaseAsync(Guid caseId, LinkCaseDto dto);

    Task UnlinkCaseAsync(Guid caseId, UnlinkCaseDto dto);
    Task ResolveCaseAsync(Guid caseId, ResolveCaseDto dto);
    Task EscalateCaseAsync(Guid caseId, EscalateCaseDto dto, Guid userId);
    Task EvaluateSlaEscalationsAsync(Guid? caseId = null, CancellationToken ct = default);
    Task<EscalationMatrixResponseDto> GetEscalationMatrixConfigAsync(Guid? caseId = null, CancellationToken ct = default);
    Task<ReopenCaseResultDto> ReopenCaseAsync(Guid caseId, ReopenCaseDto dto);
    Task<PagedResponseDto<CaseAuditEventDto>> GetCaseAuditEventsAsync(int page = 1, int pageSize = 10, string? actionType = null, string? search = null, CancellationToken ct = default);
    Task AddTimelineInteractionAsync(Guid caseId, AddTimelineInteractionDto dto, Guid userId);
    Task RequestSwarmAsync(Guid caseId, RequestSwarmDto dto, Guid userId);
    Task<IEnumerable<CaseAttachmentDto>> GetAttachmentsAsync(Guid caseId, CancellationToken ct = default);
    Task<CaseAttachmentDto> UploadAttachmentAsync(Guid caseId, Microsoft.AspNetCore.Http.IFormFile file, string? note, Guid userId);
    Task<(byte[] fileBytes, string contentType, string fileName)> GetAttachmentDownloadAsync(Guid caseId, Guid attachmentId);

    // Case Collaboration feed (separate from the workflow timeline)
    Task<CaseCollaborationDto> GetCollaborationAsync(Guid caseId, DateTime? before, int limit, CancellationToken ct = default);
    Task<CollaborationActivityDto> AddCollaborationNoteAsync(Guid caseId, string content, Guid userId);

    // Header counts for the Case Management page
    Task<CaseStatsDto> GetCaseStatsAsync(Guid? departmentId, CancellationToken ct = default);

    // Dashboard server-side summary
    Task<DashboardSummaryDto> GetDashboardSummaryAsync(
        Guid? departmentId, string? caseType, string? status, string? severity,
        string? dateRange, string? customStartDate, string? customEndDate,
        Guid? myCasesUserId, CancellationToken ct = default);

    // Paginated case detail timeline
    Task<PagedResponseDto<CaseEventDto>> GetCaseTimelineEventsAsync(
        Guid caseId, DateTime? before, int limit = 50, CancellationToken ct = default);
}
