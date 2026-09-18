namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Repositories;

public class CustomerService : ICustomerService
{
    private readonly ICustomerRepository _customerRepository;

    public CustomerService(ICustomerRepository customerRepository)
    {
        _customerRepository = customerRepository;
    }

    public async Task<CustomerDetailDto?> GetCustomer360Async(Guid id, CancellationToken ct = default)
    {
        return await _customerRepository.GetCustomerDetailAsync(id, ct);
    }

    public async Task<IEnumerable<Customer>> GetAllCustomersAsync()
    {
        return await _customerRepository.GetAllAsync();
    }

    public async Task<Customer> CreateCustomerAsync(CreateCustomerDto dto, Guid userId)
    {
        if (await _customerRepository.ExistsByNricAsync(dto.NRIC))
            throw new InvalidOperationException($"A customer with the NRIC '{dto.NRIC}' already exists.");

        var newCustomer = new Customer
        {
            FullName = dto.FullName,
            NRIC = dto.NRIC,
            PhoneNumber = dto.PhoneNumber,
            Email = dto.Email,
            Branch = dto.Branch,
            TenureMonths = dto.TenureMonths,
            CustomerSegment = dto.CustomerSegment,
            PreferredLanguage = string.IsNullOrWhiteSpace(dto.PreferredLanguage) ? "Bahasa Malaysia" : dto.PreferredLanguage,
            DateOfBirth = dto.DateOfBirth
        };

        if (dto.CustomAttributes != null && dto.CustomAttributes.Any())
        {
            foreach (var kvp in dto.CustomAttributes)
            {
                if (!string.IsNullOrWhiteSpace(kvp.Key) && !string.IsNullOrWhiteSpace(kvp.Value))
                {
                    newCustomer.CustomAttributes.Add(new CustomerCustomAttribute
                    {
                        Id = Guid.NewGuid(),
                        CustomerId = newCustomer.Id,
                        FieldKey = kvp.Key,
                        FieldValue = kvp.Value,
                        CreatedAt = DateTime.UtcNow
                    });
                }
            }
        }

        return await _customerRepository.AddAsync(newCustomer);
    }

    public async Task<CustomerDetailDto?> SearchCustomerAsync(CustomerSearchDto dto, CancellationToken ct = default)
    {
        return await _customerRepository.SearchCustomerAsync(dto, ct);
    }

    public async Task<IEnumerable<SearchCustomerHitDto>> SearchCustomersAsync(string query, int limit, CancellationToken ct = default)
    {
        return await _customerRepository.SearchCustomersAsync(query, limit, ct);
    }
}
