namespace CaseManagement.Api.Services;

using System.Reflection;
using CaseManagement.Api.Data;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.HostIntegration;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Server-side masking of customer data, driven by field configuration (MaskingRule,
/// VisibleChars). This is the ONLY place masking happens: the API never sends a sensitive value the
/// caller is not entitled to see, so there is nothing for a browser to "mask" afterwards.
///
/// Deny-by-default: a caller sees raw values only if they hold the explicit <c>pii.unmask</c> permission
/// (not implied by the "*" wildcard). Background work with no caller therefore gets masked data too.
/// </summary>
public interface IPiiMaskingService
{
    /// <summary>Masks a single value according to the configured rule.</summary>
    string Mask(string? rawValue, string maskingRule, int visibleChars = 4);

    /// <summary>Masks every configured sensitive property of a customer-shaped DTO, in place.</summary>
    Task MaskAsync(object? dto, CancellationToken ct = default);

    /// <summary>Applies masking in-place on a CustomerSummaryDto.</summary>
    Task MaskCustomerSummaryAsync(CustomerSummaryDto dto, CancellationToken ct = default);

    /// <summary>Applies masking in-place on a CustomerDetailDto.</summary>
    Task MaskCustomerDetailAsync(CustomerDetailDto dto, CancellationToken ct = default);
}

public class PiiMaskingService : IPiiMaskingService
{
    private readonly AppDbContext _context;
    private readonly IConfigCache _cache;
    private readonly ICurrentUserAccessor? _currentUser;

    public PiiMaskingService(AppDbContext context, IConfigCache cache, ICurrentUserAccessor? currentUser = null)
    {
        _context = context;
        _cache = cache;
        _currentUser = currentUser;
    }

    private sealed record Rule(string MaskingRule, int VisibleChars);

    /// <summary>
    /// Which DTO properties a configured field governs. A general field (idValue) covers every
    /// identifier property; a specific one (nric, passport, accountNumber) overrides it for that property.
    /// Matching is case-insensitive on both sides.
    /// </summary>
    private static readonly (string ApiField, string[] Properties)[] FieldBindings =
    {
        ("idValue",           new[] { "IdValue", "NRIC", "Passport", "AccountNumber" }),   // general first…
        ("fullName",          new[] { "FullName" }),
        ("phoneNumber",       new[] { "PhoneNumber" }),
        ("email",             new[] { "Email" }),
        ("dateOfBirth",       new[] { "DateOfBirth" }),
        ("branch",            new[] { "Branch" }),
        ("preferredLanguage", new[] { "PreferredLanguage" }),
        ("customerSegment",   new[] { "CustomerSegment" }),
        ("nric",              new[] { "NRIC", "IdValue" }),                                // …specific after, so they override
        ("passport",          new[] { "Passport" }),
        ("accountNumber",     new[] { "AccountNumber" }),
    };

    public string Mask(string? rawValue, string maskingRule, int visibleChars = 4)
    {
        if (string.IsNullOrEmpty(rawValue)) return rawValue ?? string.Empty;
        if (string.IsNullOrEmpty(maskingRule) || maskingRule == "None") return rawValue;
        if (visibleChars < 0) visibleChars = 0;

        switch (maskingRule)
        {
            case "FullMask":
                return new string('*', rawValue.Length);

            case "HideMiddle":
                if (rawValue.Length <= visibleChars * 2) return new string('*', rawValue.Length);
                var prefix = rawValue[..visibleChars];
                var suffix = visibleChars == 0 ? string.Empty : rawValue[^visibleChars..];
                return prefix + new string('*', rawValue.Length - visibleChars * 2) + suffix;

            case "HideFirstShowLast":
                if (rawValue.Length <= visibleChars) return new string('*', rawValue.Length);
                return new string('*', rawValue.Length - visibleChars) + (visibleChars == 0 ? string.Empty : rawValue[^visibleChars..]);

            default:
                // Unknown rule: mask everything for safety
                return new string('*', rawValue.Length);
        }
    }

    public Task MaskCustomerSummaryAsync(CustomerSummaryDto dto, CancellationToken ct = default) => MaskAsync(dto, ct);

    public Task MaskCustomerDetailAsync(CustomerDetailDto dto, CancellationToken ct = default) => MaskAsync(dto, ct);

    public async Task MaskAsync(object? dto, CancellationToken ct = default)
    {
        if (dto == null) return;
        if (_currentUser != null && _currentUser.Permissions.Contains(Permissions.PiiUnmask)) return;

        var rules = await GetRulesAsync();
        if (rules.Count == 0) return;

        // property rules (by DTO property name) from the field bindings
        var byProperty = new Dictionary<string, Rule>(StringComparer.OrdinalIgnoreCase);
        foreach (var (apiField, properties) in FieldBindings)
            if (rules.TryGetValue(apiField, out var rule))
                foreach (var property in properties) byProperty[property] = rule;

        foreach (var property in dto.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (!property.CanRead || !property.CanWrite) continue;

            if (byProperty.TryGetValue(property.Name, out var rule))
            {
                ApplyToProperty(dto, property, rule);
            }
            else if (property.PropertyType == typeof(List<CustomerCustomAttributeDto>) && property.GetValue(dto) is List<CustomerCustomAttributeDto> custom)
            {
                // Custom fields are masked by their own key.
                foreach (var attribute in custom)
                    if (rules.TryGetValue(attribute.FieldKey, out var customRule))
                        attribute.FieldValue = Mask(attribute.FieldValue, customRule.MaskingRule, customRule.VisibleChars);
            }
        }
    }

    private void ApplyToProperty(object dto, PropertyInfo property, Rule rule)
    {
        if (property.PropertyType == typeof(string))
        {
            property.SetValue(dto, Mask((string?)property.GetValue(dto), rule.MaskingRule, rule.VisibleChars));
        }
        else if (property.PropertyType == typeof(DateTime?))
        {
            // A date cannot be partially masked, so a sensitive one is withheld.
            property.SetValue(dto, null);
        }
    }

    /// <summary>
    /// Effective masking rule per configured field, across all sections that configure it. When several
    /// rows disagree the MOST RESTRICTIVE wins (full mask, otherwise the fewest visible characters), so
    /// a lenient duplicate row can never expose what another row hides.
    /// </summary>
    private Task<Dictionary<string, Rule>> GetRulesAsync() =>
        _cache.GetOrCreateAsync("pii-rules", async () =>
        {
            var masked = await _context.FieldConfigurations.AsNoTracking()
                .Where(f => f.MaskingRule != "None" && f.MaskingRule != "")
                .ToListAsync();

            var result = new Dictionary<string, Rule>(StringComparer.OrdinalIgnoreCase);
            foreach (var field in masked)
            {
                var candidate = new Rule(field.MaskingRule, Math.Max(0, field.VisibleChars));
                if (!result.TryGetValue(field.ApiField, out var existing) || MoreRestrictive(candidate, existing))
                    result[field.ApiField] = candidate;
            }
            return result;
        });

    private static bool MoreRestrictive(Rule candidate, Rule existing)
    {
        if (existing.MaskingRule == "FullMask") return false;
        if (candidate.MaskingRule == "FullMask") return true;
        return candidate.VisibleChars < existing.VisibleChars;
    }
}
