namespace CaseManagement.Api.Models;

public class NotificationRule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string EventType { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
    public string Priority { get; set; } = "High";
    public int CooldownMinutes { get; set; } = 60;
    public int MaxReminders { get; set; } = 3;
    public bool EnableAggregation { get; set; } = true;
    public int AggregationThreshold { get; set; } = 3;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
