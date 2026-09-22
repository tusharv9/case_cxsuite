namespace CaseManagement.Api.Models;

using Microsoft.EntityFrameworkCore;

[Index(nameof(CaseNumber), IsUnique = true)]
public class Case : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string CaseNumber { get; set; } = string.Empty; // e.g., C-10472, S-00044, I-00045
    public string CaseType { get; set; } = "Complaint"; // Inquiry, Complaint, Service
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    
    public CaseStatus Status { get; set; }
    public string Severity { get; set; } = "Medium"; // Configurable: see LookupValues (CASE_SEVERITY) / SlaConfigurations
    
    public string SourceChannel { get; set; } = "Voice";
    public string PreferredCommunicationChannel { get; set; } = "Phone";
    public string CommunicationChannel { get; set; } = "Voice";
    public string? Subcategory { get; set; }
    
    // SLA Tracking
    public DateTime SlaStartTime { get; set; }
    public int SlaTargetHours { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime? SlaPausedAt { get; set; }
    public int SlaTotalPausedMinutes { get; set; } = 0;
    
    // Resolution Details
    public string? Disposition { get; set; }
    public string? ResolutionNote { get; set; }
    
    // Relationships
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
    
    public Guid CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    
    public Guid OwnerId { get; set; }
    public User Owner { get; set; } = null!;
    
    public ICollection<CaseEvent> Events { get; set; } = new List<CaseEvent>();
    public ICollection<CaseParticipant> Participants { get; set; } = new List<CaseParticipant>();
    public ICollection<CaseAttachment> Attachments { get; set; } = new List<CaseAttachment>();
    
    public ICollection<LinkedCase> LinkedCases { get; set; } = new List<LinkedCase>();
    public ICollection<LinkedCase> LinkedToCases { get; set; } = new List<LinkedCase>();
    
    // Sub-case relationships (L01, L02, R01, R02)
    public ICollection<CaseChildRelation> ChildRelations { get; set; } = new List<CaseChildRelation>();

    // Parent/Child Hierarchy
    public Guid? ParentCaseId { get; set; }
    public Case? ParentCase { get; set; }
    public ICollection<Case> Subcases { get; set; } = new List<Case>();

    public Guid? LinkedSourceCaseId { get; set; }
    public Case? LinkedSourceCase { get; set; }

    public string SubcaseType { get; set; } = "Original"; // Original, ReopenedSubcase, LinkedSubcase
}
