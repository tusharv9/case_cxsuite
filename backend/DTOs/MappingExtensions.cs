namespace CaseManagement.Api.DTOs;

using CaseManagement.Api.Models;
using System.Linq;

public static class MappingExtensions
{
    public static IQueryable<CaseSummaryDto> MapToCaseSummary(this IQueryable<Case> query)
    {
        return query.Select(c => new CaseSummaryDto
        {
            Id = c.Id,
            CaseNumber = c.CaseNumber.StartsWith("S-") ? c.CaseNumber : (c.CaseNumber.StartsWith("I-") || c.CaseNumber.StartsWith("E-") ? (c.CaseNumber.StartsWith("E-") ? c.CaseNumber.Replace("E-", "I-") : c.CaseNumber) : c.CaseNumber),
            Title = c.Title,
            Status = c.Status.ToString(),
            Severity = c.Severity,
            SlaStartTime = c.SlaStartTime,
            SlaTargetHours = c.SlaTargetHours,
            ResolvedAt = c.ResolvedAt,
            SlaPausedAt = c.SlaPausedAt,
            SlaTotalPausedMinutes = c.SlaTotalPausedMinutes,
            DepartmentId = c.DepartmentId,
            DepartmentName = c.Department != null ? c.Department.Name : string.Empty,
            OwnerId = c.OwnerId,
            OwnerName = c.Owner != null ? c.Owner.Name : string.Empty,
            OwnerRole = c.Owner != null ? c.Owner.Role : null,
            OwnerTeam = c.Owner != null ? c.Owner.Team : null,
            OwnerQueue = c.Owner != null ? c.Owner.Queue : null,
            CreatedAt = c.CreatedAt,
            CustomerId = c.CustomerId,
            CustomerName = c.Customer != null ? c.Customer.FullName : string.Empty,
            CaseType = string.IsNullOrEmpty(c.CaseType) ? (c.CaseNumber.StartsWith("S-") ? "Service" : ((c.CaseNumber.StartsWith("I-") || c.CaseNumber.StartsWith("E-")) ? "Inquiry" : "Complaint")) : c.CaseType,
            Subcategory = c.Subcategory ?? "General Inquiry",
            PreferredLanguage = c.Customer != null ? c.Customer.PreferredLanguage : "Bahasa Malaysia",
            SourceChannel = c.SourceChannel ?? c.CommunicationChannel ?? "Voice",
            PreferredCommunicationChannel = c.PreferredCommunicationChannel ?? "Phone",
            CommunicationChannel = c.SourceChannel ?? c.CommunicationChannel ?? "Voice",
            ParentCaseId = c.ParentCaseId,
            ParentCaseNumber = c.ParentCase != null ? c.ParentCase.CaseNumber : null,
            SubcaseType = c.SubcaseType ?? "Original",
            FirstResponseTargetMinutes = c.FirstResponseTargetMinutes,
            FirstResponseDueAt = c.FirstResponseDueAt,
            FirstResponseActualAt = c.FirstResponseActualAt,
            FirstResponseStatus = c.FirstResponseStatus,
            EscalationLevel = c.EscalationLevel,
            ChildRelations = c.ChildRelations.Select(cr => new CaseChildRelationDto
            {
                ChildId = cr.ChildId,
                RelationType = cr.RelationType.ToString(),
                LinkedCaseNumber = cr.LinkedCase != null ? cr.LinkedCase.CaseNumber : null,
                LinkedCaseTitle = cr.LinkedCase != null ? cr.LinkedCase.Title : null,
                Reason = cr.Reason,
                CreatedByName = cr.CreatedByUser != null ? cr.CreatedByUser.Name : string.Empty,
                CreatedAt = cr.CreatedAt
            }).ToList()
        });
    }

    public static IQueryable<CaseDetailDto> MapToCaseDetail(this IQueryable<Case> query)
    {
        return query.Select(c => new CaseDetailDto
        {
            Id = c.Id,
            CaseNumber = c.CaseNumber.StartsWith("S-") ? c.CaseNumber : (c.CaseNumber.StartsWith("I-") || c.CaseNumber.StartsWith("E-") ? (c.CaseNumber.StartsWith("E-") ? c.CaseNumber.Replace("E-", "I-") : c.CaseNumber) : c.CaseNumber),
            Title = c.Title,
            Status = c.Status.ToString(),
            Severity = c.Severity,
            SlaStartTime = c.SlaStartTime,
            SlaTargetHours = c.SlaTargetHours,
            ResolvedAt = c.ResolvedAt,
            SlaPausedAt = c.SlaPausedAt,
            SlaTotalPausedMinutes = c.SlaTotalPausedMinutes,
            DepartmentId = c.DepartmentId,
            DepartmentName = c.Department != null ? c.Department.Name : string.Empty,
            OwnerId = c.OwnerId,
            OwnerName = c.Owner != null ? c.Owner.Name : string.Empty,
            OwnerRole = c.Owner != null ? c.Owner.Role : null,
            OwnerTeam = c.Owner != null ? c.Owner.Team : null,
            OwnerQueue = c.Owner != null ? c.Owner.Queue : null,
            CreatedAt = c.CreatedAt,
            CustomerId = c.CustomerId,
            CustomerName = c.Customer != null ? c.Customer.FullName : string.Empty,
            CaseType = string.IsNullOrEmpty(c.CaseType) ? (c.CaseNumber.StartsWith("S-") ? "Service" : ((c.CaseNumber.StartsWith("I-") || c.CaseNumber.StartsWith("E-")) ? "Inquiry" : "Complaint")) : c.CaseType,
            Subcategory = c.Subcategory ?? "General Inquiry",
            PreferredLanguage = c.Customer != null ? c.Customer.PreferredLanguage : "Bahasa Malaysia",
            SourceChannel = c.SourceChannel ?? c.CommunicationChannel ?? "Voice",
            PreferredCommunicationChannel = c.PreferredCommunicationChannel ?? "Phone",
            CommunicationChannel = c.SourceChannel ?? c.CommunicationChannel ?? "Voice",
            ParentCaseId = c.ParentCaseId,
            ParentCaseNumber = c.ParentCase != null ? c.ParentCase.CaseNumber : null,
            SubcaseType = c.SubcaseType ?? "Original",
            FirstResponseTargetMinutes = c.FirstResponseTargetMinutes,
            FirstResponseDueAt = c.FirstResponseDueAt,
            FirstResponseActualAt = c.FirstResponseActualAt,
            FirstResponseStatus = c.FirstResponseStatus,
            EscalationLevel = c.EscalationLevel,
            Description = c.Description,
            Disposition = c.Disposition,
            ResolutionNote = c.ResolutionNote,
            Customer = c.Customer != null ? new CustomerSummaryDto
            {
                Id = c.Customer.Id,
                FullName = c.Customer.FullName,
                NRIC = c.Customer.NRIC,
                PhoneNumber = c.Customer.PhoneNumber,
                DateOfBirth = c.Customer.DateOfBirth,
                OpenCasesCount = c.Customer.Cases.Count(x => x.Status != CaseStatus.Resolved && x.Status != CaseStatus.Closed && x.Status != CaseStatus.Cancelled),
                TotalCasesCount = c.Customer.Cases.Count()
            } : null!,
            Events = c.Events
                .OrderByDescending(e => e.CreatedAt)
                .Take(50)
                .Select(e => new CaseEventDto
                {
                    Id = e.Id,
                    UserId = e.UserId,
                    EventType = e.EventType.ToString(),
                    Message = e.Message,
                    CreatedAt = e.CreatedAt,
                    UserName = e.User != null ? e.User.Name : string.Empty,
                    IsInternal = e.IsInternal,
                    Channel = e.Channel
                }).ToList(),
            Participants = c.Participants.Select(p => new ParticipantDto
            {
                UserId = p.UserId,
                UserName = p.User != null ? p.User.Name : string.Empty,
                Role = p.Role.ToString()
            }).ToList(),
            Attachments = c.Attachments.Select(a => new CaseAttachmentDto
            {
                Id = a.Id,
                CaseId = a.CaseId,
                FileName = a.FileName,
                FileType = a.FileType,
                FileSizeBytes = a.FileSizeBytes,
                Note = a.Note,
                UploadedByUserId = a.UploadedByUserId,
                UploadedByUserName = a.UploadedByUser != null ? a.UploadedByUser.Name : string.Empty,
                CreatedAt = a.CreatedAt
            }).ToList(),
            LinkedCases = c.LinkedCases.Select(l => new LinkedCaseDto
            {
                TargetCaseId = l.TargetCaseId,
                TargetCaseNumber = l.TargetCase != null ? l.TargetCase.CaseNumber : string.Empty,
                TargetCaseTitle = l.TargetCase != null ? l.TargetCase.Title : string.Empty
            }).ToList(),
            ChildRelations = c.ChildRelations.Select(cr => new CaseChildRelationDto
            {
                ChildId = cr.ChildId,
                RelationType = cr.RelationType.ToString(),
                LinkedCaseNumber = cr.LinkedCase != null ? cr.LinkedCase.CaseNumber : null,
                LinkedCaseTitle = cr.LinkedCase != null ? cr.LinkedCase.Title : null,
                Reason = cr.Reason,
                CreatedByName = cr.CreatedByUser != null ? cr.CreatedByUser.Name : string.Empty,
                CreatedAt = cr.CreatedAt
            }).ToList(),
            Subcases = c.Subcases.Select(sc => new CaseSummaryDto
            {
                Id = sc.Id,
                CaseNumber = sc.CaseNumber,
                Title = sc.Title,
                Status = sc.Status.ToString(),
                Severity = sc.Severity,
                SlaStartTime = sc.SlaStartTime,
                SlaTargetHours = sc.SlaTargetHours,
                ResolvedAt = sc.ResolvedAt,
                DepartmentId = sc.DepartmentId,
                DepartmentName = sc.Department != null ? sc.Department.Name : string.Empty,
                OwnerId = sc.OwnerId,
                OwnerName = sc.Owner != null ? sc.Owner.Name : string.Empty,
                OwnerRole = sc.Owner != null ? sc.Owner.Role : null,
                OwnerTeam = sc.Owner != null ? sc.Owner.Team : null,
                OwnerQueue = sc.Owner != null ? sc.Owner.Queue : null,
                CreatedAt = sc.CreatedAt,
                CustomerId = sc.CustomerId,
                CustomerName = sc.Customer != null ? sc.Customer.FullName : string.Empty,
                CaseType = sc.CaseType,
                ParentCaseId = sc.ParentCaseId,
                ParentCaseNumber = c.CaseNumber,
                SubcaseType = sc.SubcaseType
            }).ToList()
        });
    }

    public static IQueryable<CustomerDetailDto> MapToCustomerDetail(this IQueryable<Customer> query)
    {
        return query.Select(c => new CustomerDetailDto
        {
            Id = c.Id,
            FullName = c.FullName,
            NRIC = c.NRIC,
            PhoneNumber = c.PhoneNumber,
            Email = c.Email,
            Branch = c.Branch,
            TenureMonths = c.TenureMonths,
            CustomerSegment = c.CustomerSegment,
            PreferredLanguage = c.PreferredLanguage ?? "Bahasa Malaysia",
            DateOfBirth = c.DateOfBirth,
            OpenCasesCount = c.Cases.Count(x => x.Status != CaseStatus.Resolved && x.Status != CaseStatus.Closed && x.Status != CaseStatus.Cancelled),
            TotalCasesCount = c.Cases.Count(),
            CustomAttributes = c.CustomAttributes.Select(ca => new CustomerCustomAttributeDto
            {
                FieldKey = ca.FieldKey,
                FieldValue = ca.FieldValue
            }).ToList(),
            // Newest first, matching how cases are ordered everywhere else in the UI. Customer 360
            // renders this list directly rather than re-fetching and re-sorting the whole board.
            Cases = c.Cases.OrderByDescending(caseItem => caseItem.CreatedAt).Select(caseItem => new CaseSummaryDto
            {
                Id = caseItem.Id,
                CaseNumber = caseItem.CaseNumber.StartsWith("S-") ? caseItem.CaseNumber : (caseItem.CaseNumber.StartsWith("I-") || caseItem.CaseNumber.StartsWith("E-") ? (caseItem.CaseNumber.StartsWith("E-") ? caseItem.CaseNumber.Replace("E-", "I-") : caseItem.CaseNumber) : caseItem.CaseNumber),
                Title = caseItem.Title,
                Status = caseItem.Status.ToString(),
                Severity = caseItem.Severity,
                SlaStartTime = caseItem.SlaStartTime,
                SlaTargetHours = caseItem.SlaTargetHours,
                ResolvedAt = caseItem.ResolvedAt,
                DepartmentId = caseItem.DepartmentId,
                DepartmentName = caseItem.Department != null ? caseItem.Department.Name : string.Empty,
                OwnerId = caseItem.OwnerId,
                OwnerName = caseItem.Owner != null ? caseItem.Owner.Name : string.Empty,
                CreatedAt = caseItem.CreatedAt,
                CustomerId = caseItem.CustomerId,
                CustomerName = caseItem.Customer != null ? caseItem.Customer.FullName : string.Empty,
                CaseType = string.IsNullOrEmpty(caseItem.CaseType) ? (caseItem.CaseNumber.StartsWith("S-") ? "Service" : ((caseItem.CaseNumber.StartsWith("I-") || caseItem.CaseNumber.StartsWith("E-")) ? "Inquiry" : "Complaint")) : caseItem.CaseType,
                SlaPausedAt = caseItem.SlaPausedAt,
                SlaTotalPausedMinutes = caseItem.SlaTotalPausedMinutes,
                Subcategory = caseItem.Subcategory ?? "General Inquiry",
                PreferredLanguage = caseItem.Customer != null ? caseItem.Customer.PreferredLanguage : "Bahasa Malaysia",
                SourceChannel = caseItem.SourceChannel ?? caseItem.CommunicationChannel ?? "Voice",
                PreferredCommunicationChannel = caseItem.PreferredCommunicationChannel ?? "Phone",
                CommunicationChannel = caseItem.SourceChannel ?? caseItem.CommunicationChannel ?? "Voice",
                ChildRelations = caseItem.ChildRelations.Select(cr => new CaseChildRelationDto
                {
                    ChildId = cr.ChildId,
                    RelationType = cr.RelationType.ToString(),
                    LinkedCaseNumber = cr.LinkedCase != null ? cr.LinkedCase.CaseNumber : null,
                    LinkedCaseTitle = cr.LinkedCase != null ? cr.LinkedCase.Title : null,
                    Reason = cr.Reason,
                    CreatedByName = cr.CreatedByUser != null ? cr.CreatedByUser.Name : string.Empty,
                    CreatedAt = cr.CreatedAt
                }).ToList()
            }).ToList()
        });
    }

    public static IQueryable<UserDto> MapToUserDto(this IQueryable<User> query)
    {
        return query.Select(u => new UserDto
        {
            Id = u.Id,
            Name = u.Name,
            Email = u.Email,
            Role = u.Role,
            Status = u.Status.ToString(),
            DepartmentId = u.DepartmentId,
            DepartmentName = u.Department != null ? u.Department.Name : string.Empty,
            Team = u.Team,
            Queue = u.Queue
        });
    }


    public static IQueryable<DepartmentDto> MapToDepartmentDto(this IQueryable<Department> query)
    {
        return query.Select(d => new DepartmentDto
        {
            Id = d.Id,
            Name = d.Name,
            Code = d.Code,
            OwnerId = d.OwnerId,
            OwnerName = d.Owner != null ? d.Owner.Name : string.Empty,
            IsActive = d.IsActive
        });
    }
}
