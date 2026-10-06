namespace CaseManagement.Api.Controllers;

using CaseManagement.Api.Services;
using Microsoft.AspNetCore.Mvc;

/// <summary>
/// One call per form with everything it needs to render and validate itself. Open to every signed-in user: it only
/// carries the configuration they must already see to use the form.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class MetadataController : BaseApiController
{
    private readonly IMetadataService _metadata;

    public MetadataController(IMetadataService metadata) => _metadata = metadata;

    [HttpGet("case-form")]
    public async Task<IActionResult> GetCaseForm(CancellationToken ct) => Ok(await _metadata.GetCaseFormAsync(ct));

    [HttpGet("customer-form")]
    public async Task<IActionResult> GetCustomerForm(CancellationToken ct) => Ok(await _metadata.GetCustomerFormAsync(ct));
}
