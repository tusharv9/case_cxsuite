namespace CaseManagement.Api.Controllers;

using CaseManagement.Api.HostIntegration;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

/// <summary>
/// How a signed-out UI may sign in to this deployment. Anonymous (see <see cref="HostIdentityMiddleware"/>) and
/// carries no secrets: only which identity sources the backend accepts.
/// </summary>
[ApiController]
[Route("api/session")]
public class SessionController : ControllerBase
{
    private readonly HostIntegrationOptions _options;
    private readonly IHostEnvironment _env;

    public SessionController(IOptions<HostIntegrationOptions> options, IHostEnvironment env)
    {
        _options = options.Value;
        _env = env;
    }

    /// <summary>
    /// <c>hostTokens</c>: a Host-issued token is accepted (sign in with the Host account).
    /// <c>demoUsers</c>: a user may be picked without a password (development header).
    /// </summary>
    [HttpGet("options")]
    public IActionResult GetOptions()
    {
        var mode = _options.ResolveMode(_env.IsDevelopment());
        return Ok(new
        {
            mode = mode.ToString(),
            hostTokens = HostIntegrationOptions.AcceptsHostTokens(mode),
            demoUsers = _options.AcceptsDevHeader(mode)
        });
    }
}
