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

        if (principal.IsAdministrator)
            foreach (var permission in _options.AdministratorPermissions) result.Add(permission);

        foreach (var permission in principal.Permissions) result.Add(permission);

        var map = _options.RolePermissions.Count > 0
            ? _options.RolePermissions
            : (IReadOnlyDictionary<string, string[]>)Permissions.DefaultRolePermissions;

        foreach (var role in principal.Roles)
            if (map.TryGetValue(role, out var granted))
                foreach (var permission in granted) result.Add(permission);

        return result;
    }

    public IReadOnlySet<string>? RolesGranting(string permission)
    {
        var map = _options.RolePermissions.Count > 0
            ? _options.RolePermissions
            : (IReadOnlyDictionary<string, string[]>)Permissions.DefaultRolePermissions;

        return map.Where(kv => kv.Value.Contains(permission, StringComparer.OrdinalIgnoreCase) || kv.Value.Contains(Permissions.Everything))
                  .Select(kv => kv.Key)
                  .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}

/// <summary>The development stand-in has no roles; it simply gets the configured standalone permissions.</summary>
public sealed class StandalonePermissionProvider : IPermissionProvider
{
    private readonly HostIntegrationOptions _options;

    public StandalonePermissionProvider(IOptions<HostIntegrationOptions> options) => _options = options.Value;

    public IReadOnlySet<string> Resolve(HostPrincipal principal) =>
        new HashSet<string>(_options.StandalonePermissions, StringComparer.OrdinalIgnoreCase);

    public IReadOnlySet<string>? RolesGranting(string permission) => null;   // no roles in standalone: everyone has the same set
}

/// <summary>HYBRID: Host-token callers get role/claim permissions; development-header callers get the standalone set.</summary>
public sealed class HybridPermissionProvider : IPermissionProvider
{
    private readonly ConfiguredPermissionProvider _host;
    private readonly StandalonePermissionProvider _devHeader;

    public HybridPermissionProvider(IOptions<HostIntegrationOptions> options)
    {
        _host = new ConfiguredPermissionProvider(options);
        _devHeader = new StandalonePermissionProvider(options);
    }

    public IReadOnlySet<string> Resolve(HostPrincipal principal) =>
        principal.Source == HostIdentitySource.DevelopmentHeader ? _devHeader.Resolve(principal) : _host.Resolve(principal);

    // Real people carry roles here, so "who may do X" follows the role map.
    public IReadOnlySet<string>? RolesGranting(string permission) => _host.RolesGranting(permission);
}
