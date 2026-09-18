namespace CaseManagement.Api.Middleware;

using CaseManagement.Api.Configuration;
using CaseManagement.Api.Repositories;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using System;
using System.Text.Json;
using System.Threading.Tasks;

public class UserAuthorizationMiddleware
{
    private const string CacheKeyPrefix = "user-exists:";

    private readonly RequestDelegate _next;

    public UserAuthorizationMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(
        HttpContext context,
        IUserRepository userRepository,
        IMemoryCache cache,
        IOptions<UserAuthorizationOptions> options)
    {
        // Only apply this validation to API endpoints, except GET /api/users which is used for bootstrapping
        if (context.Request.Path.StartsWithSegments("/api") &&
            !(context.Request.Path.Equals("/api/users", StringComparison.OrdinalIgnoreCase) && HttpMethods.IsGet(context.Request.Method)))
        {
            if (!context.Request.Headers.TryGetValue("X-User-Id", out var userIdStr) || !Guid.TryParse(userIdStr, out var userId))
            {
                context.Response.ContentType = "application/json";
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = "Missing or invalid X-User-Id header." }));
                return;
            }

            if (!await UserExistsAsync(userId, userRepository, cache, options.Value))
            {
                context.Response.ContentType = "application/json";
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = "User not found or unauthorized." }));
                return;
            }

            // Store UserId in context items for downstream use if necessary
            context.Items["UserId"] = userId;
        }

        await _next(context);
    }

    /// <summary>
    /// Confirms the caller is a real user, avoiding a database round trip on every single API
    /// request.
    ///
    /// Only positive results are cached, and only for a short, configurable window. That matters
    /// for two reasons: an unknown id is always re-checked, so a user created a moment ago can
    /// authenticate immediately; and because misses are never cached, a flood of made-up ids
    /// cannot grow the cache — its size is bounded by the number of real users.
    /// </summary>
    private static async Task<bool> UserExistsAsync(
        Guid userId,
        IUserRepository userRepository,
        IMemoryCache cache,
        UserAuthorizationOptions options)
    {
        if (options.UserExistsCacheSeconds <= 0)
        {
            return await userRepository.UserExistsAsync(userId);
        }

        var cacheKey = CacheKeyPrefix + userId;
        if (cache.TryGetValue(cacheKey, out bool _))
        {
            return true;
        }

        if (!await userRepository.UserExistsAsync(userId))
        {
            return false;
        }

        cache.Set(cacheKey, true, TimeSpan.FromSeconds(options.UserExistsCacheSeconds));
        return true;
    }
}
