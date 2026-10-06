namespace CaseManagement.Api.Controllers;

using CaseManagement.Api.HostIntegration;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Services;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
[RequirePermission(Permissions.CustomersRead, Permissions.CustomersWrite)]
public class CustomersController : BaseApiController
{
    private readonly ICustomerService _customerService;
    private readonly IPiiMaskingService _piiMasking;

    public CustomersController(ICustomerService customerService, IPiiMaskingService piiMasking)
    {
        _customerService = customerService;
        _piiMasking = piiMasking;
    }

    [HttpGet]
    public async Task<IActionResult> GetAllCustomers(
        [FromQuery] string? search,
        [FromQuery] string? preferredLanguage,
        [FromQuery] string? branch,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        // Always paginated (and masked per row by the service). The former "return every customer"
        // branch handed out raw entities for large page sizes, so it is gone; page size is capped.
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var paged = await _customerService.GetPaginatedCustomersAsync(search, preferredLanguage, branch, page, pageSize, ct);
        return Ok(paged);
    }

    [HttpGet("{id:guid}/360")]
    public async Task<IActionResult> GetCustomer360(Guid id, CancellationToken ct)
    {
        var customer = await _customerService.GetCustomer360Async(id, ct);
        if (customer == null) return NotFound();

        // Apply PII masking based on FieldConfiguration metadata
        await _piiMasking.MaskCustomerDetailAsync(customer, ct);

        return Ok(customer);
    }

    [HttpGet("{id:guid}/cases")]
    public async Task<IActionResult> GetCustomerCases(
        Guid id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken ct = default)
    {
        var result = await _customerService.GetCustomerCasesAsync(id, page, pageSize, ct);
        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> CreateCustomer([FromBody] CreateCustomerDto dto)
    {
        try
        {
            var newCustomer = await _customerService.CreateCustomerAsync(dto, CurrentUserId);

            // Respond with the same masked view everyone gets, never the stored entity.
            var detail = await _customerService.GetCustomer360Async(newCustomer.Id);
            if (detail != null) await _piiMasking.MaskCustomerDetailAsync(detail);
            return CreatedAtAction(nameof(GetCustomer360), new { id = newCustomer.Id }, detail);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("search")]
    [RequirePermission(Permissions.CustomersRead)] // a read, even though it is a POST
    public async Task<IActionResult> SearchCustomer([FromBody] CustomerSearchDto dto, CancellationToken ct)
    {
        var customer = await _customerService.SearchCustomerAsync(dto, ct);
        if (customer == null)
        {
            return NotFound(new { message = "Customer not found. Please verify the entered information or use Create Customer." });
        }

        // Apply PII masking before returning
        await _piiMasking.MaskCustomerDetailAsync(customer, ct);

        return Ok(customer);
    }
}
