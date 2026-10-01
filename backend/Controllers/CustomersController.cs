namespace CaseManagement.Api.Controllers;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Services;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
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
        // Server-side pagination / search / filter when parameters are present
        if (!string.IsNullOrWhiteSpace(search) ||
            !string.IsNullOrWhiteSpace(preferredLanguage) ||
            !string.IsNullOrWhiteSpace(branch) ||
            page > 1 || pageSize < 1000)
        {
            var paged = await _customerService.GetPaginatedCustomersAsync(search, preferredLanguage, branch, page, pageSize, ct);
            return Ok(paged);
        }

        // Legacy: return all (for backward compatibility)
        var customers = await _customerService.GetAllCustomersAsync();
        return Ok(customers);
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
            return CreatedAtAction(nameof(GetCustomer360), new { id = newCustomer.Id }, newCustomer);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("search")]
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
