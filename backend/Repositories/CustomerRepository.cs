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
        if (string.IsNullOrWhiteSpace(nric)) return false;
        var clean = nric.Trim();
        var unhyphenated = clean.Replace("-", "").Replace(" ", "");
        return await _context.Customers.AnyAsync(c =>
            (c.NRIC != null && (c.NRIC == clean || c.NRIC.Replace("-", "").Replace(" ", "") == unhyphenated)));
    }

    public async Task<bool> ExistsByPhoneAsync(string phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return false;
        var clean = phone.Trim().Replace(" ", "").Replace("-", "");
        return await _context.Customers.AnyAsync(c =>
            c.PhoneNumber.Replace(" ", "").Replace("-", "") == clean);
    }

    /// <summary>
    /// Header smart-search over customers. Matches name, NRIC, Passport, AccountNumber, phone.
    /// </summary>
    public async Task<IEnumerable<SearchCustomerHitDto>> SearchCustomersAsync(string query, int limit, CancellationToken ct = default)
    {
        var pattern = SqlSearchPattern.Contains(query);

        return await _context.Customers
            .AsNoTracking()
            .Where(c => EF.Functions.ILike(c.FullName, pattern)
                     || (c.NRIC != null && EF.Functions.ILike(c.NRIC, pattern))
                     || (c.Passport != null && EF.Functions.ILike(c.Passport, pattern))
                     || (c.AccountNumber != null && EF.Functions.ILike(c.AccountNumber, pattern))
                     || EF.Functions.ILike(c.PhoneNumber, pattern))
            .OrderBy(c => c.FullName)
            .Take(limit)
            .Select(c => new SearchCustomerHitDto
            {
                Id = c.Id,
                FullName = c.FullName,
                NRIC = c.IdType == "Passport Number" ? (c.Passport ?? c.NRIC ?? "") : (c.IdType == "Account Number" ? (c.AccountNumber ?? c.NRIC ?? "") : (c.NRIC ?? ""))
            })
            .ToListAsync(ct);
    }

    public async Task<PagedResponseDto<CustomerSummaryDto>> GetPaginatedAsync(
        string? search,
        string? preferredLanguage,
        string? branch,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var query = _context.Customers.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = SqlSearchPattern.Contains(search.Trim());
            query = query.Where(c => EF.Functions.ILike(c.FullName, pattern)
                                  || (c.NRIC != null && EF.Functions.ILike(c.NRIC, pattern))
                                  || (c.Passport != null && EF.Functions.ILike(c.Passport, pattern))
                                  || (c.AccountNumber != null && EF.Functions.ILike(c.AccountNumber, pattern))
                                  || EF.Functions.ILike(c.PhoneNumber, pattern)
                                  || (c.Branch != null && EF.Functions.ILike(c.Branch, pattern)));
        }

        if (!string.IsNullOrWhiteSpace(preferredLanguage) && preferredLanguage != "all")
        {
            query = query.Where(c => c.PreferredLanguage == preferredLanguage);
        }

        if (!string.IsNullOrWhiteSpace(branch) && branch != "all")
        {
            query = query.Where(c => c.Branch == branch);
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
                Passport = c.Passport,
                AccountNumber = c.AccountNumber,
                IdType = !string.IsNullOrEmpty(c.IdType) ? c.IdType : (c.CustomAttributes
                    .Where(ca => ca.FieldKey == "idType" || ca.FieldKey == "IdType")
                    .Select(ca => ca.FieldValue)
                    .FirstOrDefault() ?? "NRIC Number"),
                IdValue = c.IdType == "Passport Number" ? (c.Passport ?? c.NRIC ?? "") : (c.IdType == "Account Number" ? (c.AccountNumber ?? c.NRIC ?? "") : (c.NRIC ?? "")),
                PhoneNumber = c.PhoneNumber,
                DateOfBirth = c.DateOfBirth,
                Branch = c.Branch,
                PreferredLanguage = c.PreferredLanguage,
                OpenCasesCount = c.Cases.Count(x => x.Status != CaseStatus.Resolved && x.Status != CaseStatus.Closed && x.Status != CaseStatus.Cancelled),
                TotalCasesCount = c.Cases.Count(),
                CustomAttributes = c.CustomAttributes.Select(ca => new CustomerCustomAttributeDto
                {
                    FieldKey = ca.FieldKey,
                    FieldValue = ca.FieldValue
                }).ToList()
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
            var unhyphenated = cleanId.Replace("-", "").Replace(" ", "");
            query = query.Where(c => (c.NRIC != null && (c.NRIC == cleanId || c.NRIC.Replace("-", "") == unhyphenated))
                                  || (c.Passport != null && (c.Passport == cleanId || c.Passport.ToUpper() == cleanId.ToUpper()))
                                  || (c.AccountNumber != null && (c.AccountNumber == cleanId || c.AccountNumber.Replace("-", "") == unhyphenated)));
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

    public async Task<PagedResponseDto<CaseSummaryDto>> GetCustomerCasesAsync(Guid customerId, int page, int pageSize, CancellationToken ct = default)
    {
        var query = _context.Cases
            .AsNoTracking()
            .Where(c => c.CustomerId == customerId);

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(c => c.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(caseItem => new CaseSummaryDto
            {
                Id = caseItem.Id,
                CaseNumber = caseItem.CaseNumber.StartsWith("S-") ? caseItem.CaseNumber : (caseItem.CaseNumber.StartsWith("I-") || caseItem.CaseNumber.StartsWith("E-") ? (caseItem.CaseNumber.StartsWith("E-") ? caseItem.CaseNumber.Replace("E-", "I-") : caseItem.CaseNumber) : caseItem.CaseNumber),
                Title = caseItem.Title,
                Status = caseItem.Status.ToString(),
                Severity = caseItem.Severity,
                SlaStartTime = caseItem.SlaStartTime,
                SlaTargetHours = caseItem.SlaTargetHours,
                ResolvedAt = caseItem.ResolvedAt,
                DepartmentId = caseItem.DepartmentId,
                DepartmentName = caseItem.Department != null ? caseItem.Department.Name : string.Empty,
                OwnerId = caseItem.OwnerId,
                OwnerName = caseItem.Owner != null ? caseItem.Owner.Name : string.Empty,
                CreatedAt = caseItem.CreatedAt,
                CustomerId = caseItem.CustomerId,
                CustomerName = caseItem.Customer != null ? caseItem.Customer.FullName : string.Empty,
                CaseType = string.IsNullOrEmpty(caseItem.CaseType) ? (caseItem.CaseNumber.StartsWith("S-") ? "Service" : ((caseItem.CaseNumber.StartsWith("I-") || caseItem.CaseNumber.StartsWith("E-")) ? "Inquiry" : "Complaint")) : caseItem.CaseType,
                SlaPausedAt = caseItem.SlaPausedAt,
                SlaTotalPausedMinutes = caseItem.SlaTotalPausedMinutes,
                Subcategory = caseItem.Subcategory ?? "General Inquiry",
                PreferredLanguage = caseItem.Customer != null ? caseItem.Customer.PreferredLanguage : "Bahasa Malaysia",
                SourceChannel = caseItem.SourceChannel ?? caseItem.CommunicationChannel ?? "Voice",
                PreferredCommunicationChannel = caseItem.PreferredCommunicationChannel ?? "Phone",
                CommunicationChannel = caseItem.SourceChannel ?? caseItem.CommunicationChannel ?? "Voice",
                ChildRelations = caseItem.ChildRelations.Select(cr => new CaseChildRelationDto
                {
                    ChildId = cr.ChildId,
                    RelationType = cr.RelationType.ToString(),
                    LinkedCaseNumber = cr.LinkedCase != null ? cr.LinkedCase.CaseNumber : null,
                    LinkedCaseTitle = cr.LinkedCase != null ? cr.LinkedCase.Title : null,
                    Reason = cr.Reason,
                    CreatedByName = cr.CreatedByUser != null ? cr.CreatedByUser.Name : string.Empty,
                    CreatedAt = cr.CreatedAt
                }).ToList()
            })
            .ToListAsync(ct);

        return new PagedResponseDto<CaseSummaryDto>
        {
            Items = items,
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        };
    }
}
