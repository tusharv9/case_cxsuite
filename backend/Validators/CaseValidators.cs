namespace CaseManagement.Api.Validators;

using CaseManagement.Api.DTOs;
using FluentValidation;

/// <summary>
/// STRUCTURAL checks only — things that are true of an identity document regardless of configuration (an NRIC has
/// a valid embedded date, a passport is alphanumeric…), applied when a value is present. Whether a field is
/// required, which dropdown values are valid, lengths and patterns are the administrator's configuration, applied by
/// the validation engine, not hard-coded here.
/// </summary>
public class CreateCustomerDtoValidator : AbstractValidator<CreateCustomerDto>
{
    /// <summary>ID types the customer record can currently store (it has a column for each).</summary>
    public static readonly string[] SupportedIdTypes = { "NRIC Number", "Passport Number", "Account Number" };

    public CreateCustomerDtoValidator()
    {
        RuleFor(x => x.FullName).MaximumLength(100);

        RuleFor(x => x.IdType)
            .Must(t => string.IsNullOrWhiteSpace(t) || SupportedIdTypes.Contains(t.Trim(), StringComparer.OrdinalIgnoreCase))
            .WithMessage(x => $"ID type '{x.IdType}' is not supported. Supported: {string.Join(", ", SupportedIdTypes)}.");

        RuleFor(x => x)
            .Must(HaveValidIdValue)
            .When(x => !string.IsNullOrWhiteSpace(GetEffectiveIdValue(x)))
            .WithMessage(x => GetIdValidationErrorMessage(x.IdType, GetEffectiveIdValue(x)));

        RuleFor(x => x)
            .Must(MatchDateOfBirthWithNric)
            .WithMessage("Date of Birth does not match the date in the NRIC number.");

        RuleFor(x => x.DateOfBirth)
            .LessThan(DateTime.UtcNow).WithMessage("Date of Birth must be in the past.")
            .When(x => x.DateOfBirth.HasValue);
    }

    private static string GetEffectiveIdValue(CreateCustomerDto dto)
    {
        if (!string.IsNullOrWhiteSpace(dto.IdValue)) return dto.IdValue.Trim();
        if (dto.IdType == "Passport Number" && !string.IsNullOrWhiteSpace(dto.Passport)) return dto.Passport.Trim();
        if (dto.IdType == "Account Number" && !string.IsNullOrWhiteSpace(dto.AccountNumber)) return dto.AccountNumber.Trim();
        if (!string.IsNullOrWhiteSpace(dto.NRIC)) return dto.NRIC.Trim();
        return string.Empty;
    }

    private static bool HaveValidIdValue(CreateCustomerDto dto)
    {
        var id = GetEffectiveIdValue(dto);
        if (string.IsNullOrWhiteSpace(id)) return false;

        return dto.IdType switch
        {
            "Passport Number" => BeValidPassport(id),
            "Account Number" => BeValidAccountNumber(id),
            _ => BeValidNric(id)
        };
    }

    private static bool MatchDateOfBirthWithNric(CreateCustomerDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.IdType) || !dto.IdType.Contains("NRIC", StringComparison.OrdinalIgnoreCase)) return true;
        if (!dto.DateOfBirth.HasValue) return true;

        var id = GetEffectiveIdValue(dto);
        if (!BeValidNric(id)) return true; // Handled by HaveValidIdValue

        var datePart = id.Split('-')[0];
        var yy = int.Parse(datePart[..2]);
        var mm = int.Parse(datePart[2..4]);
        var dd = int.Parse(datePart[4..6]);

        var dob = dto.DateOfBirth.Value;
        return (dob.Year % 100 == yy && dob.Month == mm && dob.Day == dd);
    }

    private static string GetIdValidationErrorMessage(string? idType, string idValue)
    {
        if (string.IsNullOrWhiteSpace(idValue)) return "This field is required";
        return idType switch
        {
            "Passport Number" => "Passport number must be 6 to 12 alphanumeric characters with no spaces or symbols (e.g. A98765432).",
            "Account Number" => "Account number must be 4 to 25 alphanumeric characters (e.g. ACC-12345).",
            _ => "Please enter in correct format"
        };
    }

    public static bool BeValidNric(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return false;
        var clean = id.Trim();

        // Expected structure: YYMMDD-PB-###G (14 chars)
        if (!System.Text.RegularExpressions.Regex.IsMatch(clean, @"^\d{6}-\d{2}-\d{4}$"))
            return false;

        var parts = clean.Split('-');
        var datePart = parts[0];
        var pbPart = parts[1];
        var serialGenderPart = parts[2];

        if (!int.TryParse(datePart[..2], out var yy) ||
            !int.TryParse(datePart[2..4], out var mm) ||
            !int.TryParse(datePart[4..6], out var dd))
            return false;

        if (mm < 1 || mm > 12) return false;

        int maxDays;
        if (mm == 2)
        {
            // February leap year check: YY divisible by 4 allows 29, otherwise 28
            maxDays = (yy % 4 == 0) ? 29 : 28;
        }
        else if (mm == 4 || mm == 6 || mm == 9 || mm == 11)
        {
            maxDays = 30;
        }
        else
        {
            maxDays = 31;
        }

        if (dd < 1 || dd > maxDays) return false;

        // PB — Place of Birth code: numeric in range 01–99
        if (!int.TryParse(pbPart, out var pb) || pb < 1 || pb > 99)
            return false;

        // Serial number (3 digits) + Gender indicator (1 digit) = 4 digits
        if (serialGenderPart.Length != 4 || !serialGenderPart.All(char.IsDigit))
            return false;

        return true;
    }

    public static bool BeValidPassport(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return false;
        var clean = id.Trim();
        return System.Text.RegularExpressions.Regex.IsMatch(clean, @"^[A-Za-z0-9]{6,12}$");
    }

    public static bool BeValidAccountNumber(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return false;
        var clean = id.Trim();
        return System.Text.RegularExpressions.Regex.IsMatch(clean, @"^[A-Za-z0-9\-]{4,25}$");
    }

    public static bool BeValidMalaysiaPhoneNumber(string phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return false;
        var clean = phone.Trim().Replace(" ", "").Replace("-", "");
        string digits;
        if (clean.StartsWith("+60")) digits = clean[3..];
        else if (clean.StartsWith("60")) digits = clean[2..];
        else digits = clean;

        return digits.Length == 10 && digits.All(char.IsDigit);
    }
}

/// <summary>
/// Sanity limits only. Whether a case field is REQUIRED, how long it may be and what it must match are the
/// administrator's decisions (field configuration), applied by the validation engine — not fixed here.
/// </summary>
public class CreateCaseDtoValidator : AbstractValidator<CreateCaseDto>
{
    public CreateCaseDtoValidator()
    {
        RuleFor(x => x.Title).MaximumLength(500);
        RuleFor(x => x.Description).MaximumLength(20000);
        RuleFor(x => x.Severity).MaximumLength(50);
    }
}

public class AddNoteDtoValidator : AbstractValidator<AddNoteDto>
{
    public AddNoteDtoValidator()
    {
        RuleFor(x => x.Message).NotEmpty().MaximumLength(1000);
    }
}
