namespace CaseManagement.Api.Controllers;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Services;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/team-monitoring")]
public class TeamMonitoringController : BaseApiController
{
    private readonly ITeamMonitoringService _monitoringService;

    public TeamMonitoringController(ITeamMonitoringService monitoringService)
    {
        _monitoringService = monitoringService;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(CancellationToken ct)
    {
        var summary = await _monitoringService.GetMonitoringSummaryAsync(ct);
        return Ok(summary);
    }

    [HttpGet("agent-board")]
    public async Task<IActionResult> GetAgentBoard(CancellationToken ct)
    {
        var board = await _monitoringService.GetAgentStatusBoardAsync(ct);
        return Ok(board);
    }

    [HttpGet("queue-health")]
    public async Task<IActionResult> GetQueueHealth(CancellationToken ct)
    {
        var health = await _monitoringService.GetQueueHealthAsync(ct);
        return Ok(health);
    }

    [HttpGet("sla-at-risk")]
    public async Task<IActionResult> GetSlaAtRisk(CancellationToken ct)
    {
        var atRisk = await _monitoringService.GetSlaAtRiskCasesAsync(ct);
        return Ok(atRisk);
    }

    [HttpPost("nudge/{agentId:guid}")]
    public async Task<IActionResult> NudgeAgent(Guid agentId, [FromBody] NudgeAgentDto? dto, CancellationToken ct)
    {
        await _monitoringService.NudgeAgentAsync(agentId, dto?.Reason, CurrentUserId, ct);
        return Ok(new { message = "Agent has been nudged successfully." });
    }
}
