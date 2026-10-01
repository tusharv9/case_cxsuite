namespace CaseManagement.Api.Models;

using Microsoft.EntityFrameworkCore;

public class Customer : AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FullName { get; set; } = string.Empty;
    public string? NRIC { get; set; }
    public string? Passport { get; set; }
    public string? AccountNumber { get; set; }
    public string IdType { get; set; } = "NRIC Number";
    public string PhoneNumber { get; set; } = string.Empty;
    public string? Email { get; set; }
    
    // Additional 360 data
    public string? Branch { get; set; }
    public string? CustomerSegment { get; set; }
    public string PreferredLanguage { get; set; } = "Bahasa Malaysia";
    public DateTime? DateOfBirth { get; set; }
    
    // Navigation
    public ICollection<Case> Cases { get; set; } = new List<Case>();
    public ICollection<CustomerCustomAttribute> CustomAttributes { get; set; } = new List<CustomerCustomAttribute>();
}
