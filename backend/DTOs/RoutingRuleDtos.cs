namespace CaseManagement.Api.DTOs;

public class RoutingRuleDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int EvaluationOrder { get; set; }
    public bool IsActive { get; set; }
    public string ConditionsJson { get; set; } = "{}";
    public RuleConditionsDto Conditions { get; set; } = new();
    public Guid TargetDepartmentId { get; set; }
    public string TargetDepartmentName { get; set; } = string.Empty;
    public string? TargetQueueName { get; set; }
    public string ActionDescription { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class RuleConditionsDto
{
    public string MatchType { get; set; } = "ALL"; // "ALL" or "ANY"
    public string? Department { get; set; } // Department name or code
    public string? Category { get; set; } // Sub-category
    public string? CaseType { get; set; } // "Complaint", "Inquiry", "Service"
    public string? Priority { get; set; } // "Critical", "High", "Medium", "Low"
    public string? CustomerSegment { get; set; } // "Premier", "Mass Retail", "Gold", "SME"
    public string? Channel { get; set; } // "Voice", "Email", "WhatsApp"
    public List<string>? Keywords { get; set; } // Deprecated; retained for backwards-deserialization safety
}

public class CreateRoutingRuleDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? EvaluationOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public RuleConditionsDto? Conditions { get; set; }
    public Guid TargetDepartmentId { get; set; }
    public string? TargetQueueName { get; set; }
    public string? ActionDescription { get; set; }
}

public class UpdateRoutingRuleDto
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public int? EvaluationOrder { get; set; }
    public bool? IsActive { get; set; }
    public RuleConditionsDto? Conditions { get; set; }
    public Guid? TargetDepartmentId { get; set; }
    public string? TargetQueueName { get; set; }
    public string? ActionDescription { get; set; }
}

public class AssignmentConfigDto
{
    public string Algorithm { get; set; } = "RoundRobin"; // "RoundRobin", "SkillBased", "LeastOccupancy"
    public int MaxConcurrentCapacity { get; set; } = 5;
    public DateTime? UpdatedAt { get; set; }
}

public class UpdateAssignmentConfigDto
{
    public string Algorithm { get; set; } = "RoundRobin";
    public int? MaxConcurrentCapacity { get; set; }
}

public class ReorderRulesDto
{
    public List<Guid> RuleIds { get; set; } = new();
}

public class RoutingDecisionResult
{
    public Guid TargetDepartmentId { get; set; }
    public string TargetDepartmentName { get; set; } = string.Empty;
    public Guid? AssignedUserId { get; set; }
    public string? AssignedUserName { get; set; }
    public Guid? MatchedRuleId { get; set; }
    public string? MatchedRuleName { get; set; }
    public string AlgorithmUsed { get; set; } = "RoundRobin";
    public string RoutingLogMessage { get; set; } = string.Empty;
}
