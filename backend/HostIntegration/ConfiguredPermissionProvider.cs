namespace CaseManagement.Api.HostIntegration;

using Microsoft.Extensions.Options;

/// <summary>
/// Permissions = baseline + permissions asserted directly by the Host (claim) + permissions of each
/// role, from configuration. Roles are matched exactly (case-insensitive) — never by substring.
/// </summary>
public sealed class ConfiguredPermissionProvider : IPermissionProvider
{
    private readonly HostIntegrationOptions _options;

    public ConfiguredPermissionProvider(IOptions<HostIntegrationOptions> options) => _options = options.Value;

    public IReadOnlySet<string> Resolve(HostPrincipal principal)
    {
        var result = new HashSet<string>(_options.BaselinePermissions, StringComparer.OrdinalIgnoreCase);

        foreach (var permission in principal.Permissions) result.Add(permission);

        var map = _options.RolePermissions.Count > 0
            ? _options.RolePermissions
            : (IReadOnlyDictionary<string, string[]>)Permissions.DefaultRolePermissions;

        foreach (var role in principal.Roles)
            if (map.TryGetValue(role, out var granted))
                foreach (var permission in granted) result.Add(permission);

        return result;
    }
}

/// <summary>The development stand-in has no roles; it simply gets the configured standalone permissions.</summary>
public sealed class StandalonePermissionProvider : IPermissionProvider
{
    private readonly HostIntegrationOptions _options;

    public StandalonePermissionProvider(IOptions<HostIntegrationOptions> options) => _options = options.Value;

    public IReadOnlySet<string> Resolve(HostPrincipal principal) =>
        new HashSet<string>(_options.StandalonePermissions, StringComparer.OrdinalIgnoreCase);
}
