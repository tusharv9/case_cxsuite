using CaseManagement.Api.Data;
using CaseManagement.Api.Extensions;
using CaseManagement.Api.Middleware;
using CaseManagement.Api.Repositories;
using CaseManagement.Api.Services;
using CaseManagement.Api.Services.Strategies;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Global string sanitization (trimming) for incoming JSON requests
        options.JsonSerializerOptions.Converters.Add(new TrimStringConverter());
        // Enums as strings
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        // Ignore circular references
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });

// Dynamic port support for Render / container platforms
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(port))
{
    builder.WebHost.UseUrls($"http://*:{port}");
}

// CORS allow-list is driven purely by configuration ("AllowedOrigins", comma separated) so each
// environment — and the future Host App's origin — is an explicit entry, never a wildcard.
// In Production there is no implicit default: an empty list means no cross-origin access.
// localhost is allowed only in Development, so a production deployment can never be reached
// from a page running on someone's local machine.
var allowedOriginsRaw = builder.Configuration["AllowedOrigins"]
    ?? (builder.Environment.IsDevelopment() ? "http://localhost:3000,http://localhost:5173" : string.Empty);
var allowedOrigins = allowedOriginsRaw
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Select(o => o.TrimEnd('/'))
    .ToArray();
var allowLocalhostOrigins = builder.Environment.IsDevelopment();

builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactPolicy", policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
            {
                if (string.IsNullOrEmpty(origin)) return false;
                var trimmed = origin.TrimEnd('/');
                if (allowedOrigins.Any(ao => string.Equals(ao, trimmed, StringComparison.OrdinalIgnoreCase)))
                    return true;
                if (allowLocalhostOrigins && Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                {
                    if (uri.Host == "localhost" || uri.Host == "127.0.0.1")
                        return true;
                }
                return false;
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure PostgreSQL
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Database connection string 'DefaultConnection' was not found. " +
        "Ensure 'ConnectionStrings__DefaultConnection' is configured in your environment variables or appsettings.json.");
}

builder.Services.AddDbContextPool<AppDbContext>(options =>
    options.UseNpgsql(connectionString, npgsqlOptions => 
    {
        npgsqlOptions.CommandTimeout(90);
        npgsqlOptions.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(10), errorCodesToAdd: null);
    }));

// Register Repositories
builder.Services.AddScoped<ICaseRepository, CaseRepository>();
builder.Services.AddScoped<ICustomerRepository, CustomerRepository>();
builder.Services.AddScoped<IDepartmentRepository, DepartmentRepository>();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IConfigurableSettingsRepository, ConfigurableSettingsRepository>();

// Register Services
builder.Services.AddScoped<ICaseService, CaseService>();
builder.Services.AddScoped<ICustomerService, CustomerService>();
builder.Services.AddScoped<IDepartmentService, DepartmentService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IConfigurableSettingsService, ConfigurableSettingsService>();
builder.Services.AddScoped<IPiiMaskingService, PiiMaskingService>();
builder.Services.AddScoped<IBusinessTimeService, BusinessTimeService>();
builder.Services.AddScoped<ISlaRoutingService, SlaRoutingService>();
builder.Services.AddScoped<ITeamService, TeamService>();
builder.Services.AddScoped<ITeamMonitoringService, TeamMonitoringService>();
builder.Services.AddScoped<IAssignmentStrategy, RoundRobinAssignmentStrategy>();
builder.Services.AddScoped<IAssignmentStrategy, LeastOccupancyAssignmentStrategy>();
builder.Services.AddScoped<IAssignmentStrategy, SkillBasedAssignmentStrategy>();
builder.Services.AddScoped<IRoutingEngineService, RoutingEngineService>();

// Database preparation (migrations + seed) runs in the background; the worker below waits for it.
builder.Services.Configure<CaseManagement.Api.Configuration.DatabaseOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.DatabaseOptions.SectionName));
builder.Services.AddSingleton<DatabaseInitializationState>();
builder.Services.AddSingleton<DatabaseInitializer>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<DatabaseInitializer>());

// Register SLA Escalation Background Worker
builder.Services.AddHostedService<SlaEscalationBackgroundService>();

// In-process cache used by the authorization middleware and lookup caching
builder.Services.AddMemoryCache();

// Lets services read the acting user (for audit records) set by UserAuthorizationMiddleware
builder.Services.AddHttpContextAccessor();

// Bind tunables so they are configurable per environment rather than compiled in
builder.Services.Configure<CaseManagement.Api.Configuration.SearchOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.SearchOptions.SectionName));
builder.Services.Configure<CaseManagement.Api.Configuration.UserAuthorizationOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.UserAuthorizationOptions.SectionName));
builder.Services.Configure<CaseManagement.Api.Configuration.LookupCacheOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.LookupCacheOptions.SectionName));
builder.Services.Configure<CaseManagement.Api.Configuration.AttachmentOptions>(
    builder.Configuration.GetSection(CaseManagement.Api.Configuration.AttachmentOptions.SectionName));

// Register FluentValidation
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

var app = builder.Build();

app.UseMiddleware<ExceptionMiddleware>();

// Correlation ID: if the host app sends one, use it; otherwise create one.
app.Use(async (context, next) =>
{
    if (!context.Request.Headers.ContainsKey("X-Correlation-Id"))
    {
        context.Request.Headers["X-Correlation-Id"] = Guid.NewGuid().ToString("N");
    }
    context.Response.Headers["X-Correlation-Id"] = context.Request.Headers["X-Correlation-Id"].ToString();
    using (app.Logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = context.Request.Headers["X-Correlation-Id"].ToString() }))
    {
        await next();
    }
});

// Configure the HTTP request pipeline.
// Swagger exposes the full API surface, so it is off outside Development unless explicitly enabled.
if (app.Environment.IsDevelopment() || builder.Configuration.GetValue<bool>("EnableSwagger", false))
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// NOTE: schema creation/upgrade and seeding no longer happen inline here. They are handled by
// DatabaseInitializer (EF migrations + one-time seed steps), which runs in the background so the
// process answers /health immediately, and can be run as a deployment step:
//     dotnet CaseManagement.Api.dll --migrate-only
if (args.Contains("--migrate-only"))
{
    var initialised = await app.Services
        .GetRequiredService<DatabaseInitializer>()
        .RunAsync(forceMigrate: true, CancellationToken.None);
    app.Logger.LogInformation(initialised ? "Migration finished." : "Migration FAILED.");
    return initialised ? 0 : 1;
}

// Forward headers from reverse proxies (Render, load balancers)
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor |
                       Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto
});

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors("ReactPolicy");

// Before anything that touches the database: API calls get a clean 503 until it is ready.
app.UseMiddleware<DatabaseReadinessMiddleware>();
app.UseMiddleware<UserAuthorizationMiddleware>();
app.UseAuthorization();

// Liveness: the process is up (answers immediately, even while the database is still being prepared).
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// Readiness: the database is migrated/seeded and the API can serve requests.
app.MapGet("/ready", (DatabaseInitializationState state) =>
    state.IsReady
        ? Results.Ok(new { status = "ready" })
        : Results.Json(new { status = state.Status.ToString(), message = state.Message },
            statusCode: StatusCodes.Status503ServiceUnavailable));

app.MapControllers();

app.Run();

return 0;
