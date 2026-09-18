namespace CaseManagement.Api.DTOs;

public class NotificationDto
{
    public Guid Id { get; set; }
    public Guid RecipientUserId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public Guid? CaseId { get; set; }
    public string? CaseNumber { get; set; }
    public bool IsRead { get; set; }
    public string Priority { get; set; } = "High";
    public int ReminderCount { get; set; } = 0;
    public DateTime CreatedAt { get; set; }
    public DateTime? ReadAt { get; set; }
}

public class UnreadCountDto
{
    public int UnreadCount { get; set; }
}

public class NotificationRuleDto
{
    public Guid Id { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public string Priority { get; set; } = "High";
    public int CooldownMinutes { get; set; }
    public int MaxReminders { get; set; }
    public bool EnableAggregation { get; set; }
    public int AggregationThreshold { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class UpdateNotificationRuleDto
{
    public bool IsEnabled { get; set; } = true;
    public string Priority { get; set; } = "High";
    public int CooldownMinutes { get; set; } = 60;
    public int MaxReminders { get; set; } = 3;
    public bool EnableAggregation { get; set; } = true;
    public int AggregationThreshold { get; set; } = 3;
}
