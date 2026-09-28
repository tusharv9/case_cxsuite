namespace CaseManagement.Api.DTOs;

public class CaseSummaryDto
{
    public Guid Id { get; set; }
    public string CaseNumber { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    public DateTime SlaStartTime { get; set; }
    public int SlaTargetHours { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime? SlaPausedAt { get; set; }
    public int SlaTotalPausedMinutes { get; set; }
    public bool IsSlaPaused => SlaPausedAt.HasValue || Status == "WaitingOnCustomer";
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public Guid OwnerId { get; set; }
    public string? OwnerRole { get; set; }
    public string? OwnerTeam { get; set; }
    public string? OwnerQueue { get; set; }
    public DateTime CreatedAt { get; set; }
    public Guid CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;

    public string CaseType { get; set; } = "Complaint";
    public string? Subcategory { get; set; }
    public string? PreferredLanguage { get; set; }
    public string? SourceChannel { get; set; }
    public string? PreferredCommunicationChannel { get; set; }
    public string? CommunicationChannel { get; set; }
    public Guid? ParentCaseId { get; set; }
    public string? ParentCaseNumber { get; set; }
    public string SubcaseType { get; set; } = "Original";
    public bool IsSubcase => ParentCaseId.HasValue || (SubcaseType != null && SubcaseType != "Original");
    public List<CaseChildRelationDto> ChildRelations { get; set; } = new();

    // First Response SLA Tracking
    public int FirstResponseTargetMinutes { get; set; } = 240;
    public DateTime? FirstResponseDueAt { get; set; }
    public DateTime? FirstResponseActualAt { get; set; }
    public string FirstResponseStatus { get; set; } = "Pending"; // Met, Breached, Pending

    // Escalation Matrix Tracking
    public int EscalationLevel { get; set; } = 1;
    public string EscalationLevelName => EscalationLevel switch
    {
        1 => "Assigned Agent",
        2 => "Team Lead",
        3 => "CX Supervisor",
        4 => "Head of Customer Experience",
        _ => "Assigned Agent"
    };
}

public class CaseDetailDto : CaseSummaryDto
{
    public string Description { get; set; } = string.Empty;
    public string? Disposition { get; set; }
    public string? ResolutionNote { get; set; }
    public CustomerSummaryDto Customer { get; set; } = null!;
    public List<CaseEventDto> Events { get; set; } = new();
    public List<ParticipantDto> Participants { get; set; } = new();
    public List<LinkedCaseDto> LinkedCases { get; set; } = new();
    public List<CaseSummaryDto> Subcases { get; set; } = new();
    public List<CaseAttachmentDto> Attachments { get; set; } = new();
}

public class CaseChildRelationDto
{
    public string ChildId { get; set; } = string.Empty; // e.g. C-00045-L01, C-00045-R01
    public string RelationType { get; set; } = string.Empty; // Link, Reopen
    public string? LinkedCaseNumber { get; set; }
    public string? LinkedCaseTitle { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string CreatedByName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class LinkCaseResultDto
{
    public string Message { get; set; } = string.Empty;
    public string ChildId { get; set; } = string.Empty; // e.g. C-00045-L01
    public Guid? NewCaseId { get; set; }
    public string LinkedCaseNumber { get; set; } = string.Empty;
}

public class ReopenCaseResultDto
{
    public string Message { get; set; } = string.Empty;
    public string ChildId { get; set; } = string.Empty; // e.g. C-00045-R01
    public Guid? NewCaseId { get; set; }
}

public class CustomerSummaryDto
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string NRIC { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public DateTime? DateOfBirth { get; set; }
    public int OpenCasesCount { get; set; }
    public int TotalCasesCount { get; set; }
    public List<CustomerCustomAttributeDto> CustomAttributes { get; set; } = new();
}

public class CustomerDetailDto : CustomerSummaryDto
{
    public string? Email { get; set; }
    public string? Branch { get; set; }
    public int TenureMonths { get; set; }
    public string? CustomerSegment { get; set; }
    public string PreferredLanguage { get; set; } = "Bahasa Malaysia";
    public List<CaseSummaryDto> Cases { get; set; } = new();
}

public class CaseEventDto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string UserName { get; set; } = string.Empty;
    public bool IsInternal { get; set; } = true;
    public string? Channel { get; set; }
}

public class ParticipantDto
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
}

public class LinkedCaseDto
{
    public Guid TargetCaseId { get; set; }
    public string TargetCaseNumber { get; set; } = string.Empty;
    public string TargetCaseTitle { get; set; } = string.Empty;
}

public class UserDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public string? Team { get; set; }
    public string? Queue { get; set; }
}


public class DepartmentDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public Guid? OwnerId { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

public class CaseTypeConfigDto
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Prefix { get; set; } = "C-";
    public int DisplayOrder { get; set; } = 1;
    public bool IsActive { get; set; } = true;
}

public class DepartmentSubCategoryDto
{
    public Guid Id { get; set; }
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public int DisplayOrder { get; set; } = 1;
    public bool IsActive { get; set; } = true;
}

public class SlaConfigurationDto
{
    public Guid Id { get; set; }
    public string Severity { get; set; } = string.Empty;
    public int InternalHours { get; set; }
    public int ExternalHours { get; set; }
    public int FirstResponseMinutes { get; set; } = 240;
    public bool IsActive { get; set; } = true;
}

public class EscalationMatrixLevelDto
{
    public int Level { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Trigger { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? CurrentTargetUserName { get; set; }
    public Guid? CurrentTargetUserId { get; set; }
}

public class EscalationMatrixResponseDto
{
    public string Title { get; set; } = "Escalation matrix";
    public string Subtitle { get; set; } = "manual escalation — cases are never escalated automatically; every escalation is audit-logged";
    public int CurrentLevel { get; set; } = 1;
    public int? NextLevel { get; set; }
    public string? NextTargetRole { get; set; }
    public string? NextTargetUserName { get; set; }
    public Guid? NextTargetUserId { get; set; }
    public List<EscalationMatrixLevelDto> Levels { get; set; } = new();
}
