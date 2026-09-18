namespace CaseManagement.Api.Data;

using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Case> Cases { get; set; } = null!;
    public DbSet<Customer> Customers { get; set; } = null!;
    public DbSet<User> Users { get; set; } = null!;
    public DbSet<Department> Departments { get; set; } = null!;
    public DbSet<CaseEvent> CaseEvents { get; set; } = null!;
    public DbSet<CaseParticipant> CaseParticipants { get; set; } = null!;
    public DbSet<LinkedCase> LinkedCases { get; set; } = null!;
    public DbSet<CaseChildRelation> CaseChildRelations { get; set; } = null!;
    public DbSet<NotificationItem> Notifications { get; set; } = null!;
    public DbSet<FieldConfiguration> FieldConfigurations { get; set; } = null!;
    public DbSet<LookupType> LookupTypes { get; set; } = null!;
    public DbSet<LookupValue> LookupValues { get; set; } = null!;
    public DbSet<CustomerCustomAttribute> CustomerCustomAttributes { get; set; } = null!;

    public DbSet<CaseTypeConfig> CaseTypeConfigs { get; set; } = null!;
    public DbSet<DepartmentSubCategory> DepartmentSubCategories { get; set; } = null!;
    public DbSet<SlaConfiguration> SlaConfigurations { get; set; } = null!;
    public DbSet<DepartmentEscalationTemplate> DepartmentEscalationTemplates { get; set; } = null!;
    public DbSet<NotificationRule> NotificationRules { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<FieldConfiguration>()
            .HasIndex(fc => new { fc.ModuleKey, fc.SectionKey, fc.ApiField })
            .IsUnique();

        modelBuilder.Entity<LookupType>()
            .HasIndex(lt => lt.Code)
            .IsUnique();

        modelBuilder.Entity<LookupValue>()
            .HasIndex(lv => new { lv.LookupTypeId, lv.Value })
            .IsUnique();

        modelBuilder.Entity<LookupValue>()
            .HasIndex(lv => lv.TypeCode);

        modelBuilder.Entity<CustomerCustomAttribute>()
            .HasOne(cca => cca.Customer)
            .WithMany(c => c.CustomAttributes)
            .HasForeignKey(cca => cca.CustomerId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<CaseParticipant>()
            .HasKey(cp => new { cp.CaseId, cp.UserId });

        modelBuilder.Entity<LinkedCase>()
            .HasKey(lc => new { lc.CaseId, lc.TargetCaseId });

        modelBuilder.Entity<LinkedCase>()
            .HasOne(lc => lc.Case)
            .WithMany(c => c.LinkedCases)
            .HasForeignKey(lc => lc.CaseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<LinkedCase>()
            .HasOne(lc => lc.TargetCase)
            .WithMany(c => c.LinkedToCases)
            .HasForeignKey(lc => lc.TargetCaseId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CaseChildRelation>()
            .HasIndex(cr => cr.ChildId)
            .IsUnique();

        // --- Performance indexes ---
        // Mirrored as idempotent CREATE INDEX IF NOT EXISTS statements in Program.cs, because
        // this project provisions with EnsureCreated() rather than Migrate(); the SQL block
        // is what brings already-provisioned databases up to this shape.

        // Board listing orders by CreatedAt DESC, optionally filtered by department.
        modelBuilder.Entity<Case>()
            .HasIndex(c => c.CreatedAt)
            .IsDescending();

        modelBuilder.Entity<Case>()
            .HasIndex(c => new { c.DepartmentId, c.CreatedAt })
            .IsDescending(false, true);

        // Audit trail pages a global CreatedAt DESC ordering; case detail reads one case's timeline.
        modelBuilder.Entity<CaseEvent>()
            .HasIndex(ce => ce.CreatedAt)
            .IsDescending();

        modelBuilder.Entity<CaseEvent>()
            .HasIndex(ce => new { ce.CaseId, ce.CreatedAt })
            .IsDescending(false, true);

        // Notification list is always scoped to one recipient, newest first.
        modelBuilder.Entity<NotificationItem>()
            .HasIndex(n => new { n.RecipientUserId, n.CreatedAt })
            .IsDescending(false, true);

        // Unread badge is polled continuously; a partial index keeps it small.
        modelBuilder.Entity<NotificationItem>()
            .HasIndex(n => n.RecipientUserId)
            .HasFilter(@"""IsRead"" = false")
            .HasDatabaseName("IX_Notifications_Unread");

        modelBuilder.Entity<CaseChildRelation>()
            .HasOne(cr => cr.ParentCase)
            .WithMany(c => c.ChildRelations)
            .HasForeignKey(cr => cr.ParentCaseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<CaseChildRelation>()
            .HasOne(cr => cr.LinkedCase)
            .WithMany()
            .HasForeignKey(cr => cr.LinkedCaseId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CaseChildRelation>()
            .HasOne(cr => cr.CreatedByUser)
            .WithMany()
            .HasForeignKey(cr => cr.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CaseChildRelation>()
            .Property(cr => cr.RelationType)
            .HasConversion<string>();
            
        modelBuilder.Entity<Case>()
            .HasOne(c => c.Owner)
            .WithMany()
            .HasForeignKey(c => c.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Department>()
            .HasOne(d => d.Owner)
            .WithMany()
            .HasForeignKey(d => d.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CaseEvent>()
            .HasOne(ce => ce.Case)
            .WithMany(c => c.Events)
            .HasForeignKey(ce => ce.CaseId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<CaseEvent>()
            .HasOne(ce => ce.User)
            .WithMany()
            .HasForeignKey(ce => ce.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Case>()
            .HasOne(c => c.ParentCase)
            .WithMany(c => c.Subcases)
            .HasForeignKey(c => c.ParentCaseId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Case>()
            .HasOne(c => c.LinkedSourceCase)
            .WithMany()
            .HasForeignKey(c => c.LinkedSourceCaseId)
            .OnDelete(DeleteBehavior.Restrict);
            
        var userStatusConverter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<UserStatus, string>(
            v => v.ToString(),
            v => ParseUserStatus(v)
        );

        var caseStatusConverter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<CaseStatus, string>(
            v => v.ToString(),
            v => ParseCaseStatus(v)
        );

        // Enums mapping to strings
        modelBuilder.Entity<Case>()
            .Property(c => c.Status)
            .HasConversion(caseStatusConverter);
            
        var eventTypeConverter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<EventType, string>(
            v => v.ToString(),
            v => ParseEventType(v)
        );

        modelBuilder.Entity<CaseEvent>()
            .Property(ce => ce.EventType)
            .HasConversion(eventTypeConverter);
            
        modelBuilder.Entity<CaseParticipant>()
            .Property(cp => cp.Role)
            .HasConversion<string>();
            
        modelBuilder.Entity<User>()
            .Property(u => u.Status)
            .HasConversion(userStatusConverter);
    }

    public override int SaveChanges()
    {
        UpdateAuditableEntities();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        UpdateAuditableEntities();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void UpdateAuditableEntities()
    {
        var entries = ChangeTracker.Entries<AuditableEntity>();

        foreach (var entry in entries)
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = DateTime.UtcNow;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = DateTime.UtcNow;
            }
        }
    }

    private static UserStatus ParseUserStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return UserStatus.Available;
        if (Enum.TryParse<UserStatus>(value, true, out var status)) return status;
        return UserStatus.Available;
    }


    private static EventType ParseEventType(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return EventType.Other;
        if (Enum.TryParse<EventType>(value, true, out var eventType)) return eventType;
        return EventType.Other;
    }

    private static CaseStatus ParseCaseStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return CaseStatus.Open;
        if (Enum.TryParse<CaseStatus>(value, true, out var status)) return status;
        if (string.Equals(value, "In_Progress", StringComparison.OrdinalIgnoreCase)) return CaseStatus.InProgress;
        return CaseStatus.Open;
    }
}
