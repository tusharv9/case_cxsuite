namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Repositories;

public class CustomerService : ICustomerService
{
    private readonly ICustomerRepository _customerRepository;
    private readonly IPiiMaskingService _piiMasking;

    public CustomerService(ICustomerRepository customerRepository, IPiiMaskingService piiMasking)
    {
        _customerRepository = customerRepository;
        _piiMasking = piiMasking;
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
        var idType = string.IsNullOrWhiteSpace(dto.IdType) ? "NRIC Number" : dto.IdType.Trim();
        var idVal = !string.IsNullOrWhiteSpace(dto.IdValue)
            ? dto.IdValue.Trim()
            : (!string.IsNullOrWhiteSpace(dto.NRIC)
                ? dto.NRIC.Trim()
                : (!string.IsNullOrWhiteSpace(dto.Passport)
                    ? dto.Passport.Trim()
                    : (!string.IsNullOrWhiteSpace(dto.AccountNumber)
                        ? dto.AccountNumber.Trim()
                        : string.Empty)));

        string? nricVal = null;
        string? passportVal = null;
        string? accountVal = null;

        if (idType == "Passport Number" || idType.Contains("Passport"))
        {
            passportVal = idVal;
            idType = "Passport Number";
        }
        else if (idType == "Account Number" || idType.Contains("Account"))
        {
            accountVal = idVal;
            idType = "Account Number";
        }
        else
        {
            nricVal = idVal;
            idType = "NRIC Number";
        }

        // Strict Malaysian NRIC Validation
        if (idType == "NRIC Number")
        {
            if (string.IsNullOrWhiteSpace(nricVal) || !CaseManagement.Api.Validators.CreateCustomerDtoValidator.BeValidNric(nricVal))
                throw new ArgumentException("Please enter in correct format");

            if (dto.DateOfBirth.HasValue)
            {
                var datePart = nricVal.Split('-')[0];
                var yy = int.Parse(datePart[..2]);
                var mm = int.Parse(datePart[2..4]);
                var dd = int.Parse(datePart[4..6]);
                var dob = dto.DateOfBirth.Value;
                if (dob.Year % 100 != yy || dob.Month != mm || dob.Day != dd)
                    throw new ArgumentException("Date of Birth does not match the date in the NRIC number.");
            }
        }

        // Duplicate NRIC check (Requirement 6)
        if (!string.IsNullOrWhiteSpace(nricVal))
        {
            if (await _customerRepository.ExistsByNricAsync(nricVal))
                throw new InvalidOperationException("A customer already exists with this NRIC number.");
        }

        // Duplicate Phone Number check (Requirement 6)
        if (!string.IsNullOrWhiteSpace(dto.PhoneNumber))
        {
            if (await _customerRepository.ExistsByPhoneAsync(dto.PhoneNumber))
                throw new InvalidOperationException("A customer already exists with this phone number.");
        }

        // Normalize Phone representation with +60 prefix
        var cleanDigits = dto.PhoneNumber.Trim().Replace(" ", "").Replace("-", "");
        string normalizedPhone;
        if (cleanDigits.StartsWith("+60")) normalizedPhone = "+60 " + cleanDigits[3..];
        else if (cleanDigits.StartsWith("60")) normalizedPhone = "+60 " + cleanDigits[2..];
        else normalizedPhone = "+60 " + cleanDigits;

        var newCustomer = new Customer
        {
            FullName = dto.FullName.Trim(),
            IdType = idType,
            NRIC = nricVal,
            Passport = passportVal,
            AccountNumber = accountVal,
            PhoneNumber = normalizedPhone,
            Email = dto.Email?.Trim(),
            Branch = dto.Branch?.Trim(),
            CustomerSegment = dto.CustomerSegment?.Trim(),
            PreferredLanguage = string.IsNullOrWhiteSpace(dto.PreferredLanguage) ? "Bahasa Malaysia" : dto.PreferredLanguage.Trim(),
            DateOfBirth = dto.DateOfBirth
        };

        // Custom attributes (also mirror idType for any legacy readers)
        newCustomer.CustomAttributes.Add(new CustomerCustomAttribute
        {
            Id = Guid.NewGuid(),
            CustomerId = newCustomer.Id,
            FieldKey = "idType",
            FieldValue = idType,
            CreatedAt = DateTime.UtcNow
        });

        if (dto.CustomAttributes != null && dto.CustomAttributes.Any())
        {
            foreach (var kvp in dto.CustomAttributes)
            {
                if (!string.IsNullOrWhiteSpace(kvp.Key) && !string.IsNullOrWhiteSpace(kvp.Value) && !kvp.Key.Equals("idType", StringComparison.OrdinalIgnoreCase))
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

        try
        {
            return await _customerRepository.AddAsync(newCustomer);
        }
        catch (Microsoft.EntityFrameworkCore.DbUpdateException ex)
        {
            var msg = ex.InnerException?.Message ?? ex.Message;
            if (msg.Contains("IX_Customers_NRIC", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("A customer already exists with this NRIC number.");
            if (msg.Contains("IX_Customers_PhoneNumber", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("A customer already exists with this phone number.");
            throw;
        }
    }

    public async Task<CustomerDetailDto?> SearchCustomerAsync(CustomerSearchDto dto, CancellationToken ct = default)
    {
        return await _customerRepository.SearchCustomerAsync(dto, ct);
    }

    public async Task<IEnumerable<SearchCustomerHitDto>> SearchCustomersAsync(string query, int limit, CancellationToken ct = default)
    {
        var hits = (await _customerRepository.SearchCustomersAsync(query, limit, ct)).ToList();
        foreach (var hit in hits)
        {
            var summary = new CustomerSummaryDto { NRIC = hit.NRIC };
            await _piiMasking.MaskCustomerSummaryAsync(summary, ct);
            hit.NRIC = summary.NRIC;
        }
        return hits;
    }

    public async Task<PagedResponseDto<CustomerSummaryDto>> GetPaginatedCustomersAsync(
        string? search,
        string? preferredLanguage,
        string? branch,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var result = await _customerRepository.GetPaginatedAsync(search, preferredLanguage, branch, page, pageSize, ct);
        foreach (var item in result.Items)
        {
            await _piiMasking.MaskCustomerSummaryAsync(item, ct);
        }
        return result;
    }

    public async Task<PagedResponseDto<CaseSummaryDto>> GetCustomerCasesAsync(Guid customerId, int page, int pageSize, CancellationToken ct = default)
    {
        return await _customerRepository.GetCustomerCasesAsync(customerId, page, pageSize, ct);
    }
}
