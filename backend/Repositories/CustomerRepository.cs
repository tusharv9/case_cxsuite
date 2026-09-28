namespace CaseManagement.Api.Repositories;

using CaseManagement.Api.Data;
using CaseManagement.Api.Models;
using CaseManagement.Api.DTOs;
using Microsoft.EntityFrameworkCore;

public class CustomerRepository : ICustomerRepository
{
    private readonly AppDbContext _context;

    public CustomerRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<CustomerDetailDto?> GetCustomerDetailAsync(Guid id, CancellationToken ct = default)
    {
        return await _context.Customers
            .AsNoTracking()
            .AsSplitQuery() // Protects against explosion if we add more nested fields later
            .Where(c => c.Id == id)
            .MapToCustomerDetail()
            .FirstOrDefaultAsync(ct);
    }

    public async Task<Customer?> GetByIdAsync(Guid id)
    {
        return await _context.Customers
            .Include(c => c.Cases)
            .FirstOrDefaultAsync(c => c.Id == id);
    }

    public async Task<IEnumerable<Customer>> GetAllAsync()
    {
        return await _context.Customers.ToListAsync();
    }

    public async Task<Customer> AddAsync(Customer customer)
    {
        _context.Customers.Add(customer);
        await _context.SaveChangesAsync();
        return customer;
    }

    public async Task<bool> ExistsByNricAsync(string nric)
    {
        return await _context.Customers.AnyAsync(c => c.NRIC == nric);
    }

    /// <summary>
    /// Header smart-search over customers. Matches the same three fields the old client-side
    /// filter did (name, NRIC, phone), but as an indexed-scan-friendly database query that
    /// returns at most <paramref name="limit"/> narrow rows instead of the whole table.
    /// </summary>
    public async Task<IEnumerable<SearchCustomerHitDto>> SearchCustomersAsync(string query, int limit, CancellationToken ct = default)
    {
        var pattern = SqlSearchPattern.Contains(query);

        return await _context.Customers
            .AsNoTracking()
            .Where(c => EF.Functions.ILike(c.FullName, pattern)
                     || EF.Functions.ILike(c.NRIC, pattern)
                     || EF.Functions.ILike(c.PhoneNumber, pattern))
            .OrderBy(c => c.FullName)
            .Take(limit)
            .Select(c => new SearchCustomerHitDto
            {
                Id = c.Id,
                FullName = c.FullName,
                NRIC = c.NRIC
            })
            .ToListAsync(ct);
    }

    public async Task<PagedResponseDto<CustomerSummaryDto>> GetPaginatedAsync(string? search, int page, int pageSize, CancellationToken ct = default)
    {
        var query = _context.Customers.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = SqlSearchPattern.Contains(search.Trim());
            query = query.Where(c => EF.Functions.ILike(c.FullName, pattern)
                                  || EF.Functions.ILike(c.NRIC, pattern)
                                  || EF.Functions.ILike(c.PhoneNumber, pattern));
        }

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderBy(c => c.FullName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new CustomerSummaryDto
            {
                Id = c.Id,
                FullName = c.FullName,
                NRIC = c.NRIC,
                PhoneNumber = c.PhoneNumber,
                DateOfBirth = c.DateOfBirth,
                OpenCasesCount = c.Cases.Count(x => x.Status != CaseStatus.Resolved && x.Status != CaseStatus.Closed && x.Status != CaseStatus.Cancelled),
                TotalCasesCount = c.Cases.Count()
            })
            .ToListAsync(ct);

        return new PagedResponseDto<CustomerSummaryDto>
        {
            Items = items,
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        };
    }

    public async Task<CustomerDetailDto?> SearchCustomerAsync(CustomerSearchDto dto, CancellationToken ct = default)
    {
        var query = _context.Customers.AsNoTracking().AsQueryable();

        bool hasFilter = false;

        if (!string.IsNullOrWhiteSpace(dto.IdValue))
        {
            var cleanId = dto.IdValue.Trim();
            query = query.Where(c => c.NRIC == cleanId || c.NRIC.Replace("-", "") == cleanId.Replace("-", ""));
            hasFilter = true;
        }

        if (!string.IsNullOrWhiteSpace(dto.PhoneNumber))
        {
            var cleanPhone = dto.PhoneNumber.Trim().Replace(" ", "").Replace("-", "");
            query = query.Where(c => c.PhoneNumber.Replace(" ", "").Replace("-", "").Contains(cleanPhone) || cleanPhone.Contains(c.PhoneNumber.Replace(" ", "").Replace("-", "")));
            hasFilter = true;
        }

        if (dto.DateOfBirth.HasValue)
        {
            var dob = dto.DateOfBirth.Value.Date;
            query = query.Where(c => c.DateOfBirth.HasValue && c.DateOfBirth.Value.Date == dob);
            hasFilter = true;
        }

        if (!hasFilter) return null;

        return await query.MapToCustomerDetail().FirstOrDefaultAsync(ct);
    }
}
