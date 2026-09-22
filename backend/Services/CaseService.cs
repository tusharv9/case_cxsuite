namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Repositories;
using CaseManagement.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;

public class CaseService : ICaseService
{
    private readonly ICaseRepository _caseRepository;
    private readonly INotificationService _notificationService;
    private readonly IConfigurableSettingsService _settingsService;
    private readonly AppDbContext _context;
    private readonly IWebHostEnvironment _env;

    public CaseService(
        ICaseRepository caseRepository,
        INotificationService notificationService,
        IConfigurableSettingsService settingsService,
        AppDbContext context,
        IWebHostEnvironment env)
    {
        _caseRepository = caseRepository;
        _notificationService = notificationService;
        _settingsService = settingsService;
        _context = context;
        _env = env;
    }

    public async Task<Case> CreateCaseAsync(CreateCaseDto dto, Guid createdByUserId)
    {
        var severity = await ResolveSeverityAsync(dto.Severity);

        string caseTypeInput = dto.CaseType?.Trim() ?? "";
        string prefix = "C-";
        string canonicalCaseType = string.IsNullOrWhiteSpace(caseTypeInput) ? "Complaint" : caseTypeInput;

        try
        {
            var caseTypes = await _settingsService.GetCaseTypesAsync();
            var matchedConfig = caseTypes.FirstOrDefault(c =>
                c.Code.Equals(caseTypeInput, StringComparison.OrdinalIgnoreCase) ||
                c.Name.Equals(caseTypeInput, StringComparison.OrdinalIgnoreCase));

            if (matchedConfig != null)
            {
                prefix = matchedConfig.Prefix;
                canonicalCaseType = matchedConfig.Name;
            }
            else
            {
                if (caseTypeInput.Equals("Service", StringComparison.OrdinalIgnoreCase))
                {
                    prefix = "S-";
                    canonicalCaseType = "Service";
                }
                else if (caseTypeInput.Equals("Enquiry", StringComparison.OrdinalIgnoreCase) || caseTypeInput.Equals("Inquiry", StringComparison.OrdinalIgnoreCase))
                {
                    prefix = "I-";
                    canonicalCaseType = "Inquiry";
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CaseService CaseTypeLookup Error] {ex.Message}");
        }

        int seq = await _caseRepository.GetNextCaseSequenceAsync();
        string caseNumber = $"{prefix}{seq:D5}";

        int slaTargetHours = await GetSlaTargetHoursAsync(severity);

        string sourceChannel = !string.IsNullOrWhiteSpace(dto.SourceChannel)
            ? dto.SourceChannel
            : (!string.IsNullOrWhiteSpace(dto.CommunicationChannel) ? dto.CommunicationChannel : "Voice");

        string preferredChannel = !string.IsNullOrWhiteSpace(dto.PreferredCommunicationChannel)
            ? dto.PreferredCommunicationChannel
            : "Phone";

        var newCase = new Case
        {
            CaseNumber = caseNumber,
            CaseType = canonicalCaseType,
            Title = dto.Title,
            Description = dto.Description,
            CustomerId = dto.CustomerId,
            DepartmentId = dto.DepartmentId,
            OwnerId = createdByUserId,
            Severity = severity,
            Status = CaseStatus.Open,
            SourceChannel = sourceChannel,
            PreferredCommunicationChannel = preferredChannel,
            CommunicationChannel = sourceChannel,
            Subcategory = string.IsNullOrWhiteSpace(dto.Subcategory) ? "General Inquiry" : dto.Subcategory,
            SlaStartTime = DateTime.UtcNow,
            SlaTargetHours = slaTargetHours,
            SlaTotalPausedMinutes = 0,
            SlaPausedAt = null,
        };

        await _caseRepository.AddAsync(newCase);

        var caseEvent = new CaseEvent
        {
            CaseId = newCase.Id,
            EventType = EventType.Create,
            Message = $"Case opened ({canonicalCaseType}).",
            CreatedAt = DateTime.UtcNow,
            UserId = createdByUserId
        };
        await _caseRepository.AddEventAsync(caseEvent);

        try
        {
            await _notificationService.CreateNotificationAsync(
                newCase.OwnerId,
                "CASE_ASSIGNED",
                "New Case Assigned",
                $"Case {newCase.CaseNumber} ({newCase.Title}) has been created and assigned to you.",
                newCase.Id,
                newCase.CaseNumber
            );
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Notification Trigger Error] {ex.Message}");
        }

        return newCase;
    }

    public async Task<CaseDetailDto?> GetCaseDetailsAsync(Guid caseId, CancellationToken ct = default)
    {
        return await _caseRepository.GetCaseDetailAsync(caseId, ct);
    }

    public async Task<IEnumerable<SearchCaseHitDto>> SearchCasesAsync(string query, int limit, CancellationToken ct = default)
    {
        return await _caseRepository.SearchCasesAsync(query, limit, ct);
    }

    public async Task<IEnumerable<CaseSummaryDto>> GetBoardCasesAsync(Guid? departmentId = null, string? caseType = null, CancellationToken ct = default)
    {
        return await _caseRepository.GetBoardCasesAsync(departmentId, caseType, ct);
    }

    public async Task UpdateCaseStatusAsync(Guid caseId, UpdateCaseStatusDto dto)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");

        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Cannot update status of a resolved case.");

        string rawStatus = dto.Status?.Trim() ?? "";
        CaseStatus newStatus;
        if (string.Equals(rawStatus, "Waiting on Customer", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(rawStatus, "WaitingOnCustomer", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(rawStatus, "Waiting_On_Customer", StringComparison.OrdinalIgnoreCase))
        {
            newStatus = CaseStatus.WaitingOnCustomer;
        }
        else if (string.Equals(rawStatus, "In Progress", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(rawStatus, "InProgress", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(rawStatus, "In_Progress", StringComparison.OrdinalIgnoreCase))
        {
            newStatus = CaseStatus.InProgress;
        }
        else
        {
            newStatus = Enum.Parse<CaseStatus>(rawStatus, true);
        }
        
        if (existingCase.Status == newStatus)
            throw new InvalidOperationException($"Case is already in '{newStatus}' status.");

        var oldStatus = existingCase.Status;

        // SLA Pause / Resumption Logic
        if (newStatus == CaseStatus.WaitingOnCustomer)
        {
            // Pause SLA clock
            existingCase.SlaPausedAt = DateTime.UtcNow;
        }
        else if (oldStatus == CaseStatus.WaitingOnCustomer)
        {
            // Resume SLA clock: accumulate elapsed paused minutes
            if (existingCase.SlaPausedAt.HasValue)
            {
                var pausedMinutes = (int)Math.Max(0, Math.Round((DateTime.UtcNow - existingCase.SlaPausedAt.Value).TotalMinutes));
                existingCase.SlaTotalPausedMinutes += pausedMinutes;
                existingCase.SlaPausedAt = null;
            }
        }

        existingCase.Status = newStatus;
        
        if (newStatus == CaseStatus.Resolved)
        {
            existingCase.ResolvedAt = DateTime.UtcNow;
            if (existingCase.SlaPausedAt.HasValue)
            {
                var pausedMinutes = (int)Math.Max(0, Math.Round((DateTime.UtcNow - existingCase.SlaPausedAt.Value).TotalMinutes));
                existingCase.SlaTotalPausedMinutes += pausedMinutes;
                existingCase.SlaPausedAt = null;
            }
        }

        await _caseRepository.UpdateAsync(existingCase);

        var eventType = newStatus switch
        {
            CaseStatus.Resolved => EventType.Resolve,
            CaseStatus.Escalated => EventType.Escalate,
            _ => EventType.Note
        };

        var statusLabel = newStatus == CaseStatus.WaitingOnCustomer ? "Waiting on Customer" : (newStatus == CaseStatus.InProgress ? "In Progress" : newStatus.ToString());
        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = eventType,
            Message = dto.Note ?? $"Status changed to {statusLabel}",
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };
        await _caseRepository.AddEventAsync(caseEvent);

        try
        {
            await _notificationService.CreateNotificationAsync(
                existingCase.OwnerId,
                newStatus == CaseStatus.Resolved ? "CASE_RESOLVED" : "CASE_STATUS_CHANGED",
                newStatus == CaseStatus.Resolved ? "Case Resolved" : "Case Status Updated",
                $"Case {existingCase.CaseNumber} status changed to {newStatus}. {(dto.Note != null ? dto.Note : "")}".Trim(),
                existingCase.Id,
                existingCase.CaseNumber
            );
        }
        catch (Exception ex) { Console.WriteLine($"[Notification Trigger Error] {ex.Message}"); }
    }

    public async Task AssignCaseAsync(Guid caseId, AssignCaseDto dto)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Cannot assign a resolved case.");

        if (existingCase.OwnerId == dto.OwnerId)
            throw new InvalidOperationException($"{existingCase.Owner?.Name ?? "The current owner"} is already handling this case.");

        existingCase.OwnerId = dto.OwnerId;
        existingCase.SlaTargetHours = await GetSlaTargetHoursAsync(existingCase.Severity);
        
        // Reset SLA timer
        existingCase.SlaStartTime = DateTime.UtcNow;
        
        await _caseRepository.UpdateAsync(existingCase);

        var newOwner = await _context.Users.FindAsync(dto.OwnerId);
        var ownerName = newOwner?.Name ?? "new agent";
        var reasonText = !string.IsNullOrWhiteSpace(dto.Reason) ? $" Reason: {dto.Reason}." : "";

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Assign,
            Message = $"Reassigned to {ownerName}.{reasonText}",
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };
        await _caseRepository.AddEventAsync(caseEvent);

        try
        {
            await _notificationService.CreateNotificationAsync(
                dto.OwnerId,
                "CASE_REASSIGNED",
                "Case Reassigned",
                $"Case {existingCase.CaseNumber} ({existingCase.Title}) has been assigned to you.",
                existingCase.Id,
                existingCase.CaseNumber
            );
        }
        catch (Exception ex) { Console.WriteLine($"[Notification Trigger Error] {ex.Message}"); }
    }

    public async Task AddNoteAsync(Guid caseId, AddNoteDto dto)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Note,
            Message = dto.Message,
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };
        await _caseRepository.AddEventAsync(caseEvent);

        try
        {
            await _notificationService.CreateNotificationAsync(
                existingCase.OwnerId,
                "CASE_NOTE_ADDED",
                "Note Added to Case",
                $"Note added to Case {existingCase.CaseNumber}: {dto.Message}",
                existingCase.Id,
                existingCase.CaseNumber
            );
        }
        catch (Exception ex) { Console.WriteLine($"[Notification Trigger Error] {ex.Message}"); }
    }

    public async Task AddCoworkersAsync(Guid caseId, List<Guid> coworkerUserIds, Guid addedByUserId)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Cannot add coworkers to a resolved case.");

        foreach (var coworkerUserId in coworkerUserIds)
        {
            if (existingCase.Participants.Any(p => p.UserId == coworkerUserId && p.Role == ParticipantRole.CoWorker))
                throw new InvalidOperationException("One or more users are already coworkers on this case.");

            var participant = new CaseParticipant
            {
                CaseId = caseId,
                UserId = coworkerUserId,
                Role = ParticipantRole.CoWorker
            };
            await _caseRepository.AddParticipantAsync(participant);
        }

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Cowork,
            Message = $"Added {coworkerUserIds.Count} Co-worker(s)",
            CreatedAt = DateTime.UtcNow,
            UserId = addedByUserId
        };
        await _caseRepository.AddEventAsync(caseEvent);
    }

    public async Task RemoveCoworkerAsync(Guid caseId, Guid coworkerUserId, Guid removedByUserId)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Cannot remove coworkers from a resolved case.");

        await _caseRepository.RemoveParticipantAsync(caseId, coworkerUserId);

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Cowork,
            Message = "Removed Co-worker",
            CreatedAt = DateTime.UtcNow,
            UserId = removedByUserId
        };
        await _caseRepository.AddEventAsync(caseEvent);
    }

    public async Task TransferDepartmentAsync(Guid caseId, TransferDepartmentDto dto, Guid transferredByUserId)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Cannot transfer a resolved case.");

        if (dto.DepartmentId != Guid.Empty && dto.DepartmentId != existingCase.DepartmentId)
        {
            existingCase.DepartmentId = dto.DepartmentId;
            var newOwnerId = await _caseRepository.GetDepartmentOwnerAsync(dto.DepartmentId);
            if (newOwnerId.HasValue)
            {
                existingCase.OwnerId = newOwnerId.Value;
            }
        }

        // SLA TARGETS DO NOT RESET: Transfer keeps SLA clock running continuously without interruption
        await _caseRepository.UpdateAsync(existingCase);

        var targetDesc = !string.IsNullOrWhiteSpace(dto.TargetQueue)
            ? dto.TargetQueue
            : (!string.IsNullOrWhiteSpace(dto.TransferTo) ? dto.TransferTo : "new department");
        var reasonDesc = !string.IsNullOrWhiteSpace(dto.Reason) ? $" Reason: {dto.Reason}." : "";
        var noteDesc = !string.IsNullOrWhiteSpace(dto.HandoverNote) ? $" Note: {dto.HandoverNote}" : "";

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Transfer,
            Message = $"Transferred to {targetDesc}.{reasonDesc}{noteDesc}",
            CreatedAt = DateTime.UtcNow,
            UserId = transferredByUserId
        };
        await _caseRepository.AddEventAsync(caseEvent);
    }

    public async Task<LinkCaseResultDto> LinkCaseAsync(Guid caseId, LinkCaseDto dto)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        var targetCase = await _caseRepository.GetByCaseNumberAsync(dto.TargetCaseNumber);
        if (targetCase == null) throw new ArgumentException("Target case not found");

        if (existingCase.CaseNumber.Equals(dto.TargetCaseNumber, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Cannot link a case to itself.");

        if (existingCase.LinkedCases.Any(lc => lc.TargetCaseId == targetCase.Id) ||
            existingCase.ChildRelations.Any(cr => cr.LinkedCaseId == targetCase.Id || (cr.ChildId != null && cr.ChildId.ToLower() == targetCase.CaseNumber.ToLower())))
        {
            throw new InvalidOperationException($"Case is already linked to {targetCase.CaseNumber}.");
        }

        // 1. Generate Sub-Case ID (e.g. C-00045-L01)
        int seq = await _caseRepository.GetNextChildSequenceAsync(caseId, ChildRelationType.Link);
        string childId = $"{existingCase.CaseNumber}-L{seq:D2}";

        // 2. Create and Save NEW Child Subcase Record in Cases Table
        var newLinkSubcase = new Case
        {
            Id = Guid.NewGuid(),
            CaseNumber = childId,
            CaseType = existingCase.CaseType,
            Title = $"[Linked Subcase] {existingCase.Title}",
            Description = $"Linked Subcase under Parent Case {existingCase.CaseNumber} referencing Case {targetCase.CaseNumber}. Reason: {dto.RelationshipType}",
            Status = CaseStatus.Open,
            Severity = existingCase.Severity,
            SlaStartTime = DateTime.UtcNow,
            SlaTargetHours = await GetSlaTargetHoursAsync(existingCase.Severity),
            DepartmentId = existingCase.DepartmentId,
            CustomerId = existingCase.CustomerId,
            OwnerId = existingCase.OwnerId,
            ParentCaseId = existingCase.Id,
            LinkedSourceCaseId = targetCase.Id,
            SubcaseType = "LinkedSubcase",
            CreatedAt = DateTime.UtcNow
        };
        await _caseRepository.AddAsync(newLinkSubcase);

        // 3. Save Sub-Case Relationship Entity
        var childRel = new CaseChildRelation
        {
            ChildId = childId,
            ParentCaseId = caseId,
            RelationType = ChildRelationType.Link,
            LinkedCaseId = targetCase.Id,
            Reason = !string.IsNullOrWhiteSpace(dto.RelationshipType) ? dto.RelationshipType : "Linked Case",
            CreatedByUserId = dto.UserId
        };
        await _caseRepository.AddChildRelationAsync(childRel);

        // 4. Save Legacy LinkedCase Record
        var linkedCase = new LinkedCase
        {
            CaseId = caseId,
            TargetCaseId = targetCase.Id
        };
        await _caseRepository.AddLinkedCaseAsync(linkedCase);
        
        // 5. Record Audit Event
        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Note,
            Message = $"Linked case {targetCase.CaseNumber} (Sub-Case ID: {childId}, Reason: {dto.RelationshipType})",
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };
        await _caseRepository.AddEventAsync(caseEvent);

        try
        {
            await _notificationService.CreateNotificationAsync(
                existingCase.OwnerId,
                "SUBCASE_CREATED",
                "New Subcase Linked",
                $"Subcase {childId} linked to Case {existingCase.CaseNumber}.",
                newLinkSubcase.Id,
                childId
            );
        }
        catch (Exception ex) { Console.WriteLine($"[Notification Trigger Error] {ex.Message}"); }

        return new LinkCaseResultDto
        {
            Message = "Case linked successfully.",
            ChildId = childId,
            NewCaseId = newLinkSubcase.Id,
            LinkedCaseNumber = targetCase.CaseNumber
        };
    }

    public async Task UnlinkCaseAsync(Guid caseId, UnlinkCaseDto dto)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        var targetCase = await _caseRepository.GetByCaseNumberAsync(dto.TargetCaseNumber);
        Guid? targetCaseId = targetCase?.Id;
        string targetCaseNumber = dto.TargetCaseNumber;

        if (!targetCaseId.HasValue && existingCase.ChildRelations != null)
        {
            var matchingChildRel = existingCase.ChildRelations.FirstOrDefault(cr =>
                cr.RelationType == ChildRelationType.Link &&
                (cr.ChildId.Equals(dto.TargetCaseNumber, StringComparison.OrdinalIgnoreCase) ||
                 (cr.LinkedCase != null && cr.LinkedCase.CaseNumber.Equals(dto.TargetCaseNumber, StringComparison.OrdinalIgnoreCase))));

            if (matchingChildRel?.LinkedCaseId != null)
            {
                targetCaseId = matchingChildRel.LinkedCaseId.Value;
                if (matchingChildRel.LinkedCase != null)
                {
                    targetCaseNumber = matchingChildRel.LinkedCase.CaseNumber;
                }
            }
        }

        if (targetCaseId.HasValue)
        {
            await _caseRepository.RemoveLinkedCaseAsync(caseId, targetCaseId.Value);
        }
        else
        {
            // Remove by ChildId if matched
            var relationsToRemove = await _context.Set<CaseChildRelation>()
                .Where(cr => (cr.ParentCaseId == caseId || cr.LinkedCaseId == caseId) &&
                             cr.RelationType == ChildRelationType.Link &&
                             cr.ChildId == dto.TargetCaseNumber)
                .ToListAsync();

            if (relationsToRemove.Any())
            {
                _context.Set<CaseChildRelation>().RemoveRange(relationsToRemove);
                await _context.SaveChangesAsync();
            }
        }

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Note,
            Message = $"Unlinked from case {targetCaseNumber}",
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };
        await _caseRepository.AddEventAsync(caseEvent);
    }

    public async Task<List<RelatedCustomerCaseDto>> GetRelatedCustomerCasesAsync(Guid caseId)
    {
        var existingCase = await _context.Cases
            .Include(c => c.LinkedCases)
            .Include(c => c.ChildRelations)
            .FirstOrDefaultAsync(c => c.Id == caseId);

        if (existingCase == null) return new List<RelatedCustomerCaseDto>();

        var customerCases = await _context.Cases
            .Where(c => c.CustomerId == existingCase.CustomerId && c.Id != caseId)
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();

        var linkedTargetIds = existingCase.LinkedCases.Select(lc => lc.TargetCaseId)
            .Concat(existingCase.ChildRelations.Where(cr => cr.LinkedCaseId.HasValue).Select(cr => cr.LinkedCaseId!.Value))
            .ToHashSet();

        return customerCases.Select(c => new RelatedCustomerCaseDto(
            c.Id,
            c.CaseNumber,
            c.CaseType,
            c.Title,
            c.Status.ToString(),
            c.Severity,
            c.CreatedAt,
            linkedTargetIds.Contains(c.Id)
        )).ToList();
    }

    public async Task ResolveCaseAsync(Guid caseId, ResolveCaseDto dto)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Case is already resolved.");
            
        if (existingCase.Status == CaseStatus.WaitingOnCustomer && existingCase.SlaPausedAt.HasValue)
        {
            var pausedMinutes = (int)Math.Max(0, Math.Round((DateTime.UtcNow - existingCase.SlaPausedAt.Value).TotalMinutes));
            existingCase.SlaTotalPausedMinutes += pausedMinutes;
            existingCase.SlaPausedAt = null;
        }

        existingCase.Status = CaseStatus.Resolved;
        existingCase.Severity = "Low";
        existingCase.ResolvedAt = DateTime.UtcNow;
        existingCase.Disposition = dto.Disposition;
        existingCase.ResolutionNote = dto.ResolutionNote;
        
        await _caseRepository.UpdateAsync(existingCase);
        
        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Resolve,
            Message = $"Case resolved: {dto.Disposition}. {dto.ResolutionNote}",
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };
        await _caseRepository.AddEventAsync(caseEvent);

        try
        {
            await _notificationService.CreateNotificationAsync(
                existingCase.OwnerId,
                "CASE_RESOLVED",
                "Case Resolved",
                $"Case {existingCase.CaseNumber} ({existingCase.Title}) has been resolved. Disposition: {dto.Disposition}.",
                existingCase.Id,
                existingCase.CaseNumber
            );
        }
        catch (Exception ex) { Console.WriteLine($"[Notification Trigger Error] {ex.Message}"); }
    }

    public async Task<ReopenCaseResultDto> ReopenCaseAsync(Guid caseId, ReopenCaseDto dto)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        if (existingCase.Status != CaseStatus.Resolved)
            throw new InvalidOperationException("Only resolved cases can be reopened.");

        // 1. Generate Sub-Case ID (e.g. C-00045-R01)
        int seq = await _caseRepository.GetNextChildSequenceAsync(caseId, ChildRelationType.Reopen);
        string childId = $"{existingCase.CaseNumber}-R{seq:D2}";

        // 2. Create and Save NEW Child Subcase Record in Cases Table (Parent Case remains Resolved)
        var newReopenSubcase = new Case
        {
            Id = Guid.NewGuid(),
            CaseNumber = childId,
            CaseType = existingCase.CaseType,
            Title = $"[Reopened] {existingCase.Title}",
            Description = $"Reopened from Parent Case {existingCase.CaseNumber}. Reason: {dto.Message}",
            Status = CaseStatus.Open,
            Severity = existingCase.Severity,
            SlaStartTime = DateTime.UtcNow,
            SlaTargetHours = await GetSlaTargetHoursAsync(existingCase.Severity),
            DepartmentId = existingCase.DepartmentId,
            CustomerId = existingCase.CustomerId,
            OwnerId = existingCase.OwnerId,
            ParentCaseId = existingCase.Id,
            SubcaseType = "ReopenedSubcase",
            CreatedAt = DateTime.UtcNow
        };
        await _caseRepository.AddAsync(newReopenSubcase);

        // 3. Save Sub-Case Relationship Entity
        var childRel = new CaseChildRelation
        {
            ChildId = childId,
            ParentCaseId = caseId,
            RelationType = ChildRelationType.Reopen,
            LinkedCaseId = null,
            Reason = dto.Message,
            CreatedByUserId = dto.UserId
        };
        await _caseRepository.AddChildRelationAsync(childRel);
        
        // Parent Case remains Closed/Resolved. Record audit note on Parent Case.
        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Note,
            Message = $"Case reopened -> Created Sub-Case {childId} (Reason: {dto.Message})",
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };
        await _caseRepository.AddEventAsync(caseEvent);

        // Record audit event on new Child Subcase
        var subcaseEvent = new CaseEvent
        {
            CaseId = newReopenSubcase.Id,
            EventType = EventType.Create,
            Message = $"Reopened Sub-case created from Parent {existingCase.CaseNumber}.",
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };
        await _caseRepository.AddEventAsync(subcaseEvent);

        try
        {
            await _notificationService.CreateNotificationAsync(
                newReopenSubcase.OwnerId,
                "CASE_REOPENED",
                "Subcase Reopened",
                $"Reopened Subcase {childId} created for Parent Case {existingCase.CaseNumber}.",
                newReopenSubcase.Id,
                childId
            );
        }
        catch (Exception ex) { Console.WriteLine($"[Notification Trigger Error] {ex.Message}"); }

        return new ReopenCaseResultDto
        {
            Message = "Subcase reopened successfully.",
            ChildId = childId,
            NewCaseId = newReopenSubcase.Id
        };
    }

    public async Task<PagedResponseDto<CaseAuditEventDto>> GetCaseAuditEventsAsync(int page = 1, int pageSize = 10, string? actionType = null, string? search = null, CancellationToken ct = default)
    {
        return await _caseRepository.GetCaseAuditEventsAsync(page, pageSize, actionType, search, ct);
    }

    public async Task AddTimelineInteractionAsync(Guid caseId, AddTimelineInteractionDto dto, Guid userId)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");

        if (string.IsNullOrWhiteSpace(dto.Message))
            throw new ArgumentException("Message cannot be empty.");

        var sender = await _context.Users.FindAsync(userId);
        var channel = dto.IsInternal ? null : (dto.Channel ?? existingCase.SourceChannel ?? existingCase.CommunicationChannel ?? "Voice");

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = dto.IsInternal ? EventType.Note : EventType.Comment,
            Message = dto.Message.Trim(),
            IsInternal = dto.IsInternal,
            Channel = channel,
            CreatedAt = DateTime.UtcNow,
            UserId = userId
        };
        await _caseRepository.AddEventAsync(caseEvent);

        // Check for @mentions in internal notes
        if (dto.IsInternal)
        {
            try
            {
                var mentionMatches = System.Text.RegularExpressions.Regex.Matches(dto.Message, @"@([a-zA-Z0-9_\.\-]+)");
                var mentionedTokens = mentionMatches.Select(m => m.Groups[1].Value.ToLowerInvariant()).Distinct().ToList();

                if (mentionedTokens.Count > 0)
                {
                    var allUsers = await _context.Users.ToListAsync();
                    var matchedUsers = allUsers.Where(u =>
                        u.Id != userId &&
                        mentionedTokens.Any(token =>
                            u.Name.ToLowerInvariant().Contains(token) ||
                            u.Email.ToLowerInvariant().StartsWith(token)
                        )
                    ).ToList();

                    foreach (var mentionedUser in matchedUsers)
                    {
                        await _notificationService.CreateNotificationAsync(
                            mentionedUser.Id,
                            "USER_MENTIONED",
                            "Mentioned in Case",
                            $"{sender?.Name ?? "A colleague"} mentioned you in Case {existingCase.CaseNumber}: \"{dto.Message.Trim()}\"",
                            existingCase.Id,
                            existingCase.CaseNumber,
                            "High"
                        );
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Mention Notification Error] {ex.Message}");
            }
        }
        else
        {
            // Customer Reply: notify case owner if different from replying agent
            if (existingCase.OwnerId != userId)
            {
                try
                {
                    await _notificationService.CreateNotificationAsync(
                        existingCase.OwnerId,
                        "CUSTOMER_REPLY_SENT",
                        "Reply Sent to Customer",
                        $"Reply sent to customer via {channel} on Case {existingCase.CaseNumber} by {sender?.Name ?? "Agent"}.",
                        existingCase.Id,
                        existingCase.CaseNumber,
                        "Medium"
                    );
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Customer Reply Notification Error] {ex.Message}");
                }
            }
        }
    }

    public async Task RequestSwarmAsync(Guid caseId, RequestSwarmDto dto, Guid userId)
    {
        var existingCase = await _context.Cases
            .Include(c => c.Department)
            .Include(c => c.Participants)
            .FirstOrDefaultAsync(c => c.Id == caseId);

        if (existingCase == null) throw new ArgumentException("Case not found");

        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Cannot request a swarm on a resolved case.");

        var requestingUser = await _context.Users.FindAsync(userId);

        // 1. Resolve Team Lead dynamically from department and role architecture
        var deptUsers = await _context.Users
            .Where(u => u.DepartmentId == existingCase.DepartmentId)
            .ToListAsync();

        User? teamLead = null;
        if (existingCase.Department != null && existingCase.Department.OwnerId.HasValue)
        {
            teamLead = await _context.Users.FindAsync(existingCase.Department.OwnerId.Value);
        }

        if (teamLead == null)
        {
            teamLead = deptUsers.FirstOrDefault(u =>
                u.Role.Contains("Lead", StringComparison.OrdinalIgnoreCase) ||
                u.Role.Contains("Supervisor", StringComparison.OrdinalIgnoreCase) ||
                u.Role.Contains("Manager", StringComparison.OrdinalIgnoreCase)
            );
        }

        if (teamLead == null)
        {
            teamLead = await _context.Users.FirstOrDefaultAsync(u =>
                u.Role.Contains("Lead", StringComparison.OrdinalIgnoreCase) ||
                u.Role.Contains("Supervisor", StringComparison.OrdinalIgnoreCase) ||
                u.Role.Contains("Manager", StringComparison.OrdinalIgnoreCase)
            );
        }

        // 2. Resolve Subject Matter Experts (SMEs) dynamically
        var smes = deptUsers.Where(u =>
            (teamLead == null || u.Id != teamLead.Id) &&
            u.Id != existingCase.OwnerId &&
            (u.Role.Contains("Senior", StringComparison.OrdinalIgnoreCase) ||
             u.Role.Contains("Sr.", StringComparison.OrdinalIgnoreCase) ||
             u.Role.Contains("Specialist", StringComparison.OrdinalIgnoreCase) ||
             u.Role.Contains("Expert", StringComparison.OrdinalIgnoreCase) ||
             u.Role.Contains("Officer", StringComparison.OrdinalIgnoreCase))
        ).Take(2).ToList();

        if (smes.Count == 0)
        {
            smes = deptUsers.Where(u =>
                (teamLead == null || u.Id != teamLead.Id) &&
                u.Id != existingCase.OwnerId
            ).Take(1).ToList();
        }

        if (smes.Count == 0)
        {
            smes = await _context.Users.Where(u =>
                (teamLead == null || u.Id != teamLead.Id) &&
                u.Id != existingCase.OwnerId &&
                (u.Role.Contains("Senior", StringComparison.OrdinalIgnoreCase) ||
                 u.Role.Contains("Sr.", StringComparison.OrdinalIgnoreCase) ||
                 u.Role.Contains("Specialist", StringComparison.OrdinalIgnoreCase) ||
                 u.Role.Contains("Expert", StringComparison.OrdinalIgnoreCase) ||
                 u.Role.Contains("Officer", StringComparison.OrdinalIgnoreCase))
            ).Take(2).ToListAsync();
        }

        if (smes.Count == 0)
        {
            smes = await _context.Users.Where(u =>
                (teamLead == null || u.Id != teamLead.Id) &&
                u.Id != existingCase.OwnerId
            ).Take(1).ToListAsync();
        }

        // 3. Add Team Lead and SMEs as case participants if not already added
        var addedUsers = new List<User>();

        if (teamLead != null && !existingCase.Participants.Any(p => p.UserId == teamLead.Id))
        {
            var p = new CaseParticipant
            {
                CaseId = caseId,
                UserId = teamLead.Id,
                Role = ParticipantRole.CoWorker
            };
            _context.CaseParticipants.Add(p);
            addedUsers.Add(teamLead);
        }

        foreach (var sme in smes)
        {
            if (!existingCase.Participants.Any(p => p.UserId == sme.Id))
            {
                var p = new CaseParticipant
                {
                    CaseId = caseId,
                    UserId = sme.Id,
                    Role = ParticipantRole.CoWorker
                };
                _context.CaseParticipants.Add(p);
                addedUsers.Add(sme);
            }
        }

        // 4. Increase case attention / severity if not already Critical
        if (!string.Equals(existingCase.Severity, "Critical", StringComparison.OrdinalIgnoreCase))
        {
            existingCase.Severity = string.Equals(existingCase.Severity, "High", StringComparison.OrdinalIgnoreCase)
                ? "Critical"
                : "High";
            existingCase.SlaTargetHours = await GetSlaTargetHoursAsync(existingCase.Severity);
        }

        await _context.SaveChangesAsync();

        // 5. Add Timeline Event matching Screenshot 1, 2, 3
        var swarmEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Cowork,
            Message = "⚡ Swarm requested — pulling in team lead and subject-matter experts. Priority attention needed.",
            IsInternal = true,
            CreatedAt = DateTime.UtcNow,
            UserId = userId
        };
        await _caseRepository.AddEventAsync(swarmEvent);

        // 6. Notify Team Lead and SMEs
        foreach (var u in addedUsers)
        {
            try
            {
                await _notificationService.CreateNotificationAsync(
                    u.Id,
                    "CASE_SWARM_REQUESTED",
                    "⚡ Swarm Requested",
                    $"Swarm requested on Case {existingCase.CaseNumber} ({existingCase.Title}) by {requestingUser?.Name ?? "Agent"}. You have been added to assist.",
                    existingCase.Id,
                    existingCase.CaseNumber,
                    "Critical"
                );
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Swarm Notification Error] {ex.Message}");
            }
        }
    }

    public async Task<IEnumerable<CaseAttachmentDto>> GetAttachmentsAsync(Guid caseId, CancellationToken ct = default)
    {
        return await _context.CaseAttachments
            .AsNoTracking()
            .Where(a => a.CaseId == caseId)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new CaseAttachmentDto
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
            })
            .ToListAsync(ct);
    }

    public async Task<CaseAttachmentDto> UploadAttachmentAsync(Guid caseId, Microsoft.AspNetCore.Http.IFormFile file, string? note, Guid userId)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");

        if (file == null || file.Length == 0)
            throw new ArgumentException("Please select a valid file to upload.");

        if (file.Length > 25 * 1024 * 1024)
            throw new ArgumentException("File size exceeds 25 MB limit.");

        var rawFileName = System.IO.Path.GetFileName(file.FileName);
        var ext = System.IO.Path.GetExtension(rawFileName).ToLowerInvariant();
        var safeStoredFileName = $"{Guid.NewGuid()}_{rawFileName}";

        var uploadsDir = System.IO.Path.Combine(_env.ContentRootPath, "Uploads", "Attachments");
        if (!System.IO.Directory.Exists(uploadsDir))
        {
            System.IO.Directory.CreateDirectory(uploadsDir);
        }

        var fullPath = System.IO.Path.Combine(uploadsDir, safeStoredFileName);
        using (var stream = new System.IO.FileStream(fullPath, System.IO.FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var attachment = new CaseAttachment
        {
            Id = Guid.NewGuid(),
            CaseId = caseId,
            FileName = rawFileName,
            FileType = string.IsNullOrWhiteSpace(file.ContentType) ? ext : file.ContentType,
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            FileSizeBytes = file.Length,
            FileSize = file.Length,
            StoragePath = safeStoredFileName,

            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            UploadedByUserId = userId,
            CreatedAt = DateTime.UtcNow
        };


        _context.CaseAttachments.Add(attachment);
        await _context.SaveChangesAsync();

        // Add timeline event
        var sizeDisplay = file.Length >= 1024 * 1024
            ? $"{(file.Length / (1024.0 * 1024.0)):F1} MB"
            : $"{(file.Length / 1024.0):F0} KB";

        var timelineEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Other,
            Message = $"Attached file: {rawFileName} ({sizeDisplay}).{(string.IsNullOrWhiteSpace(note) ? "" : $" Note: {note.Trim()}")}",
            IsInternal = true,
            CreatedAt = DateTime.UtcNow,
            UserId = userId
        };
        await _caseRepository.AddEventAsync(timelineEvent);

        var user = await _context.Users.FindAsync(userId);

        return new CaseAttachmentDto
        {
            Id = attachment.Id,
            CaseId = caseId,
            FileName = attachment.FileName,
            FileType = attachment.FileType,
            FileSizeBytes = attachment.FileSizeBytes,
            Note = attachment.Note,
            UploadedByUserId = userId,
            UploadedByUserName = user?.Name ?? string.Empty,
            CreatedAt = attachment.CreatedAt
        };
    }

    public async Task<(byte[] fileBytes, string contentType, string fileName)> GetAttachmentDownloadAsync(Guid caseId, Guid attachmentId)
    {
        var attachment = await _context.CaseAttachments
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.CaseId == caseId);

        if (attachment == null) throw new ArgumentException("Attachment not found.");

        var uploadsDir = System.IO.Path.Combine(_env.ContentRootPath, "Uploads", "Attachments");
        var fullPath = System.IO.Path.Combine(uploadsDir, attachment.StoragePath);

        if (!System.IO.File.Exists(fullPath))
            throw new System.IO.FileNotFoundException("Physical file not found on server.");

        var bytes = await System.IO.File.ReadAllBytesAsync(fullPath);
        var contentType = string.IsNullOrWhiteSpace(attachment.FileType) ? "application/octet-stream" : attachment.FileType;

        return (bytes, contentType, attachment.FileName);
    }

    /// <summary>
    /// Severities are administrator-configurable (Configurable Settings -> Case Management ->
    /// Master Data), so an incoming value is matched against the configured master list instead
    /// of a compiled-in enum. Matching is case-insensitive and returns the canonical casing so
    /// stored values stay consistent with the configuration.
    /// </summary>
    private async Task<string> ResolveSeverityAsync(string? requested)
    {
        var input = requested?.Trim();
        if (string.IsNullOrWhiteSpace(input))
            throw new InvalidOperationException("Severity is required.");

        try
        {
            var configured = (await _settingsService.GetSeveritiesAsync()).ToList();
            if (configured.Count > 0)
            {
                var match = configured.FirstOrDefault(v => v.Equals(input, StringComparison.OrdinalIgnoreCase));
                if (match != null) return match;

                throw new InvalidOperationException(
                    $"'{input}' is not a configured severity. Configured severities: {string.Join(", ", configured)}.");
            }
        }
        catch (InvalidOperationException) { throw; }
        catch (Exception ex)
        {
            // A configuration read failure must not block case creation.
            Console.WriteLine($"[CaseService SeverityLookup Error] {ex.Message}");
        }

        return input;
    }

    /// <summary>
    /// External (customer-facing) SLA hours for a severity, read from SLA Configuration.
    /// Falls back to the historical defaults when no row is configured for that severity.
    /// </summary>
    private async Task<int> GetSlaTargetHoursAsync(string severity)
    {
        try
        {
            var slaConfigs = await _settingsService.GetSlaConfigurationsAsync();
            var matched = slaConfigs.FirstOrDefault(s => s.Severity.Equals(severity, StringComparison.OrdinalIgnoreCase));
            if (matched != null && matched.ExternalHours > 0) return matched.ExternalHours;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CaseService SlaLookup Error] {ex.Message}");
        }

        return severity.ToLowerInvariant() switch
        {
            "critical" => 4,
            "high" => 8,
            "medium" => 12,
            "low" => 24,
            _ => 24
        };
    }
}
