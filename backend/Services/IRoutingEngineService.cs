namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;

public interface IRoutingEngineService
{
    Task<IEnumerable<RoutingRuleDto>> GetRulesAsync(CancellationToken ct = default);
    Task<RoutingRuleDto?> GetRuleByIdAsync(Guid id, CancellationToken ct = default);
    Task<RoutingRuleDto> CreateRuleAsync(CreateRoutingRuleDto dto, Guid actingUserId, CancellationToken ct = default);
    Task<RoutingRuleDto> UpdateRuleAsync(Guid id, UpdateRoutingRuleDto dto, Guid actingUserId, CancellationToken ct = default);
    Task<RoutingRuleDto> ToggleRuleAsync(Guid id, Guid actingUserId, CancellationToken ct = default);
    Task DeleteRuleAsync(Guid id, Guid actingUserId, CancellationToken ct = default);
    Task ReorderRulesAsync(ReorderRulesDto dto, Guid actingUserId, CancellationToken ct = default);
    
    Task<AssignmentConfigDto> GetAssignmentConfigAsync(CancellationToken ct = default);
    Task<AssignmentConfigDto> UpdateAssignmentConfigAsync(UpdateAssignmentConfigDto dto, Guid actingUserId, CancellationToken ct = default);

    Task<RoutingDecisionResult> RouteAndAssignCaseAsync(Case newCase, Customer? customer, CancellationToken ct = default);
}
