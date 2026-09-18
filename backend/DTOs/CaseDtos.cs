namespace CaseManagement.Api.DTOs;

public class CreateCustomerDto
{
    public string FullName { get; set; } = string.Empty;
    public string NRIC { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Branch { get; set; }
    public int TenureMonths { get; set; }
    public string? CustomerSegment { get; set; }
    public string PreferredLanguage { get; set; } = "Bahasa Malaysia";
    public DateTime? DateOfBirth { get; set; }
    public Dictionary<string, string>? CustomAttributes { get; set; }
}

public class CreateCaseDto
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Guid CustomerId { get; set; }
    public Guid DepartmentId { get; set; }
    public string Severity { get; set; } = string.Empty;
    public int SlaTargetHours { get; set; } = 12;

    public string CaseType { get; set; } = "Complaint";
    public string? Subcategory { get; set; }
    public string? PreferredLanguage { get; set; }
    public string? CommunicationChannel { get; set; }
}

public class UpdateCaseStatusDto
{
    public string Status { get; set; } = string.Empty;
    public string? Note { get; set; }
    public Guid UserId { get; set; } // The user making the change
}

public class AssignCaseDto
{
    public Guid OwnerId { get; set; }
    public Guid UserId { get; set; } // The user making the change
}

public class AddNoteDto
{
    public string Message { get; set; } = string.Empty;
    public Guid UserId { get; set; }
}

public class AddCoworkersDto
{
    public List<Guid> CoworkerIds { get; set; } = new();
}

public class TransferDepartmentDto
{
    public Guid DepartmentId { get; set; }
}

public class CreateUserDto
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public Guid DepartmentId { get; set; }
}

public class CreateDepartmentDto
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
}

public class LinkCaseDto
{
    public string RelationshipType { get; set; } = string.Empty;
    public string TargetCaseNumber { get; set; } = string.Empty;
    public Guid UserId { get; set; }
}

public class ResolveCaseDto
{
    public string Disposition { get; set; } = string.Empty;
    public string ResolutionNote { get; set; } = string.Empty;
    public Guid UserId { get; set; }
}

public class ReopenCaseDto
{
    public string Message { get; set; } = string.Empty;
    public Guid UserId { get; set; }
}

public class UnlinkCaseDto
{
    public string TargetCaseNumber { get; set; } = string.Empty;
    public Guid UserId { get; set; }
}

public class SetDepartmentOwnerDto
{
    public Guid OwnerId { get; set; }
}

public class UpdateUserStatusDto
{
    public string Status { get; set; } = string.Empty;
}
