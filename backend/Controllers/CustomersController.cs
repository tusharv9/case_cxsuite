namespace CaseManagement.Api.Controllers;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Services;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class CustomersController : BaseApiController
{
    private readonly ICustomerService _customerService;

    public CustomersController(ICustomerService customerService)
    {
        _customerService = customerService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAllCustomers()
    {
        var customers = await _customerService.GetAllCustomersAsync();
        return Ok(customers);
    }

    [HttpGet("{id:guid}/360")]
    public async Task<IActionResult> GetCustomer360(Guid id, CancellationToken ct)
    {
        var customer = await _customerService.GetCustomer360Async(id, ct);
        if (customer == null) return NotFound();
        return Ok(customer);
    }

    [HttpPost]
    public async Task<IActionResult> CreateCustomer([FromBody] CreateCustomerDto dto)
    {
        var newCustomer = await _customerService.CreateCustomerAsync(dto, CurrentUserId);
        return CreatedAtAction(nameof(GetCustomer360), new { id = newCustomer.Id }, newCustomer);
    }

    [HttpPost("search")]
    public async Task<IActionResult> SearchCustomer([FromBody] CustomerSearchDto dto, CancellationToken ct)
    {
        var customer = await _customerService.SearchCustomerAsync(dto, ct);
        if (customer == null)
        {
            return NotFound(new { message = "Customer not found. Please verify the entered information or use Create Customer." });
        }
        return Ok(customer);
    }
}
