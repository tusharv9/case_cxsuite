namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Repositories;

public class CustomerService : ICustomerService
{
    private readonly ICustomerRepository _customerRepository;
    private readonly IPiiMaskingService _piiMasking;
    private readonly IFieldValidationEngine _fieldValidation;

    public CustomerService(ICustomerRepository customerRepository, IPiiMaskingService piiMasking, IFieldValidationEngine fieldValidation)
    {
        _customerRepository = customerRepository;
        _piiMasking = piiMasking;
        _fieldValidation = fieldValidation;
    }

    public async Task<CustomerDetailDto?> GetCustomer360Async(Guid id, CancellationToken ct = default)
    {
        return await _customerRepository.GetCustomerDetailAsync(id, ct);
    }

    public async Task<Customer> CreateCustomerAsync(CreateCustomerDto dto, Guid userId)
    {
        var idVal = !string.IsNullOrWhiteSpace(dto.IdValue)
            ? dto.IdValue.Trim()
            : (!string.IsNullOrWhiteSpace(dto.NRIC)
                ? dto.NRIC.Trim()
                : (!string.IsNullOrWhiteSpace(dto.Passport)
                    ? dto.Passport.Trim()
                    : (!string.IsNullOrWhiteSpace(dto.AccountNumber)
                        ? dto.AccountNumber.Trim()
                        : string.Empty)));

        // Required / optional, lengths, patterns, field types, lookup membership and custom fields all come from
        // the "Add New Customer" field configuration.
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["fullName"] = dto.FullName,
            ["idType"] = dto.IdType,
            ["idValue"] = idVal,
            ["dateOfBirth"] = dto.DateOfBirth?.ToString("yyyy-MM-dd"),
            ["phoneNumber"] = dto.PhoneNumber,
            ["email"] = dto.Email,
            ["preferredLanguage"] = dto.PreferredLanguage,
            ["branch"] = dto.Branch,
        };
        foreach (var (key, value) in dto.CustomAttributes ?? new Dictionary<string, string>())
            values[key] = value;

        var validation = await _fieldValidation.ValidateAsync(
            "Customer360", "AddNewCustomer", values, customFieldKeys: dto.CustomAttributes?.Keys);
        validation.ThrowIfInvalid();

        var idType = validation.Normalized["idType"];     // locked-required, so present; configured spelling
        string Normalized(string field) => validation.Normalized.TryGetValue(field, out var v) ? v : string.Empty;

        string? nricVal = null;
        string? passportVal = null;
        string? accountVal = null;

        if (idType.Equals("Passport Number", StringComparison.OrdinalIgnoreCase))
        {
            passportVal = idVal;
            idType = "Passport Number";
        }
        else if (idType.Equals("Account Number", StringComparison.OrdinalIgnoreCase))
        {
            accountVal = idVal;
            idType = "Account Number";
        }
        else if (idType.Equals("NRIC Number", StringComparison.OrdinalIgnoreCase))
        {
            nricVal = idVal;
            idType = "NRIC Number";
        }
        else
        {
            // Enabled in the ID_TYPE lookup but nowhere to store it yet: say so instead of filing it as an NRIC.
            throw new FieldValidationException(new[] { new FieldError("idType", $"ID type '{idType}' is not supported by this system yet.") });
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

        // Normalize Phone representation with +60 prefix (an optional field may be blank)
        var normalizedPhone = string.Empty;
        if (!string.IsNullOrWhiteSpace(dto.PhoneNumber))
        {
            var cleanDigits = dto.PhoneNumber.Trim().Replace(" ", "").Replace("-", "");
            if (cleanDigits.StartsWith("+60")) normalizedPhone = "+60 " + cleanDigits[3..];
            else if (cleanDigits.StartsWith("60")) normalizedPhone = "+60 " + cleanDigits[2..];
            else normalizedPhone = "+60 " + cleanDigits;

            // Duplicate Phone Number check (on the stored, normalised form — what the unique index compares)
            if (await _customerRepository.ExistsByPhoneAsync(normalizedPhone) || await _customerRepository.ExistsByPhoneAsync(dto.PhoneNumber))
                throw new InvalidOperationException("A customer already exists with this phone number.");
        }

        var newCustomer = new Customer
        {
            FullName = Normalized("fullName"),
            IdType = idType,
            NRIC = nricVal,
            Passport = passportVal,
            AccountNumber = accountVal,
            PhoneNumber = normalizedPhone,
            Email = Normalized("email"),
            Branch = Normalized("branch"),
            CustomerSegment = dto.CustomerSegment?.Trim(),
            PreferredLanguage = Normalized("preferredLanguage"),
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

        foreach (var key in (dto.CustomAttributes ?? new Dictionary<string, string>()).Keys)
        {
            var value = Normalized(key);
            if (value.Length == 0 || key.Equals("idType", StringComparison.OrdinalIgnoreCase)) continue;
            newCustomer.CustomAttributes.Add(new CustomerCustomAttribute
            {
                Id = Guid.NewGuid(),
                CustomerId = newCustomer.Id,
                FieldKey = key,
                FieldValue = value,
                CreatedAt = DateTime.UtcNow
            });
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
            await _piiMasking.MaskAsync(hit, ct);
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
