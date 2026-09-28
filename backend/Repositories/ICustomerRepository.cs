namespace CaseManagement.Api.Repositories;

using CaseManagement.Api.Models;
using CaseManagement.Api.DTOs;

public interface ICustomerRepository
{
    Task<CustomerDetailDto?> GetCustomerDetailAsync(Guid id, CancellationToken ct = default);
    Task<Customer?> GetByIdAsync(Guid id);
    Task<IEnumerable<Customer>> GetAllAsync();
    Task<Customer> AddAsync(Customer customer);
    Task<bool> ExistsByNricAsync(string nric);
    Task<CustomerDetailDto?> SearchCustomerAsync(CustomerSearchDto dto, CancellationToken ct = default);

    /// <summary>Header smart-search over customers, capped at <paramref name="limit"/> hits.</summary>
    Task<IEnumerable<SearchCustomerHitDto>> SearchCustomersAsync(string query, int limit, CancellationToken ct = default);

    /// <summary>Server-side paginated and filtered list of customers.</summary>
    Task<PagedResponseDto<CustomerSummaryDto>> GetPaginatedAsync(string? search, int page, int pageSize, CancellationToken ct = default);
}
