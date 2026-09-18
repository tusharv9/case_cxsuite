namespace CaseManagement.Api.Configuration;

/// <summary>
/// Tunables for <see cref="Middleware.UserAuthorizationMiddleware"/>, bound from the
/// "UserAuthorization" configuration section.
/// </summary>
public class UserAuthorizationOptions
{
    public const string SectionName = "UserAuthorization";

    /// <summary>
    /// How long a confirmed-existing user id stays cached before it is re-checked against the
    /// database. Kept short so a removed user loses access promptly. Set to zero to disable
    /// caching entirely and hit the database on every request.
    /// </summary>
    public int UserExistsCacheSeconds { get; set; } = 60;
}
