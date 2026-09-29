namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;

public interface ITeamMonitoringService
{
    Task<TeamMonitoringSummaryDto> GetMonitoringSummaryAsync(CancellationToken ct = default);
    Task<IEnumerable<AgentStatusItemDto>> GetAgentStatusBoardAsync(CancellationToken ct = default);
    Task<IEnumerable<QueueHealthItemDto>> GetQueueHealthAsync(CancellationToken ct = default);
    Task<IEnumerable<SlaAtRiskCaseDto>> GetSlaAtRiskCasesAsync(CancellationToken ct = default);
    Task NudgeAgentAsync(Guid agentId, string? reason, Guid supervisorUserId, CancellationToken ct = default);
}
