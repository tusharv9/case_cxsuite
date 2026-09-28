namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Server-side PII masking that uses FieldConfiguration metadata (IsSensitive, MaskingRule,
/// VisibleChars) to determine how sensitive customer fields are masked in API responses.
///
/// The masking is applied at the DTO layer — raw values never reach the HTTP response
/// for unauthorised callers.
/// </summary>
public interface IPiiMaskingService
{
    /// <summary>Masks a single value according to the configured rule.</summary>
    string Mask(string? rawValue, string maskingRule, int visibleChars = 4);

    /// <summary>Applies masking in-place on a CustomerSummaryDto.</summary>
    Task MaskCustomerSummaryAsync(DTOs.CustomerSummaryDto dto, CancellationToken ct = default);

    /// <summary>Applies masking in-place on a CustomerDetailDto.</summary>
    Task MaskCustomerDetailAsync(DTOs.CustomerDetailDto dto, CancellationToken ct = default);
}

public class PiiMaskingService : IPiiMaskingService
{
    private readonly AppDbContext _context;
    private List<FieldConfiguration>? _cachedConfigs;
    private DateTime _cacheExpiry;
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

    public PiiMaskingService(AppDbContext context)
    {
        _context = context;
    }

    public string Mask(string? rawValue, string maskingRule, int visibleChars = 4)
    {
        if (string.IsNullOrEmpty(rawValue)) return rawValue ?? string.Empty;
        if (string.IsNullOrEmpty(maskingRule) || maskingRule == "None") return rawValue;

        switch (maskingRule)
        {
            case "FullMask":
                return new string('*', rawValue.Length);

            case "HideMiddle":
                if (rawValue.Length <= visibleChars * 2) return new string('*', rawValue.Length);
                var prefix = rawValue[..visibleChars];
                var suffix = rawValue[^visibleChars..];
                var middleLen = rawValue.Length - visibleChars * 2;
                return prefix + new string('*', middleLen) + suffix;

            case "HideFirstShowLast":
                if (rawValue.Length <= visibleChars) return new string('*', rawValue.Length);
                var hiddenLen = rawValue.Length - visibleChars;
                return new string('*', hiddenLen) + rawValue[^visibleChars..];

            default:
                // Unknown rule: mask everything for safety
                return new string('*', rawValue.Length);
        }
    }

    public async Task MaskCustomerSummaryAsync(DTOs.CustomerSummaryDto dto, CancellationToken ct = default)
    {
        if (dto == null) return;

        var configs = await GetFieldConfigsAsync(ct);

        dto.NRIC = MaskField(configs, "nric", dto.NRIC);
        dto.PhoneNumber = MaskField(configs, "phoneNumber", dto.PhoneNumber);

        if (dto.DateOfBirth.HasValue)
        {
            var dobConfig = configs.FirstOrDefault(f =>
                f.IsSensitive && MatchesField(f.ApiField, "dateOfBirth"));
            if (dobConfig != null)
            {
                // For date fields, we null it out when masked
                dto.DateOfBirth = null;
            }
        }
    }

    public async Task MaskCustomerDetailAsync(DTOs.CustomerDetailDto dto, CancellationToken ct = default)
    {
        if (dto == null) return;

        var configs = await GetFieldConfigsAsync(ct);

        dto.NRIC = MaskField(configs, "nric", dto.NRIC);
        dto.PhoneNumber = MaskField(configs, "phoneNumber", dto.PhoneNumber);
        dto.Email = MaskField(configs, "email", dto.Email);

        if (dto.DateOfBirth.HasValue)
        {
            var dobConfig = configs.FirstOrDefault(f =>
                f.IsSensitive && MatchesField(f.ApiField, "dateOfBirth"));
            if (dobConfig != null)
            {
                dto.DateOfBirth = null;
            }
        }
    }

    private string MaskField(List<FieldConfiguration> configs, string apiField, string? rawValue)
    {
        if (string.IsNullOrEmpty(rawValue)) return rawValue ?? string.Empty;

        var config = configs.FirstOrDefault(f =>
            f.IsSensitive && MatchesField(f.ApiField, apiField));

        if (config == null) return rawValue;

        return Mask(rawValue, config.MaskingRule, config.VisibleChars);
    }

    private static bool MatchesField(string configField, string targetField)
    {
        return string.Equals(configField, targetField, StringComparison.OrdinalIgnoreCase) ||
               string.Equals(configField, targetField.Replace("_", ""), StringComparison.OrdinalIgnoreCase);
    }

    private async Task<List<FieldConfiguration>> GetFieldConfigsAsync(CancellationToken ct)
    {
        if (_cachedConfigs != null && DateTime.UtcNow < _cacheExpiry)
            return _cachedConfigs;

        _cachedConfigs = await _context.FieldConfigurations
            .AsNoTracking()
            .Where(f => f.IsSensitive)
            .ToListAsync(ct);
        _cacheExpiry = DateTime.UtcNow.Add(CacheDuration);
        return _cachedConfigs;
    }
}
