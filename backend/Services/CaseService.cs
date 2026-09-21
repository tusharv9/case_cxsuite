namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Repositories;

public class CaseService : ICaseService
{
    private readonly ICaseRepository _caseRepository;
    private readonly INotificationService _notificationService;
    private readonly IConfigurableSettingsService _settingsService;

    public CaseService(
        ICaseRepository caseRepository,
        INotificationService notificationService,
        IConfigurableSettingsService settingsService)
    {
        _caseRepository = caseRepository;
        _notificationService = notificationService;
        _settingsService = settingsService;
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

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Assign,
            Message = $"Owner confirmed/reassigned.",
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

    public async Task TransferDepartmentAsync(Guid caseId, Guid newDepartmentId, Guid transferredByUserId)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Cannot transfer a resolved case.");

        if (existingCase.DepartmentId == newDepartmentId)
            throw new InvalidOperationException("Case is already assigned to this department.");

        existingCase.DepartmentId = newDepartmentId;
        
        var newOwnerId = await _caseRepository.GetDepartmentOwnerAsync(newDepartmentId);
        if (newOwnerId.HasValue)
        {
            existingCase.OwnerId = newOwnerId.Value;
        }

        existingCase.SlaTargetHours = await GetSlaTargetHoursAsync(existingCase.Severity);

        // Reset SLA timer
        existingCase.SlaStartTime = DateTime.UtcNow;

        await _caseRepository.UpdateAsync(existingCase);

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Transfer,
            Message = $"Transferred to new department.",
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
        if (targetCase == null) throw new ArgumentException("Target case not found");

        await _caseRepository.RemoveLinkedCaseAsync(caseId, targetCase.Id);
        
        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Note,
            Message = $"Unlinked from case {targetCase.CaseNumber}",
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };
        await _caseRepository.AddEventAsync(caseEvent);
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
