namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;

public interface ICaseService
{
    Task<Case> CreateCaseAsync(CreateCaseDto dto, Guid createdByUserId);
    Task<CaseDetailDto?> GetCaseDetailsAsync(Guid caseId, CancellationToken ct = default);
    Task<IEnumerable<SearchCaseHitDto>> SearchCasesAsync(string query, int limit, CancellationToken ct = default);
    Task<IEnumerable<CaseSummaryDto>> GetBoardCasesAsync(Guid? departmentId = null, string? caseType = null, CancellationToken ct = default);
    Task UpdateCaseStatusAsync(Guid caseId, UpdateCaseStatusDto dto);
    Task AssignCaseAsync(Guid caseId, AssignCaseDto dto);
    Task AddNoteAsync(Guid caseId, AddNoteDto dto);
    Task AddCoworkersAsync(Guid caseId, List<Guid> coworkerUserIds, Guid addedByUserId);
    Task RemoveCoworkerAsync(Guid caseId, Guid coworkerUserId, Guid removedByUserId);
    Task TransferDepartmentAsync(Guid caseId, Guid newDepartmentId, Guid transferredByUserId);
    Task<LinkCaseResultDto> LinkCaseAsync(Guid caseId, LinkCaseDto dto);
    Task UnlinkCaseAsync(Guid caseId, UnlinkCaseDto dto);
    Task ResolveCaseAsync(Guid caseId, ResolveCaseDto dto);
    Task<ReopenCaseResultDto> ReopenCaseAsync(Guid caseId, ReopenCaseDto dto);
    Task<PagedResponseDto<CaseAuditEventDto>> GetCaseAuditEventsAsync(int page = 1, int pageSize = 10, string? actionType = null, string? search = null, CancellationToken ct = default);
}
