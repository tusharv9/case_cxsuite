namespace CaseManagement.Api.Data;

using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

public static class DbSeeder
{
    public static void Seed(AppDbContext context)
    {
        SeedConfigurableSettings(context);
        SeedCaseManagementSettings(context);

        // Check if database is already seeded
        if (context.Users.Any())
        {
            FixInfinityDates(context);
            FixPreExistingReopenedSubcases(context);
            SeedEscalationTemplates(context);
            SeedPassportCustomer(context);
            EnsureCaseChannelsAndStatuses(context);
            return;
        }

        var contactCenterDept = new Department
        {
            Id = Guid.NewGuid(),
            Name = "Contact Center",
            Code = "CC"
        };

        var microFinanceDept = new Department
        {
            Id = Guid.NewGuid(),
            Name = "Micro Finance",
            Code = "MF"
        };

        context.Departments.AddRange(contactCenterDept, microFinanceDept);
        context.SaveChanges();

        var siti = new User
        {
            Id = Guid.NewGuid(),
            Name = "Siti Nurhaliza",
            Email = "siti@bank.com",
            Role = "Sr. CC Agent",
            DepartmentId = contactCenterDept.Id
        };

        // Note: Used aisha@bank.com instead of siti@bank.com to prevent a Unique Constraint violation on the Email field.
        var aisha = new User
        {
            Id = Guid.NewGuid(),
            Name = "Aisha Sazlina",
            Email = "aisha@bank.com",
            Role = "MicroFinance Officer",
            DepartmentId = microFinanceDept.Id
        };

        context.Users.AddRange(siti, aisha);
        context.SaveChanges();

        // Assign owners
        contactCenterDept.OwnerId = siti.Id;
        microFinanceDept.OwnerId = aisha.Id;

        context.SaveChanges();

        SeedEscalationTemplates(context);
    }

    /// <summary>
    /// Ships a real, working escalation template per department so an administrator can see
    /// exactly how the feature behaves (and how the placeholders are substituted) instead of
    /// starting from an empty screen. Only inserted where the department has none.
    /// </summary>
    private static void SeedEscalationTemplates(AppDbContext context)
    {
        try
        {
            const string reason = "SLA Breach";
            const string subject = "[Escalation Required] Case {caseNumber} - {severity} Priority";
            const string body =
@"Dear {departmentName} Team,

This is to notify you that Case {caseNumber} for customer {customerName} has been escalated and requires your attention.

Case Details
------------------------------
Case Number: {caseNumber}
Customer Name: {customerName}
Severity: {severity}
Target Department: {departmentName}
------------------------------

Please review the case details and take the necessary action at the earliest opportunity.

If additional information is required, please refer to the case record in the Case Management system.

Regards,
Omni Suite
Customer Experience Team";

            var departments = context.Departments.ToList();
            if (departments.Count == 0) return;

            var now = DateTime.UtcNow;
            var added = false;

            foreach (var department in departments)
            {
                var exists = context.DepartmentEscalationTemplates
                    .Any(t => t.DepartmentId == department.Id && t.EscalationReason == reason);
                if (exists) continue;

                context.DepartmentEscalationTemplates.Add(new DepartmentEscalationTemplate
                {
                    Id = Guid.NewGuid(),
                    DepartmentId = department.Id,
                    EscalationReason = reason,
                    SubjectTemplate = subject,
                    BodyTemplate = body,
                    IsActive = true,
                    CreatedAt = now
                });
                added = true;
            }

            if (added) context.SaveChanges();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SeedEscalationTemplates Error] {ex.Message}");
        }
    }

    private static void SeedPassportCustomer(AppDbContext context)
    {
        try
        {
            if (!context.Customers.Any(c => c.NRIC == "A98765432"))
            {
                var passportCustomer = new Customer
                {
                    Id = Guid.NewGuid(),
                    FullName = "Sophia Martinez",
                    NRIC = "A98765432",
                    PhoneNumber = "+60 19-876 5432",
                    Email = "sophia.martinez@example.com",
                    Branch = "Kuala Lumpur",
                    PreferredLanguage = "English",
                    DateOfBirth = new DateTime(1992, 8, 15, 0, 0, 0, DateTimeKind.Utc),
                    CustomerSegment = "Gold",
                    TenureMonths = 24,
                    CreatedAt = DateTime.UtcNow
                };

                passportCustomer.CustomAttributes.Add(new CustomerCustomAttribute
                {
                    Id = Guid.NewGuid(),
                    CustomerId = passportCustomer.Id,
                    FieldKey = "idType",
                    FieldValue = "Passport Number",
                    CreatedAt = DateTime.UtcNow
                });

                context.Customers.Add(passportCustomer);
                context.SaveChanges();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SeedPassportCustomer Error] {ex.Message}");
        }
    }

    private static void FixInfinityDates(AppDbContext context)
    {
        var users = context.Users.Where(u => u.CreatedAt == DateTime.MinValue).ToList();
        var depts = context.Departments.Where(d => d.CreatedAt == DateTime.MinValue).ToList();
        var customers = context.Customers.Where(c => c.CreatedAt == DateTime.MinValue).ToList();

        var now = DateTime.UtcNow;

        foreach(var u in users) u.CreatedAt = now;
        foreach(var d in depts) d.CreatedAt = now;
        foreach(var c in customers) c.CreatedAt = now;

        if (users.Any() || depts.Any() || customers.Any())
        {
            context.SaveChanges();
        }
    }

    private static void FixPreExistingReopenedSubcases(AppDbContext context)
    {
        try
        {
            var reopenedChildRels = Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.Include(
                context.CaseChildRelations, cr => cr.ParentCase)
                .Where(cr => cr.RelationType == ChildRelationType.Reopen)
                .ToList();

            bool changed = false;
            foreach (var cr in reopenedChildRels)
            {
                if (cr.ParentCase != null)
                {
                    if (cr.ParentCase.Status != CaseStatus.Resolved)
                    {
                        cr.ParentCase.Status = CaseStatus.Resolved;
                        changed = true;
                    }

                    var subcaseExists = context.Cases.Any(c => c.CaseNumber == cr.ChildId);
                    if (!subcaseExists)
                    {
                        var subcase = new Case
                        {
                            Id = Guid.NewGuid(),
                            CaseNumber = cr.ChildId,
                            CaseType = cr.ParentCase.CaseType,
                            Title = cr.ParentCase.Title.StartsWith("[Reopened]") ? cr.ParentCase.Title : $"[Reopened] {cr.ParentCase.Title}",
                            Description = $"Reopened Subcase from Parent {cr.ParentCase.CaseNumber}. Reason: {cr.Reason}",
                            Status = CaseStatus.Open,
                            Severity = cr.ParentCase.Severity,
                            SlaStartTime = cr.CreatedAt,
                            SlaTargetHours = cr.ParentCase.SlaTargetHours > 0 ? cr.ParentCase.SlaTargetHours : 24,
                            DepartmentId = cr.ParentCase.DepartmentId,
                            CustomerId = cr.ParentCase.CustomerId,
                            OwnerId = cr.ParentCase.OwnerId,
                            ParentCaseId = cr.ParentCaseId,
                            SubcaseType = "ReopenedSubcase",
                            CreatedAt = cr.CreatedAt
                        };
                        context.Cases.Add(subcase);
                        changed = true;
                    }
                }
            }

            if (changed)
            {
                context.SaveChanges();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[FixPreExistingReopenedSubcases Error] {ex.Message}");
        }
    }

    private static void SeedConfigurableSettings(AppDbContext context)
    {
        try
        {
            var now = DateTime.UtcNow;

            // 1. Seed Lookup Types & Values if empty
            if (!context.LookupTypes.Any())
            {
                var langType = new LookupType
                {
                    Id = Guid.NewGuid(),
                    Code = "PREFERRED_LANGUAGE",
                    Name = "Preferred Language",
                    Description = "Available language options for customer profile & filter dropdowns",
                    CreatedAt = now
                };

                var branchType = new LookupType
                {
                    Id = Guid.NewGuid(),
                    Code = "HOME_BRANCH",
                    Name = "Home Branch",
                    Description = "Bank branch locations available for customer servicing",
                    CreatedAt = now
                };

                var idType = new LookupType
                {
                    Id = Guid.NewGuid(),
                    Code = "ID_TYPE",
                    Name = "ID Type",
                    Description = "Supported customer identification types",
                    CreatedAt = now
                };

                context.LookupTypes.AddRange(langType, branchType, idType);

                // Values
                context.LookupValues.AddRange(
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = langType.Id, TypeCode = "PREFERRED_LANGUAGE", Value = "English", Label = "English", DisplayOrder = 1, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = langType.Id, TypeCode = "PREFERRED_LANGUAGE", Value = "Bahasa Malaysia", Label = "Bahasa Malaysia", DisplayOrder = 2, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = langType.Id, TypeCode = "PREFERRED_LANGUAGE", Value = "Chinese", Label = "Chinese", DisplayOrder = 3, IsActive = true, CreatedAt = now },

                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = branchType.Id, TypeCode = "HOME_BRANCH", Value = "KL HQ", Label = "KL HQ", DisplayOrder = 1, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = branchType.Id, TypeCode = "HOME_BRANCH", Value = "Kepong Branch", Label = "Kepong Branch", DisplayOrder = 2, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = branchType.Id, TypeCode = "HOME_BRANCH", Value = "Kuala Lumpur Main", Label = "Kuala Lumpur Main", DisplayOrder = 3, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = branchType.Id, TypeCode = "HOME_BRANCH", Value = "Penang Branch", Label = "Penang Branch", DisplayOrder = 4, IsActive = true, CreatedAt = now },

                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = idType.Id, TypeCode = "ID_TYPE", Value = "NRIC Number", Label = "NRIC Number", DisplayOrder = 1, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = idType.Id, TypeCode = "ID_TYPE", Value = "IC Number", Label = "IC Number", DisplayOrder = 2, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = idType.Id, TypeCode = "ID_TYPE", Value = "ID Number", Label = "ID Number", DisplayOrder = 3, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = idType.Id, TypeCode = "ID_TYPE", Value = "Passport", Label = "Passport", DisplayOrder = 4, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = idType.Id, TypeCode = "ID_TYPE", Value = "Account Number", Label = "Account Number", DisplayOrder = 5, IsActive = true, CreatedAt = now }
                );

                context.SaveChanges();
            }

            // 2. Seed Field Configurations if empty
            if (!context.FieldConfigurations.Any())
            {
                var fields = new List<FieldConfiguration>
                {
                    // AddNewCustomer Section
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "AddNewCustomer", ApiField = "fullName", DisplayLabel = "Full Name", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 1, FieldType = "Text", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "AddNewCustomer", ApiField = "idType", DisplayLabel = "Choose an ID", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 2, FieldType = "Dropdown", LookupTypeCode = "ID_TYPE", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "AddNewCustomer", ApiField = "idValue", DisplayLabel = "ID Value", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 3, FieldType = "Text", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "AddNewCustomer", ApiField = "dateOfBirth", DisplayLabel = "Date of Birth", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 4, FieldType = "Date", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "AddNewCustomer", ApiField = "phoneNumber", DisplayLabel = "Phone Number", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 5, FieldType = "Phone", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "AddNewCustomer", ApiField = "email", DisplayLabel = "Email Address", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 6, FieldType = "Email", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "AddNewCustomer", ApiField = "preferredLanguage", DisplayLabel = "Preferred Language", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 7, FieldType = "Dropdown", LookupTypeCode = "PREFERRED_LANGUAGE", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "AddNewCustomer", ApiField = "branch", DisplayLabel = "Home Branch", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 8, FieldType = "Dropdown", LookupTypeCode = "HOME_BRANCH", CreatedAt = now },

                    // ExistingCustomer Section
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "ExistingCustomer", ApiField = "idType", DisplayLabel = "Choose an ID", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 1, FieldType = "Dropdown", LookupTypeCode = "ID_TYPE", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "ExistingCustomer", ApiField = "idValue", DisplayLabel = "ID Value", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 2, FieldType = "Text", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "ExistingCustomer", ApiField = "phoneNumber", DisplayLabel = "Phone Number", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 3, FieldType = "Phone", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "ExistingCustomer", ApiField = "dateOfBirth", DisplayLabel = "Date of Birth", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 4, FieldType = "Date", CreatedAt = now },

                    // Customer 360 Filters Section
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "Filters", ApiField = "preferredLanguage", DisplayLabel = "Preferred Language", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 1, FieldType = "Dropdown", LookupTypeCode = "PREFERRED_LANGUAGE", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "Filters", ApiField = "branch", DisplayLabel = "Home Branch", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 2, FieldType = "Dropdown", LookupTypeCode = "HOME_BRANCH", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "Customer360", SectionKey = "Filters", ApiField = "tenure", DisplayLabel = "Tenure", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 3, FieldType = "Dropdown", CreatedAt = now }
                };

                context.FieldConfigurations.AddRange(fields);
                context.SaveChanges();
            }
            else
            {
                // Ensure idType and idValue are present in existing database
                context.Database.ExecuteSqlRaw(@"
                    INSERT INTO ""FieldConfigurations"" (""Id"", ""ModuleKey"", ""SectionKey"", ""ApiField"", ""DisplayLabel"", ""IsVisible"", ""IsRequired"", ""IsEditable"", ""IsSensitive"", ""MaskingRule"", ""VisibleChars"", ""DisplayOrder"", ""FieldType"", ""LookupTypeCode"", ""IsCustomField"", ""CreatedAt"")
                    SELECT gen_random_uuid(), 'Customer360', 'AddNewCustomer', 'idType', 'Choose an ID', true, true, true, false, 'None', 4, 2, 'Dropdown', 'ID_TYPE', false, NOW()
                    WHERE NOT EXISTS (
                        SELECT 1 FROM ""FieldConfigurations"" WHERE ""ModuleKey"" = 'Customer360' AND ""SectionKey"" = 'AddNewCustomer' AND ""ApiField"" = 'idType'
                    );

                    INSERT INTO ""FieldConfigurations"" (""Id"", ""ModuleKey"", ""SectionKey"", ""ApiField"", ""DisplayLabel"", ""IsVisible"", ""IsRequired"", ""IsEditable"", ""IsSensitive"", ""MaskingRule"", ""VisibleChars"", ""DisplayOrder"", ""FieldType"", ""LookupTypeCode"", ""IsCustomField"", ""CreatedAt"")
                    SELECT gen_random_uuid(), 'Customer360', 'AddNewCustomer', 'idValue', 'ID Value', true, true, true, false, 'None', 4, 3, 'Text', NULL, false, NOW()
                    WHERE NOT EXISTS (
                        SELECT 1 FROM ""FieldConfigurations"" WHERE ""ModuleKey"" = 'Customer360' AND ""SectionKey"" = 'AddNewCustomer' AND ""ApiField"" = 'idValue'
                    );
                ");
            }

            SeedNotificationRules(context);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SeedConfigurableSettings Error] {ex.Message}");
        }
    }

    private static void SeedNotificationRules(AppDbContext context)
    {
        try
        {
            if (context.NotificationRules.Any()) return;

            var now = DateTime.UtcNow;
            var defaultRules = new List<NotificationRule>
            {
                new NotificationRule
                {
                    Id = Guid.NewGuid(),
                    EventType = "SLA_BREACHED",
                    Name = "SLA Breach Notification",
                    IsEnabled = true,
                    Priority = "High",
                    CooldownMinutes = 60,
                    MaxReminders = 3,
                    EnableAggregation = true,
                    AggregationThreshold = 3,
                    CreatedAt = now
                },
                new NotificationRule
                {
                    Id = Guid.NewGuid(),
                    EventType = "SLA_APPROACHING",
                    Name = "SLA Approaching Warning",
                    IsEnabled = true,
                    Priority = "Medium",
                    CooldownMinutes = 120,
                    MaxReminders = 2,
                    EnableAggregation = true,
                    AggregationThreshold = 3,
                    CreatedAt = now
                },
                new NotificationRule
                {
                    Id = Guid.NewGuid(),
                    EventType = "CASE_ASSIGNED",
                    Name = "Case Assignment Alert",
                    IsEnabled = true,
                    Priority = "Medium",
                    CooldownMinutes = 0,
                    MaxReminders = 0,
                    EnableAggregation = false,
                    AggregationThreshold = 5,
                    CreatedAt = now
                },
                new NotificationRule
                {
                    Id = Guid.NewGuid(),
                    EventType = "CASE_ESCALATED",
                    Name = "Case Escalation Alert",
                    IsEnabled = true,
                    Priority = "Critical",
                    CooldownMinutes = 30,
                    MaxReminders = 3,
                    EnableAggregation = true,
                    AggregationThreshold = 2,
                    CreatedAt = now
                },
                new NotificationRule
                {
                    Id = Guid.NewGuid(),
                    EventType = "CONFIG_CHANGED",
                    Name = "System Configuration Change",
                    IsEnabled = true,
                    Priority = "Info",
                    CooldownMinutes = 0,
                    MaxReminders = 0,
                    EnableAggregation = false,
                    AggregationThreshold = 5,
                    CreatedAt = now
                }
            };

            context.NotificationRules.AddRange(defaultRules);
            context.SaveChanges();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SeedNotificationRules Error] {ex.Message}");
        }
    }

    private static void SeedCaseManagementSettings(AppDbContext context)
    {
        var now = DateTime.UtcNow;
        try
        {
            // 1. Seed COMMUNICATION_CHANNEL lookup type if missing
            var channelType = context.LookupTypes.FirstOrDefault(lt => lt.Code == "COMMUNICATION_CHANNEL");
            if (channelType == null)
            {
                channelType = new LookupType
                {
                    Id = Guid.NewGuid(),
                    Code = "COMMUNICATION_CHANNEL",
                    Name = "Communication Channel",
                    Description = "Supported preferred customer communication channels",
                    CreatedAt = now
                };
                context.LookupTypes.Add(channelType);
                context.SaveChanges();

                context.LookupValues.AddRange(
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = channelType.Id, TypeCode = "COMMUNICATION_CHANNEL", Value = "Email", Label = "Email", DisplayOrder = 1, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = channelType.Id, TypeCode = "COMMUNICATION_CHANNEL", Value = "Phone", Label = "Phone", DisplayOrder = 2, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = channelType.Id, TypeCode = "COMMUNICATION_CHANNEL", Value = "SMS", Label = "SMS", DisplayOrder = 3, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = channelType.Id, TypeCode = "COMMUNICATION_CHANNEL", Value = "WhatsApp", Label = "WhatsApp", DisplayOrder = 4, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = channelType.Id, TypeCode = "COMMUNICATION_CHANNEL", Value = "In Person", Label = "In Person", DisplayOrder = 5, IsActive = true, CreatedAt = now }
                );
                context.SaveChanges();
            }

            // 2. Seed CaseTypeConfigs if empty
            if (!context.CaseTypeConfigs.Any())
            {
                context.CaseTypeConfigs.AddRange(
                    new CaseTypeConfig { Id = Guid.NewGuid(), Code = "Complaint", Name = "Complaint", Prefix = "C-", DisplayOrder = 1, IsActive = true, CreatedAt = now },
                    new CaseTypeConfig { Id = Guid.NewGuid(), Code = "Service", Name = "Service", Prefix = "S-", DisplayOrder = 2, IsActive = true, CreatedAt = now },
                    new CaseTypeConfig { Id = Guid.NewGuid(), Code = "Inquiry", Name = "Inquiry", Prefix = "I-", DisplayOrder = 3, IsActive = true, CreatedAt = now }
                );
                context.SaveChanges();
            }

            // 3. Seed SlaConfigurations if empty
            if (!context.SlaConfigurations.Any())
            {
                context.SlaConfigurations.AddRange(
                    new SlaConfiguration { Id = Guid.NewGuid(), Severity = "Critical", InternalHours = 2, ExternalHours = 4, IsActive = true, CreatedAt = now },
                    new SlaConfiguration { Id = Guid.NewGuid(), Severity = "High", InternalHours = 6, ExternalHours = 8, IsActive = true, CreatedAt = now },
                    new SlaConfiguration { Id = Guid.NewGuid(), Severity = "Medium", InternalHours = 10, ExternalHours = 12, IsActive = true, CreatedAt = now },
                    new SlaConfiguration { Id = Guid.NewGuid(), Severity = "Low", InternalHours = 22, ExternalHours = 24, IsActive = true, CreatedAt = now }
                );
                context.SaveChanges();
            }

            // 4. Seed the CASE_SEVERITY master list from the SLA rows, so the severities the
            //    administrator sees are real configuration rather than a hardcoded array.
            var severityType = context.LookupTypes.FirstOrDefault(lt => lt.Code == "CASE_SEVERITY");
            if (severityType == null)
            {
                severityType = new LookupType
                {
                    Id = Guid.NewGuid(),
                    Code = "CASE_SEVERITY",
                    Name = "Case Severity",
                    Description = "Configurable case severity levels driving SLA Configuration and the Create Case form",
                    CreatedAt = now
                };
                context.LookupTypes.Add(severityType);
                context.SaveChanges();
            }

            var defaultSeverities = new[] { "Critical", "High", "Medium", "Low" };
            var existingSeverities = context.LookupValues
                .Where(v => v.TypeCode == "CASE_SEVERITY")
                .Select(v => v.Value)
                .ToList();

            var missingSeverities = defaultSeverities
                .Where(sev => !existingSeverities.Contains(sev))
                .Select((sev, i) => new LookupValue
                {
                    Id = Guid.NewGuid(),
                    LookupTypeId = severityType.Id,
                    TypeCode = "CASE_SEVERITY",
                    Value = sev,
                    Label = sev,
                    DisplayOrder = Array.IndexOf(defaultSeverities, sev) + 1,
                    IsActive = true,
                    CreatedAt = now
                })
                .ToList();

            if (missingSeverities.Count > 0)
            {
                context.LookupValues.AddRange(missingSeverities);
                context.SaveChanges();
                existingSeverities.AddRange(missingSeverities.Select(v => v.Value));
            }

            // Reconcile: an SLA row without a matching master value would be invisible (and so
            // unmanageable) on the Severity screen, so it is promoted into the master list.
            var orphanSlaSeverities = context.SlaConfigurations
                .Select(x => x.Severity)
                .ToList()
                .Where(sev => !existingSeverities.Contains(sev, StringComparer.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (orphanSlaSeverities.Count > 0)
            {
                context.LookupValues.AddRange(orphanSlaSeverities.Select((sev, i) => new LookupValue
                {
                    Id = Guid.NewGuid(),
                    LookupTypeId = severityType.Id,
                    TypeCode = "CASE_SEVERITY",
                    Value = sev,
                    Label = sev,
                    DisplayOrder = defaultSeverities.Length + i + 1,
                    IsActive = true,
                    CreatedAt = now
                }));
                context.SaveChanges();
            }

            // 5. Seed CaseManagement FieldConfigurations if missing
            var existingCaseFields = context.FieldConfigurations.Where(f => f.ModuleKey == "CaseManagement").ToList();
            if (!existingCaseFields.Any(f => f.SectionKey == "CreateCase"))
            {
                context.FieldConfigurations.AddRange(
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "caseType", DisplayLabel = "Case Type", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 1, FieldType = "Dropdown", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "title", DisplayLabel = "Case Title", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 2, FieldType = "Text", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "description", DisplayLabel = "Description", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 3, FieldType = "Text", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "selectCustomer", DisplayLabel = "Select Customer", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 4, FieldType = "Dropdown", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "departmentId", DisplayLabel = "Department", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 5, FieldType = "Dropdown", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "subCategory", DisplayLabel = "Sub-category", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 6, FieldType = "Dropdown", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "preferredLanguage", DisplayLabel = "Preferred Language", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 7, FieldType = "Dropdown", LookupTypeCode = "PREFERRED_LANGUAGE", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "communicationChannel", DisplayLabel = "Preferred Communication Channel", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 8, FieldType = "Dropdown", LookupTypeCode = "COMMUNICATION_CHANNEL", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "CreateCase", ApiField = "severity", DisplayLabel = "Severity", IsVisible = true, IsRequired = true, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 9, FieldType = "Dropdown", CreatedAt = now }
                );
                context.SaveChanges();
            }

            if (!existingCaseFields.Any(f => f.SectionKey == "Filters"))
            {
                context.FieldConfigurations.AddRange(
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "Filters", ApiField = "departmentId", DisplayLabel = "Handling Department", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 1, FieldType = "Dropdown", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "Filters", ApiField = "status", DisplayLabel = "Case Status", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 2, FieldType = "Dropdown", CreatedAt = now },
                    new FieldConfiguration { Id = Guid.NewGuid(), ModuleKey = "CaseManagement", SectionKey = "Filters", ApiField = "caseType", DisplayLabel = "Case Type", IsVisible = true, IsRequired = false, IsEditable = true, IsSensitive = false, MaskingRule = "None", VisibleChars = 4, DisplayOrder = 3, FieldType = "Dropdown", CreatedAt = now }
                );
                context.SaveChanges();
            }

            // 6. Seed Dashboard Quick Actions lookup type if missing
            var quickActionType = context.LookupTypes.FirstOrDefault(lt => lt.Code == "DASHBOARD_QUICK_ACTION");
            if (quickActionType == null)
            {
                quickActionType = new LookupType
                {
                    Id = Guid.NewGuid(),
                    Code = "DASHBOARD_QUICK_ACTION",
                    Name = "Dashboard Quick Actions",
                    Description = "Configurable quick action buttons in the Dashboard header banner",
                    CreatedAt = now
                };
                context.LookupTypes.Add(quickActionType);
                context.SaveChanges();

                context.LookupValues.AddRange(
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = quickActionType.Id, TypeCode = "DASHBOARD_QUICK_ACTION", Value = "create_case", Label = "Create Case", DisplayOrder = 1, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = quickActionType.Id, TypeCode = "DASHBOARD_QUICK_ACTION", Value = "create_customer", Label = "Create Customer", DisplayOrder = 2, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = quickActionType.Id, TypeCode = "DASHBOARD_QUICK_ACTION", Value = "assign_case", Label = "Assign Case", DisplayOrder = 3, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = quickActionType.Id, TypeCode = "DASHBOARD_QUICK_ACTION", Value = "search_cases", Label = "Search Cases", DisplayOrder = 4, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = quickActionType.Id, TypeCode = "DASHBOARD_QUICK_ACTION", Value = "my_cases_toggle", Label = "My Cases Only", DisplayOrder = 5, IsActive = true, CreatedAt = now }
                );
                context.SaveChanges();
            }

            // 7. Seed Dashboard Date Range Options lookup type if missing
            var dateRangeType = context.LookupTypes.FirstOrDefault(lt => lt.Code == "DASHBOARD_DATE_RANGE");
            if (dateRangeType == null)
            {
                dateRangeType = new LookupType
                {
                    Id = Guid.NewGuid(),
                    Code = "DASHBOARD_DATE_RANGE",
                    Name = "Dashboard Date Range Options",
                    Description = "Configurable date range filter choices for the Dashboard header",
                    CreatedAt = now
                };
                context.LookupTypes.Add(dateRangeType);
                context.SaveChanges();

                context.LookupValues.AddRange(
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = dateRangeType.Id, TypeCode = "DASHBOARD_DATE_RANGE", Value = "today", Label = "Today", DisplayOrder = 1, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = dateRangeType.Id, TypeCode = "DASHBOARD_DATE_RANGE", Value = "this_week", Label = "This Week", DisplayOrder = 2, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = dateRangeType.Id, TypeCode = "DASHBOARD_DATE_RANGE", Value = "last_week", Label = "Last Week", DisplayOrder = 3, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = dateRangeType.Id, TypeCode = "DASHBOARD_DATE_RANGE", Value = "this_month", Label = "This Month", DisplayOrder = 4, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = dateRangeType.Id, TypeCode = "DASHBOARD_DATE_RANGE", Value = "last_month", Label = "Last Month", DisplayOrder = 5, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = dateRangeType.Id, TypeCode = "DASHBOARD_DATE_RANGE", Value = "this_quarter", Label = "This Quarter", DisplayOrder = 6, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = dateRangeType.Id, TypeCode = "DASHBOARD_DATE_RANGE", Value = "this_year", Label = "This Year", DisplayOrder = 7, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = dateRangeType.Id, TypeCode = "DASHBOARD_DATE_RANGE", Value = "all", Label = "All Time", DisplayOrder = 8, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = dateRangeType.Id, TypeCode = "DASHBOARD_DATE_RANGE", Value = "custom", Label = "Custom Range", DisplayOrder = 9, IsActive = true, CreatedAt = now }
                );
                context.SaveChanges();
            }

            // 8. Seed Case Statuses lookup type if missing
            var statusType = context.LookupTypes.FirstOrDefault(lt => lt.Code == "CASE_STATUS");
            if (statusType == null)
            {
                statusType = new LookupType
                {
                    Id = Guid.NewGuid(),
                    Code = "CASE_STATUS",
                    Name = "Case Statuses",
                    Description = "Configurable case statuses for filtering and status tracking",
                    CreatedAt = now
                };
                context.LookupTypes.Add(statusType);
                context.SaveChanges();

                context.LookupValues.AddRange(
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = statusType.Id, TypeCode = "CASE_STATUS", Value = "Open", Label = "Open", DisplayOrder = 1, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = statusType.Id, TypeCode = "CASE_STATUS", Value = "InProgress", Label = "In Progress", DisplayOrder = 2, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = statusType.Id, TypeCode = "CASE_STATUS", Value = "Escalated", Label = "Escalated", DisplayOrder = 3, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = statusType.Id, TypeCode = "CASE_STATUS", Value = "Resolved", Label = "Resolved", DisplayOrder = 4, IsActive = true, CreatedAt = now }
                );
                context.SaveChanges();
            }

            // 9. Seed SLA Statuses lookup type if missing
            var slaStatusType = context.LookupTypes.FirstOrDefault(lt => lt.Code == "SLA_STATUS");
            if (slaStatusType == null)
            {
                slaStatusType = new LookupType
                {
                    Id = Guid.NewGuid(),
                    Code = "SLA_STATUS",
                    Name = "SLA Statuses",
                    Description = "Configurable SLA status choices for Dashboard filter",
                    CreatedAt = now
                };
                context.LookupTypes.Add(slaStatusType);
                context.SaveChanges();

                context.LookupValues.AddRange(
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = slaStatusType.Id, TypeCode = "SLA_STATUS", Value = "healthy", Label = "Within SLA", DisplayOrder = 1, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = slaStatusType.Id, TypeCode = "SLA_STATUS", Value = "approaching", Label = "Approaching SLA", DisplayOrder = 2, IsActive = true, CreatedAt = now },
                    new LookupValue { Id = Guid.NewGuid(), LookupTypeId = slaStatusType.Id, TypeCode = "SLA_STATUS", Value = "breached", Label = "SLA Breached", DisplayOrder = 3, IsActive = true, CreatedAt = now }
                );
                context.SaveChanges();
            }

            // 10. Reconcile Case Statuses & Case Types: purge dummy entries and guarantee standard statuses
            var dummyStatuses = context.LookupValues.Where(lv => lv.TypeCode == "CASE_STATUS" && (lv.Value.ToLower() == "within customer" || lv.Label.ToLower() == "within customer")).ToList();
            if (dummyStatuses.Any())
            {
                context.LookupValues.RemoveRange(dummyStatuses);
                context.SaveChanges();
            }

            var dummyCaseTypes = context.CaseTypeConfigs.Where(ct => ct.Code == "InfoReq" || ct.Name == "Info Request").ToList();
            if (dummyCaseTypes.Any())
            {
                context.CaseTypeConfigs.RemoveRange(dummyCaseTypes);
                context.SaveChanges();
            }

            var caseStatusType = context.LookupTypes.FirstOrDefault(lt => lt.Code == "CASE_STATUS");
            if (caseStatusType != null)
            {
                var hasClosedStatus = context.LookupValues.Any(lv => lv.TypeCode == "CASE_STATUS" && (lv.Value == "Closed" || lv.Label == "Closed"));
                if (!hasClosedStatus)
                {
                    context.LookupValues.Add(new LookupValue
                    {
                        Id = Guid.NewGuid(),
                        LookupTypeId = caseStatusType.Id,
                        TypeCode = "CASE_STATUS",
                        Value = "Closed",
                        Label = "Closed",
                        DisplayOrder = 4,
                        IsActive = true,
                        CreatedAt = now
                    });
                    context.SaveChanges();
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SeedCaseManagementSettings Error] {ex.Message}");
        }
    }

    private static void EnsureCaseChannelsAndStatuses(AppDbContext context)
    {
        try
        {
            var now = DateTime.UtcNow;

            // 1. Ensure LookupValues for COMMUNICATION_CHANNEL includes Voice, Email, WhatsApp, SMS, Branch, Web Chat, Social
            var channelType = context.LookupTypes.FirstOrDefault(lt => lt.Code == "COMMUNICATION_CHANNEL");
            if (channelType != null)
            {
                var requiredChannels = new[] { "Voice", "Email", "WhatsApp", "SMS", "Branch", "Web Chat", "Social" };
                int order = 1;
                foreach (var ch in requiredChannels)
                {
                    var exists = context.LookupValues.Any(lv => lv.TypeCode == "COMMUNICATION_CHANNEL" && (lv.Value == ch || lv.Label == ch));
                    if (!exists)
                    {
                        context.LookupValues.Add(new LookupValue
                        {
                            Id = Guid.NewGuid(),
                            LookupTypeId = channelType.Id,
                            TypeCode = "COMMUNICATION_CHANNEL",
                            Value = ch,
                            Label = ch,
                            DisplayOrder = order,
                            IsActive = true,
                            CreatedAt = now
                        });
                    }
                    order++;
                }
                context.SaveChanges();
            }

            // 2. Ensure LookupValues for CASE_STATUS has Waiting on Customer
            var statusType = context.LookupTypes.FirstOrDefault(lt => lt.Code == "CASE_STATUS");
            if (statusType != null)
            {
                var exists = context.LookupValues.Any(lv => lv.TypeCode == "CASE_STATUS" && (lv.Value == "WaitingOnCustomer" || lv.Label == "Waiting on Customer"));
                if (!exists)
                {
                    context.LookupValues.Add(new LookupValue
                    {
                        Id = Guid.NewGuid(),
                        LookupTypeId = statusType.Id,
                        TypeCode = "CASE_STATUS",
                        Value = "WaitingOnCustomer",
                        Label = "Waiting on Customer",
                        DisplayOrder = 3,
                        IsActive = true,
                        CreatedAt = now
                    });
                    context.SaveChanges();
                }
            }

            // 3. Update existing cases to have realistic channels and status distribution if needed
            var cases = context.Cases.OrderBy(c => c.CreatedAt).ToList();
            if (cases.Count > 0)
            {
                foreach (var c in cases)
                {
                    if (c.CaseNumber == "C-00001")
                    {
                        c.SourceChannel = "Voice";
                        c.PreferredCommunicationChannel = "Phone";
                        c.CommunicationChannel = "Voice";
                    }
                    else if (c.CaseNumber == "C-00001-R01")
                    {
                        c.SourceChannel = "WhatsApp";
                        c.PreferredCommunicationChannel = "Phone";
                        c.CommunicationChannel = "WhatsApp";
                    }
                    else if (c.CaseNumber == "C-00001-L01")
                    {
                        c.SourceChannel = "Email";
                        c.PreferredCommunicationChannel = "Email";
                        c.CommunicationChannel = "Email";
                        c.Status = CaseStatus.Escalated;
                        c.Severity = "High";
                    }
                    else if (c.CaseNumber == "S-00003")
                    {
                        c.SourceChannel = "Branch";
                        c.PreferredCommunicationChannel = "SMS";
                        c.CommunicationChannel = "Branch";
                    }
                    else if (c.CaseNumber == "I-00002")
                    {
                        c.SourceChannel = "Web Chat";
                        c.PreferredCommunicationChannel = "Email";
                        c.CommunicationChannel = "Web Chat";
                        c.Status = CaseStatus.WaitingOnCustomer;
                        c.SlaPausedAt ??= now.AddHours(-1);
                    }
                    else
                    {
                        if (string.IsNullOrWhiteSpace(c.SourceChannel)) c.SourceChannel = c.CommunicationChannel ?? "Voice";
                        if (string.IsNullOrWhiteSpace(c.PreferredCommunicationChannel)) c.PreferredCommunicationChannel = "Phone";
                        c.CommunicationChannel = c.SourceChannel;
                    }
                }

                // Ensure at least one Critical priority case exists
                if (!cases.Any(c => c.Severity == "Critical") && cases.Count > 0)
                {
                    cases[0].Severity = "Critical";
                }

                context.SaveChanges();
            }

            // 4. Ensure FieldConfigurations for CreateCase has both SourceChannel and PreferredCommunicationChannel
            var existingCreateCaseFields = context.FieldConfigurations.Where(f => f.ModuleKey == "CaseManagement" && f.SectionKey == "CreateCase").ToList();
            if (existingCreateCaseFields.Count > 0)
            {
                var prefCommField = existingCreateCaseFields.FirstOrDefault(f => f.ApiField == "communicationChannel");
                if (prefCommField != null)
                {
                    prefCommField.ApiField = "preferredCommunicationChannel";
                    prefCommField.DisplayLabel = "Preferred Communication Channel";
                }

                if (!existingCreateCaseFields.Any(f => f.ApiField == "sourceChannel"))
                {
                    context.FieldConfigurations.Add(new FieldConfiguration
                    {
                        Id = Guid.NewGuid(),
                        ModuleKey = "CaseManagement",
                        SectionKey = "CreateCase",
                        ApiField = "sourceChannel",
                        DisplayLabel = "Source Channel",
                        IsVisible = true,
                        IsRequired = true,
                        IsEditable = true,
                        IsSensitive = false,
                        MaskingRule = "None",
                        VisibleChars = 4,
                        DisplayOrder = 9,
                        FieldType = "Dropdown",
                        LookupTypeCode = "COMMUNICATION_CHANNEL",
                        CreatedAt = now
                    });
                }
                context.SaveChanges();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EnsureCaseChannelsAndStatuses Error] {ex.Message}");
        }
    }
}
