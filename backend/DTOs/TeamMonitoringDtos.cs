namespace CaseManagement.Api.DTOs;

public class TeamMonitoringSummaryDto
{
    public int OnlineAgentsCount { get; set; }
    public int TotalAgentsCount { get; set; }
    public int AgentsBreakCount { get; set; }
    
    public int LongestQueueWaitMinutes { get; set; }
    public string LongestQueueChannel { get; set; } = "Email queue";
    
    public int AvgHandleTimeSeconds { get; set; }
    public string AvgHandleTimeString { get; set; } = "6m 12s";
    public int AvgHandleTimeDeltaSeconds { get; set; } = -40; // Negative means faster than yesterday
    
    public decimal OccupancyPercent { get; set; }
    public string OccupancyTargetBand { get; set; } = "70–85%";
}

public class AgentStatusItemDto
{
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string TeamName { get; set; } = string.Empty;
    public string State { get; set; } = "Available"; // "Available", "On interaction", "Break", "Offline"
    public int OpenCasesCount { get; set; }
    public int BreachedCasesCount { get; set; }
    public int HandledTodayCount { get; set; }
    public decimal CsatScore { get; set; } = 4.7m;
}

public class QueueHealthItemDto
{
    public string Channel { get; set; } = string.Empty;
    public int WaitingCount { get; set; }
    public int MaxCapacity { get; set; } = 10;
    public decimal LoadPercent { get; set; }
}

public class SlaAtRiskCaseDto
{
    public Guid CaseId { get; set; }
    public string CaseNumber { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Severity { get; set; } = "Medium";
    public int ElapsedPercent { get; set; }
    public int TimeRemainingMinutes { get; set; }
    public string TimeRemainingDisplay { get; set; } = string.Empty;
    public DateTime? DueAt { get; set; }
}

public class NudgeAgentDto
{
    public string? Reason { get; set; }
}
