namespace CaseManagement.Api.Controllers;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Services;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class DashboardController : BaseApiController
{
    private readonly ICaseService _caseService;

    public DashboardController(ICaseService caseService)
    {
        _caseService = caseService;
    }

    /// <summary>
    /// Returns server-side aggregated dashboard KPIs.
    /// The frontend should use this instead of loading every case.
    /// </summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetDashboardSummary(
        [FromQuery] Guid? departmentId,
        [FromQuery] string? caseType,
        [FromQuery] string? status,
        [FromQuery] string? severity,
        [FromQuery] string? dateRange,
        [FromQuery] string? customStartDate,
        [FromQuery] string? customEndDate,
        [FromQuery] bool? myCasesOnly,
        CancellationToken ct)
    {
        Guid? userId = myCasesOnly == true ? CurrentUserId : null;

        var summary = await _caseService.GetDashboardSummaryAsync(
            departmentId, caseType, status, severity,
            dateRange, customStartDate, customEndDate,
            userId, ct);

        return Ok(summary);
    }
}
