namespace CaseManagement.Api.DTOs;

using System;
using System.Collections.Generic;

public class PrioritySlaRuleDto
{
    public Guid Id { get; set; }
    public string Priority { get; set; } = string.Empty; // administrator-defined name
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public int FirstResponseValue { get; set; }
    public string FirstResponseUnit { get; set; } = "Minutes"; // "Minutes" | "Hours"
    public int FirstResponseMinutes { get; set; }

    public int InternalResolutionValue { get; set; }
    public string InternalResolutionUnit { get; set; } = "Hours"; // "Minutes" | "Hours"
    public int InternalResolutionMinutes { get; set; }

    public int ExternalResolutionValue { get; set; }
    public string ExternalResolutionUnit { get; set; } = "Hours"; // "Minutes" | "Hours"
    public int ExternalResolutionMinutes { get; set; }

    /// <summary>Sub-categories (by id) whose cases get this priority.</summary>
    public List<Guid> AppliedSubCategoryIds { get; set; } = new();
}

public class BusinessHourDto
{
    public Guid? Id { get; set; }
    public int DayOfWeek { get; set; } // 0 = Sunday, 1 = Monday, ...
    public string DayName { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public string StartTime { get; set; } = "09:00"; // "HH:mm"
    public string EndTime { get; set; } = "17:00";   // "HH:mm"
}

public class PublicHolidayDto
{
    public Guid Id { get; set; }
    public DateTime HolidayDate { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

public class CreatePublicHolidayDto
{
    public DateTime HolidayDate { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

public class UpdatePublicHolidayDto
{
    public DateTime HolidayDate { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

public class EscalationLevelConfigDto
{
    public Guid? Id { get; set; }
    public int LevelNumber { get; set; }
    public string Name { get; set; } = string.Empty;

    public string AssignmentType { get; set; } = "Role"; // "Role" | "User" | "DepartmentOwner"
    public string TargetRole { get; set; } = string.Empty;
    public Guid? TargetUserId { get; set; }
    public string? TargetUserName { get; set; }

    public string TriggerType { get; set; } = "SlaPercentage"; // "SlaPercentage" | "SlaBreached" | "SlaPostBreachHours" | "ManualOnly"
    public decimal? TriggerValue { get; set; }
    public string TriggerDescription { get; set; } = string.Empty;

    public string ActionDescription { get; set; } = string.Empty;
    public bool ReassignOwner { get; set; } = false;
    public bool IsActive { get; set; } = true;
}

public class CreateEscalationLevelDto
{
    public int? LevelNumber { get; set; }
    public string? Name { get; set; }
    public string TargetRole { get; set; } = string.Empty;
    public string? TriggerCondition { get; set; }
    public string? ActionDescription { get; set; }
}

public class UpdateEscalationLevelDto
{
    public string? Name { get; set; }
    public string TargetRole { get; set; } = string.Empty;
    public string? TriggerCondition { get; set; }
    public string? ActionDescription { get; set; }
}

public class CategoryOptionDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

/// <summary>What priority a new case in a department/sub-category would get, for the Create Case form.</summary>
public class PriorityResolutionDto
{
    /// <summary>True when the sub-category has a configured priority (the user cannot override it).</summary>
    public bool IsMapped { get; set; }
    public string? Priority { get; set; }
    public Guid? SubCategoryId { get; set; }
    public int? InternalHours { get; set; }
    public int? ExternalHours { get; set; }
    public int? FirstResponseMinutes { get; set; }
}

public class UserOptionDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string? Team { get; set; }
}

public class SlaRoutingConfigResponseDto
{
    public List<PrioritySlaRuleDto> PriorityRules { get; set; } = new();
    public List<CategoryOptionDto> AvailableCategories { get; set; } = new();
    public List<BusinessHourDto> BusinessHours { get; set; } = new();
    public List<PublicHolidayDto> PublicHolidays { get; set; } = new();
    public List<EscalationLevelConfigDto> EscalationLevels { get; set; } = new();
    public List<string> AvailableRoles { get; set; } = new();
    public List<UserOptionDto> AvailableUsers { get; set; } = new();
}

public class UpdateSlaRoutingConfigRequestDto
{
    public List<PrioritySlaRuleDto> PriorityRules { get; set; } = new();
    public List<BusinessHourDto> BusinessHours { get; set; } = new();
    public List<EscalationLevelConfigDto> EscalationLevels { get; set; } = new();
}

public class CaseEscalationStatusDto
{
    public Guid CaseId { get; set; }
    public string CaseNumber { get; set; } = string.Empty;
    public int CurrentLevel { get; set; } = 1;
    public string CurrentLevelName { get; set; } = "Level 1";
    public int? NextLevel { get; set; }
    public string? NextLevelName { get; set; }
    public string? NextTargetRole { get; set; }
    public string? NextTargetUserName { get; set; }
    public Guid? NextTargetUserId { get; set; }
    public bool IsMaxLevel { get; set; }
    public string? MaxLevelNotice { get; set; }
    public string TriggerDescription { get; set; } = string.Empty;
    public string ActionDescription { get; set; } = string.Empty;
}

public class ManualEscalateRequestDto
{
    public string Reason { get; set; } = string.Empty; // Mandatory explanation
    public string? Note { get; set; }
}
