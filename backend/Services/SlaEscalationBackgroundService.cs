namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

public class SlaEscalationBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly DatabaseInitializationState _databaseState;
    private readonly ILogger<SlaEscalationBackgroundService> _logger;
    private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(2);

    public SlaEscalationBackgroundService(
        IServiceScopeFactory scopeFactory,
        DatabaseInitializationState databaseState,
        ILogger<SlaEscalationBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _databaseState = databaseState;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("SlaEscalationBackgroundService started.");

        try
        {
            // Wait until migrations/seeding have finished (replaces a fixed 5 s guess).
            await _databaseState.WhenReady.WaitAsync(stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var caseService = scope.ServiceProvider.GetRequiredService<ICaseService>();
                    await caseService.EvaluateSlaEscalationsAsync(null, stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogError(ex, "Error occurred during SLA escalation evaluation cycle.");
                }

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("SlaEscalationBackgroundService stopped gracefully.");
        }
    }
}
