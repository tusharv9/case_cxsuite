namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using CaseManagement.Api.Repositories;
using CaseManagement.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;

using CaseManagement.Api.Configuration;
using Microsoft.Extensions.Options;

public class CaseService : ICaseService
{
    private readonly ICaseRepository _caseRepository;
    private readonly INotificationService _notificationService;
    private readonly IConfigurableSettingsService _settingsService;
    private readonly AppDbContext _context;
    private readonly IWebHostEnvironment _env;
    private readonly AttachmentOptions _attachmentOptions;
    private readonly IPiiMaskingService? _piiMasking;
    private readonly IBusinessTimeService? _businessTimeService;
    private readonly ISlaRoutingService? _slaRoutingService;

    public CaseService(
        ICaseRepository caseRepository,
        INotificationService notificationService,
        IConfigurableSettingsService settingsService,
        AppDbContext context,
        IWebHostEnvironment env,
        IOptions<AttachmentOptions>? attachmentOptions = null,
        IPiiMaskingService? piiMasking = null,
        IBusinessTimeService? businessTimeService = null,
        ISlaRoutingService? slaRoutingService = null)
    {
        _caseRepository = caseRepository;
        _notificationService = notificationService;
        _settingsService = settingsService;
        _context = context;
        _env = env;
        _attachmentOptions = attachmentOptions?.Value ?? new AttachmentOptions();
        _piiMasking = piiMasking;
        _businessTimeService = businessTimeService;
        _slaRoutingService = slaRoutingService;
    }

    /// <summary>
    /// Executes a unit of work inside a user-initiated transaction wrapped in the configured
    /// execution strategy (e.g. NpgsqlRetryingExecutionStrategy), as required by EF Core when
    /// retry-on-failure is enabled.
    /// </summary>
    private async Task ExecuteInTransactionAsync(Func<Task> action)
    {
        var strategy = _context.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                await action();
                await transaction.CommitAsync();
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        });
    }

    private async Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action)
    {
        var strategy = _context.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var result = await action();
                await transaction.CommitAsync();
                return result;
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        });
    }

    public async Task<Case> CreateCaseAsync(CreateCaseDto dto, Guid createdByUserId)
    {
        await ValidateCreateCaseMetadataAsync(dto);

        // 1. Resolve Effective Priority: Category mapping takes authoritative precedence
        var effectivePriority = _slaRoutingService != null
            ? await _slaRoutingService.ResolveEffectivePriorityAsync(dto.Severity, dto.Subcategory)
            : await ResolveSeverityAsync(dto.Severity);

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

        // 2. Resolve Active SLA Matrix Targets & Version
        int frMinutes = 30;
        int intMinutes = 120;
        int extMinutes = 240;
        int configVersion = 1;

        if (_slaRoutingService != null)
        {
            var slaRule = await _slaRoutingService.GetActivePrioritySlaRuleAsync(effectivePriority);
            frMinutes = slaRule.FirstResponseMinutes;
            intMinutes = slaRule.InternalResolutionMinutes;
            extMinutes = slaRule.ExternalResolutionMinutes;
            configVersion = slaRule.Version;
        }
        else
        {
            int extHours = await GetSlaTargetHoursAsync(effectivePriority);
            frMinutes = await GetFirstResponseTargetMinutesAsync(effectivePriority);
            extMinutes = extHours * 60;
            intMinutes = Math.Max(60, extMinutes - 120);
        }

        // 3. Calculate SLA Deadlines using configured Business Hours and Public Holidays
        DateTime now = DateTime.UtcNow;
        DateTime frDueAt = _businessTimeService != null
            ? await _businessTimeService.AddBusinessMinutesAsync(now, frMinutes)
            : now.AddMinutes(frMinutes);

        DateTime intDueAt = _businessTimeService != null
            ? await _businessTimeService.AddBusinessMinutesAsync(now, intMinutes)
            : now.AddMinutes(intMinutes);

        DateTime extDueAt = _businessTimeService != null
            ? await _businessTimeService.AddBusinessMinutesAsync(now, extMinutes)
            : now.AddMinutes(extMinutes);

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
            Severity = effectivePriority,
            Status = CaseStatus.Open,
            SourceChannel = sourceChannel,
            PreferredCommunicationChannel = preferredChannel,
            CommunicationChannel = sourceChannel,
            Subcategory = string.IsNullOrWhiteSpace(dto.Subcategory) ? "General Inquiry" : dto.Subcategory,
            SlaStartTime = now,
            SlaTargetHours = (int)Math.Ceiling(extMinutes / 60.0),
            SlaTotalPausedMinutes = 0,
            SlaPausedAt = null,
            FirstResponseTargetMinutes = frMinutes,
            FirstResponseDueAt = frDueAt,
            FirstResponseActualAt = null,
            FirstResponseStatus = "Pending",
            InternalResolutionTargetMinutes = intMinutes,
            ExternalResolutionTargetMinutes = extMinutes,
            InternalResolutionDueAt = intDueAt,
            ExternalResolutionDueAt = extDueAt,
            SlaConfigVersion = configVersion,
            EscalationLevel = 1,
        };

        var caseEvent = new CaseEvent
        {
            CaseId = newCase.Id,
            EventType = EventType.Create,
            Message = $"Case opened ({canonicalCaseType}).",
            CreatedAt = DateTime.UtcNow,
            UserId = createdByUserId
        };

        await ExecuteInTransactionAsync(async () =>
        {
            await _caseRepository.AddAsync(newCase);
            await _caseRepository.AddEventAsync(caseEvent);
        });

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
        // Read-only: SLA monitoring runs in SlaEscalationBackgroundService, never on a read.
        var caseDetail = await _caseRepository.GetCaseDetailAsync(caseId, ct);
        if (caseDetail?.Customer != null && _piiMasking != null)
        {
            await _piiMasking.MaskCustomerSummaryAsync(caseDetail.Customer, ct);
        }
        if (caseDetail != null && _businessTimeService != null)
        {
            var (isHoliday, holidayName) = await _businessTimeService.GetActiveHolidayAsync(DateTime.UtcNow, ct);
            if (isHoliday)
            {
                caseDetail.IsHolidayToday = true;
                caseDetail.HolidayName = holidayName;
            }
        }
        return caseDetail;
    }

    private async Task EnrichCasesWithHolidayStatusAsync(IEnumerable<CaseSummaryDto>? cases, CancellationToken ct)
    {
        if (cases == null || !cases.Any() || _businessTimeService == null) return;
        var (isHoliday, holidayName) = await _businessTimeService.GetActiveHolidayAsync(DateTime.UtcNow, ct);
        if (isHoliday)
        {
            foreach (var c in cases)
            {
                c.IsHolidayToday = true;
                c.HolidayName = holidayName;
            }
        }
    }

    public async Task<IEnumerable<SearchCaseHitDto>> SearchCasesAsync(string query, int limit, CancellationToken ct = default)
    {
        return await _caseRepository.SearchCasesAsync(query, limit, ct);
    }

    public async Task<IEnumerable<CaseSummaryDto>> GetBoardCasesAsync(Guid? departmentId = null, string? caseType = null, CancellationToken ct = default)
    {
        var cases = (await _caseRepository.GetBoardCasesAsync(departmentId, caseType, ct)).ToList();
        await EnrichCasesWithHolidayStatusAsync(cases, ct);
        return cases;
    }

    public async Task<PagedResponseDto<CaseSummaryDto>> GetPaginatedBoardCasesAsync(
        string? status = null,
        int page = 1,
        int pageSize = 30,
        Guid? departmentId = null,
        string? caseType = null,
        string? search = null,
        string? priority = null,
        string? channel = null,
        CancellationToken ct = default)
    {
        var paged = await _caseRepository.GetPaginatedBoardCasesAsync(
            status,
            page,
            pageSize,
            departmentId,
            caseType,
            search,
            priority,
            channel,
            ct);

        await EnrichCasesWithHolidayStatusAsync(paged.Items, ct);
        return paged;
    }

    public async Task UpdateCaseStatusAsync(Guid caseId, UpdateCaseStatusDto dto)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");

        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Cannot update status of a resolved case. Use Reopen instead.");

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
        else if (!Enum.TryParse<CaseStatus>(rawStatus.Replace(" ", "").Replace("_", ""), true, out newStatus) || !Enum.IsDefined(newStatus))
        {
            throw new InvalidOperationException($"'{rawStatus}' is not a valid case status.");
        }
        
        if (existingCase.Status == newStatus)
            throw new InvalidOperationException($"Case is already in '{newStatus}' status.");

        // --- Status Transition Validation ---
        // Only approved transitions are allowed. Resolved must go through ResolveCaseAsync,
        // Escalated must go through EscalateCaseAsync.
        if (newStatus == CaseStatus.Resolved)
            throw new InvalidOperationException("Use the Resolve workflow to resolve a case.");

        if (newStatus == CaseStatus.Escalated)
            throw new InvalidOperationException("Use the Escalate workflow to escalate a case.");

        if (!IsValidTransition(existingCase.Status, newStatus))
            throw new InvalidOperationException(
                $"Cannot transition from '{existingCase.Status}' to '{newStatus}'. " +
                $"Allowed transitions from '{existingCase.Status}': {string.Join(", ", GetAllowedTransitions(existingCase.Status))}.");


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
        
        if (newStatus == CaseStatus.InProgress && !existingCase.FirstResponseActualAt.HasValue)
        {
            existingCase.FirstResponseActualAt = DateTime.UtcNow;
            var effectiveDueAt = existingCase.FirstResponseDueAt ?? existingCase.SlaStartTime.AddMinutes(existingCase.FirstResponseTargetMinutes).AddMinutes(existingCase.SlaTotalPausedMinutes);
            existingCase.FirstResponseStatus = existingCase.FirstResponseActualAt.Value <= effectiveDueAt ? "Met" : "Breached";
        }

        if (newStatus == CaseStatus.Escalated && existingCase.EscalationLevel < 2)
        {
            existingCase.EscalationLevel = 2;
        }

        if (newStatus == CaseStatus.Resolved)
        {
            existingCase.ResolvedAt = DateTime.UtcNow;
            if (!existingCase.FirstResponseActualAt.HasValue)
            {
                existingCase.FirstResponseActualAt = DateTime.UtcNow;
                var effectiveDueAt = existingCase.FirstResponseDueAt ?? existingCase.SlaStartTime.AddMinutes(existingCase.FirstResponseTargetMinutes).AddMinutes(existingCase.SlaTotalPausedMinutes);
                existingCase.FirstResponseStatus = existingCase.FirstResponseActualAt.Value <= effectiveDueAt ? "Met" : "Breached";
            }
            if (existingCase.SlaPausedAt.HasValue)
            {
                var pausedMinutes = (int)Math.Max(0, Math.Round((DateTime.UtcNow - existingCase.SlaPausedAt.Value).TotalMinutes));
                existingCase.SlaTotalPausedMinutes += pausedMinutes;
                existingCase.SlaPausedAt = null;
            }
        }

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

        await ExecuteInTransactionAsync(async () =>
        {
            await _caseRepository.UpdateAsync(existingCase);
            await _caseRepository.AddEventAsync(caseEvent);
        });

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

        var newOwner = await _context.Users.FindAsync(dto.OwnerId);
        if (newOwner == null)
            throw new ArgumentException("Assigned user not found.");

        existingCase.OwnerId = dto.OwnerId;
        existingCase.SlaTargetHours = await GetSlaTargetHoursAsync(existingCase.Severity);
        
        // Reset SLA timer
        existingCase.SlaStartTime = DateTime.UtcNow;

        var ownerName = newOwner.Name;
        var reasonText = !string.IsNullOrWhiteSpace(dto.Reason) ? $" Reason: {dto.Reason}." : "";

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Assign,
            Message = $"Reassigned to {ownerName}.{reasonText}",
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };

        await ExecuteInTransactionAsync(async () =>
        {
            await _caseRepository.UpdateAsync(existingCase);
            await _caseRepository.AddEventAsync(caseEvent);
        });

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

        var ids = (coworkerUserIds ?? new List<Guid>()).Where(id => id != Guid.Empty).Distinct().ToList();
        if (ids.Count == 0)
            throw new InvalidOperationException("Select at least one collaborator.");

        // Validate everything first so a bad id cannot leave the case half-updated.
        if (existingCase.Participants.Any(p => ids.Contains(p.UserId) && p.Role == ParticipantRole.CoWorker))
            throw new InvalidOperationException("One or more users are already coworkers on this case.");

        var users = await _context.Users.AsNoTracking()
            .Where(u => ids.Contains(u.Id) || u.Id == addedByUserId)
            .Select(u => new { u.Id, u.Name })
            .ToListAsync();
        if (ids.Any(id => users.All(u => u.Id != id)))
            throw new InvalidOperationException("One or more selected users no longer exist.");

        var now = DateTime.UtcNow;
        var actorName = users.FirstOrDefault(u => u.Id == addedByUserId)?.Name ?? "A user";
        var addedNames = new List<string>();

        foreach (var id in ids)
        {
            _context.CaseParticipants.Add(new CaseParticipant
            {
                CaseId = caseId,
                UserId = id,
                Role = ParticipantRole.CoWorker
            });
            _context.CaseCollaborationActivities.Add(new CaseCollaborationActivity
            {
                CaseId = caseId,
                ActivityType = CollaborationActivityTypes.CollaboratorAdded,
                ActorUserId = addedByUserId,
                TargetUserId = id,
                CreatedAt = now
            });
            addedNames.Add(users.First(u => u.Id == id).Name);
        }

        _context.CaseEvents.Add(new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Cowork,
            Message = $"{actorName} added {string.Join(", ", addedNames)} as collaborator{(addedNames.Count > 1 ? "s" : "")}.",
            CreatedAt = now,
            UserId = addedByUserId
        });

        // Participants, collaboration activity and the audit event are saved together.
        await _context.SaveChangesAsync();
    }

    public async Task RemoveCoworkerAsync(Guid caseId, Guid coworkerUserId, Guid removedByUserId)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Cannot remove coworkers from a resolved case.");

        var participant = existingCase.Participants.FirstOrDefault(p => p.UserId == coworkerUserId);
        if (participant == null)
            throw new InvalidOperationException("That user is not a collaborator on this case.");

        var names = await _context.Users.AsNoTracking()
            .Where(u => u.Id == coworkerUserId || u.Id == removedByUserId)
            .ToDictionaryAsync(u => u.Id, u => u.Name);
        var now = DateTime.UtcNow;
        var actorName = names.TryGetValue(removedByUserId, out var actorValue) ? actorValue : "A user";
        var targetName = names.TryGetValue(coworkerUserId, out var targetValue) ? targetValue : "a collaborator";

        _context.CaseParticipants.Remove(participant);
        _context.CaseCollaborationActivities.Add(new CaseCollaborationActivity
        {
            CaseId = caseId,
            ActivityType = CollaborationActivityTypes.CollaboratorRemoved,
            ActorUserId = removedByUserId,
            TargetUserId = coworkerUserId,
            CreatedAt = now
        });
        _context.CaseEvents.Add(new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Cowork,
            Message = $"{actorName} removed {targetName} as collaborator.",
            CreatedAt = now,
            UserId = removedByUserId
        });

        await _context.SaveChangesAsync();
    }

    public async Task<CaseCollaborationDto> GetCollaborationAsync(Guid caseId, DateTime? before, int limit, CancellationToken ct = default)
    {
        if (limit < 1) limit = 50;
        if (limit > 200) limit = 200;

        var collaborators = await _context.CaseParticipants.AsNoTracking()
            .Where(p => p.CaseId == caseId)
            .Select(p => new ParticipantDto
            {
                UserId = p.UserId,
                UserName = p.User != null ? p.User.Name : string.Empty,
                Role = p.Role.ToString()
            })
            .ToListAsync(ct);

        var query = _context.CaseCollaborationActivities.AsNoTracking().Where(a => a.CaseId == caseId);
        if (before.HasValue)
        {
            var cutoff = DateTime.SpecifyKind(before.Value, DateTimeKind.Utc);
            query = query.Where(a => a.CreatedAt < cutoff);
        }

        var rows = await query
            .OrderByDescending(a => a.CreatedAt)
            .Take(limit + 1)
            .Select(a => new CollaborationActivityDto
            {
                Id = a.Id,
                ActivityType = a.ActivityType,
                ActorUserId = a.ActorUserId,
                ActorName = a.ActorUser != null ? a.ActorUser.Name : string.Empty,
                ActorRole = a.ActorUser != null ? a.ActorUser.Role : null,
                TargetUserId = a.TargetUserId,
                TargetName = a.TargetUser != null ? a.TargetUser.Name : null,
                Content = a.Content,
                CreatedAt = a.CreatedAt
            })
            .ToListAsync(ct);

        return new CaseCollaborationDto
        {
            Collaborators = collaborators,
            Activities = rows.Take(limit).ToList(),
            HasMore = rows.Count > limit
        };
    }

    public async Task<CollaborationActivityDto> AddCollaborationNoteAsync(Guid caseId, string content, Guid userId)
    {
        var text = content?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text))
            throw new InvalidOperationException("Note cannot be empty.");
        if (text.Length > 2000)
            throw new InvalidOperationException("Note cannot exceed 2000 characters.");

        var existingCase = await _context.Cases.AsNoTracking()
            .Where(c => c.Id == caseId)
            .Select(c => new { c.Id, c.CaseNumber })
            .FirstOrDefaultAsync();
        if (existingCase == null) throw new ArgumentException("Case not found");

        var sender = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);

        var activity = new CaseCollaborationActivity
        {
            CaseId = caseId,
            ActivityType = CollaborationActivityTypes.NoteAdded,
            ActorUserId = userId,
            Content = text,
            CreatedAt = DateTime.UtcNow
        };
        _context.CaseCollaborationActivities.Add(activity);
        await _context.SaveChangesAsync();

        // @mentions notify colleagues, as internal notes always have.
        try
        {
            var tokens = System.Text.RegularExpressions.Regex.Matches(text, @"@([a-zA-Z0-9_\.\-]+)")
                .Select(m => m.Groups[1].Value.ToLowerInvariant())
                .Distinct()
                .ToList();

            foreach (var token in tokens)
            {
                var matches = await _context.Users.AsNoTracking()
                    .Where(u => u.Id != userId &&
                                (u.Name.ToLower().Contains(token) || u.Email.ToLower().StartsWith(token)))
                    .Select(u => u.Id)
                    .ToListAsync();

                foreach (var mentionedUserId in matches)
                {
                    await _notificationService.CreateNotificationAsync(
                        mentionedUserId,
                        "USER_MENTIONED",
                        "Mentioned in Case Collaboration",
                        $"{sender?.Name ?? "A colleague"} mentioned you in Case {existingCase.CaseNumber}: \"{text}\"",
                        caseId,
                        existingCase.CaseNumber,
                        "High"
                    );
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Collaboration Mention Notification Error] {ex.Message}");
        }

        return new CollaborationActivityDto
        {
            Id = activity.Id,
            ActivityType = activity.ActivityType,
            ActorUserId = userId,
            ActorName = sender?.Name ?? string.Empty,
            ActorRole = sender?.Role,
            Content = activity.Content,
            CreatedAt = activity.CreatedAt
        };
    }

    public async Task<CaseStatsDto> GetCaseStatsAsync(Guid? departmentId, CancellationToken ct = default)
    {
        // Mirrors the counts the page used to compute from the full case list in the browser:
        // "open" = not resolved; "breached" = not resolved, clock not paused, and past
        // start + target (+ paused minutes). Done in one SQL statement instead.
        const string sql = @"
            SELECT
                COUNT(*) FILTER (WHERE ""Status"" <> 'Resolved')::int AS ""OpenCount"",
                COUNT(*) FILTER (
                    WHERE ""Status"" NOT IN ('Resolved', 'WaitingOnCustomer')
                      AND ""SlaPausedAt"" IS NULL
                      AND ""SlaStartTime""
                          + make_interval(hours => COALESCE(NULLIF(""SlaTargetHours"", 0), 24))
                          + make_interval(mins => COALESCE(""SlaTotalPausedMinutes"", 0)) <= now()
                )::int AS ""BreachedCount""
            FROM ""Cases""";

        var result = departmentId.HasValue
            ? await _context.Database.SqlQueryRaw<CaseStatsDto>(sql + @" WHERE ""DepartmentId"" = {0}", departmentId.Value).SingleAsync(ct)
            : await _context.Database.SqlQueryRaw<CaseStatsDto>(sql).SingleAsync(ct);

        return result;
    }

    public async Task TransferDepartmentAsync(Guid caseId, TransferDepartmentDto dto, Guid transferredByUserId)
    {
        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new ArgumentException("Case not found");
        
        if (existingCase.Status == CaseStatus.Resolved)
            throw new InvalidOperationException("Cannot transfer a resolved case.");

        if (dto.DepartmentId != Guid.Empty && dto.DepartmentId != existingCase.DepartmentId)
        {
            var targetDept = await _context.Departments.FindAsync(dto.DepartmentId);
            if (targetDept == null)
                throw new ArgumentException("Target department not found.");

            existingCase.DepartmentId = dto.DepartmentId;
            var newOwnerId = await _caseRepository.GetDepartmentOwnerAsync(dto.DepartmentId);
            if (newOwnerId.HasValue)
            {
                existingCase.OwnerId = newOwnerId.Value;
            }
        }

        // SLA TARGETS DO NOT RESET: Transfer keeps SLA clock running continuously without interruption
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

        await ExecuteInTransactionAsync(async () =>
        {
            await _caseRepository.UpdateAsync(existingCase);
            await _caseRepository.AddEventAsync(caseEvent);
        });
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

        string childId = string.Empty;
        Case newLinkSubcase = null!;

        await ExecuteInTransactionAsync(async () =>
        {
            // 1. Generate Sub-Case ID (e.g. C-00045-L01)
            int seq = await _caseRepository.GetNextChildSequenceAsync(caseId, ChildRelationType.Link);
            childId = $"{existingCase.CaseNumber}-L{seq:D2}";

            // 2. Create and Save NEW Child Subcase Record in Cases Table
            newLinkSubcase = new Case
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
        });

            // Notification outside transaction — failure here is non-critical
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

        await ExecuteInTransactionAsync(async () =>
        {
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
        });
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
        existingCase.ResolvedAt = DateTime.UtcNow;
        existingCase.Disposition = dto.Disposition;
        existingCase.ResolutionNote = dto.ResolutionNote;
        if (!existingCase.FirstResponseActualAt.HasValue)
        {
            existingCase.FirstResponseActualAt = DateTime.UtcNow;
            var effectiveDueAt = existingCase.FirstResponseDueAt ?? existingCase.SlaStartTime.AddMinutes(existingCase.FirstResponseTargetMinutes).AddMinutes(existingCase.SlaTotalPausedMinutes);
            existingCase.FirstResponseStatus = existingCase.FirstResponseActualAt.Value <= effectiveDueAt ? "Met" : "Breached";
        }
        
        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Resolve,
            Message = $"Case resolved: {dto.Disposition}. {dto.ResolutionNote}",
            CreatedAt = DateTime.UtcNow,
            UserId = dto.UserId
        };

        await ExecuteInTransactionAsync(async () =>
        {
            await _caseRepository.UpdateAsync(existingCase);
            await _caseRepository.AddEventAsync(caseEvent);
        });

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

        string childId = string.Empty;
        Case newReopenSubcase = null!;

        await ExecuteInTransactionAsync(async () =>
        {
            // 1. Generate Sub-Case ID (e.g. C-00045-R01)
            int seq = await _caseRepository.GetNextChildSequenceAsync(caseId, ChildRelationType.Reopen);
            childId = $"{existingCase.CaseNumber}-R{seq:D2}";

            // 2. Create and Save NEW Child Subcase Record in Cases Table (Parent Case remains Resolved)
            newReopenSubcase = new Case
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
        });

        // Notification outside transaction — failure here is non-critical
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

        if (!dto.IsInternal && !existingCase.FirstResponseActualAt.HasValue)
        {
            existingCase.FirstResponseActualAt = DateTime.UtcNow;
            var effectiveDueAt = existingCase.FirstResponseDueAt ?? existingCase.SlaStartTime.AddMinutes(existingCase.FirstResponseTargetMinutes).AddMinutes(existingCase.SlaTotalPausedMinutes);
            existingCase.FirstResponseStatus = existingCase.FirstResponseActualAt.Value <= effectiveDueAt ? "Met" : "Breached";
            await _caseRepository.UpdateAsync(existingCase);
        }

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

        // Collaboration feed: the swarm request and every person it pulled in.
        var swarmTime = DateTime.UtcNow;
        _context.CaseCollaborationActivities.Add(new CaseCollaborationActivity
        {
            CaseId = caseId,
            ActivityType = CollaborationActivityTypes.SwarmRequested,
            ActorUserId = userId,
            Content = string.IsNullOrWhiteSpace(dto.Reason) ? null : dto.Reason.Trim(),
            CreatedAt = swarmTime
        });
        foreach (var added in addedUsers)
        {
            _context.CaseCollaborationActivities.Add(new CaseCollaborationActivity
            {
                CaseId = caseId,
                ActivityType = CollaborationActivityTypes.CollaboratorAdded,
                ActorUserId = userId,
                TargetUserId = added.Id,
                CreatedAt = swarmTime
            });
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
        if (file == null || file.Length == 0)
            throw new ArgumentException("Please select a valid non-empty file to upload.");

        var existingCase = await _caseRepository.GetByIdAsync(caseId);
        if (existingCase == null) throw new KeyNotFoundException("Case not found");

        var maxSizeBytes = _attachmentOptions.MaxFileSizeBytes > 0 ? _attachmentOptions.MaxFileSizeBytes : 25 * 1024 * 1024;
        if (file.Length > maxSizeBytes)
            throw new ArgumentException($"File size ({file.Length / (1024 * 1024)} MB) exceeds allowed limit of {maxSizeBytes / (1024 * 1024)} MB.");

        var rawFileName = System.IO.Path.GetFileName(file.FileName);
        if (string.IsNullOrWhiteSpace(rawFileName))
            throw new ArgumentException("Invalid file name.");

        var ext = System.IO.Path.GetExtension(rawFileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(ext))
            throw new ArgumentException("Files without an extension are not permitted.");

        var dangerousExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".exe", ".bat", ".cmd", ".sh", ".bash", ".dll", ".so", ".dylib", ".vbs", ".ps1", ".jar", ".com", ".scr", ".msi", ".pif", ".application", ".gadget", ".hta", ".cpl", ".msc", ".msp"
        };
        if (dangerousExtensions.Contains(ext))
            throw new ArgumentException($"File extension '{ext}' is forbidden for security reasons.");

        var allowedExtensions = _attachmentOptions.GetAllowedExtensionSet();
        if (allowedExtensions.Count > 0 && !allowedExtensions.Contains(ext))
            throw new ArgumentException($"File type '{ext}' is not permitted. Allowed extensions: {_attachmentOptions.AllowedExtensions}");

        var safeStoredFileName = $"{Guid.NewGuid()}{ext}";

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

    private async Task<int> GetFirstResponseTargetMinutesAsync(string severity)
    {
        try
        {
            var slaConfigs = await _settingsService.GetSlaConfigurationsAsync();
            var matched = slaConfigs.FirstOrDefault(s => s.Severity.Equals(severity, StringComparison.OrdinalIgnoreCase));
            if (matched != null && matched.FirstResponseMinutes > 0) return matched.FirstResponseMinutes;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CaseService FirstResponseLookup Error] {ex.Message}");
        }

        return severity.ToLowerInvariant() switch
        {
            "critical" => 30,
            "high" => 60,
            "medium" => 240,
            "low" => 480,
            _ => 240
        };
    }

    private async Task<User?> ResolveEscalationTargetAsync(Case c, int targetLevel)
    {
        var allUsers = await _context.Users.Include(u => u.Department).ToListAsync();

        if (targetLevel == 1)
        {
            return c.Owner ?? allUsers.FirstOrDefault(u => u.Id == c.OwnerId);
        }

        if (targetLevel == 2)
        {
            // Level 2: Team Lead
            // 1. Department lead
            var deptLead = allUsers.FirstOrDefault(u =>
                u.DepartmentId == c.DepartmentId &&
                (u.Role.Contains("Team Lead", StringComparison.OrdinalIgnoreCase) ||
                 u.Role.Contains("Lead", StringComparison.OrdinalIgnoreCase)) &&
                u.Id != c.OwnerId);

            if (deptLead != null) return deptLead;

            // 2. Department Owner
            var dept = await _context.Departments.FirstOrDefaultAsync(d => d.Id == c.DepartmentId);
            if (dept?.OwnerId != null && dept.OwnerId != c.OwnerId)
            {
                var owner = allUsers.FirstOrDefault(u => u.Id == dept.OwnerId);
                if (owner != null) return owner;
            }

            // 3. Fallback: Any active Team Lead
            return allUsers.FirstOrDefault(u =>
                (u.Role.Contains("Team Lead", StringComparison.OrdinalIgnoreCase) ||
                 u.Role.Contains("Lead", StringComparison.OrdinalIgnoreCase)) &&
                u.Id != c.OwnerId)
                ?? allUsers.FirstOrDefault(u => u.Role.Contains("Lead", StringComparison.OrdinalIgnoreCase));
        }

        if (targetLevel == 3)
        {
            // Level 3: CX Supervisor
            var supervisor = allUsers.FirstOrDefault(u =>
                u.DepartmentId == c.DepartmentId &&
                u.Role.Contains("Supervisor", StringComparison.OrdinalIgnoreCase) &&
                u.Id != c.OwnerId);

            if (supervisor != null) return supervisor;

            return allUsers.FirstOrDefault(u =>
                u.Role.Contains("Supervisor", StringComparison.OrdinalIgnoreCase) &&
                u.Id != c.OwnerId)
                ?? allUsers.FirstOrDefault(u => u.Role.Contains("Supervisor", StringComparison.OrdinalIgnoreCase));
        }

        if (targetLevel == 4)
        {
            // Level 4: Head of Customer Experience
            var headOfCx = allUsers.FirstOrDefault(u =>
                (u.Role.Contains("Head of Customer Experience", StringComparison.OrdinalIgnoreCase) ||
                 u.Role.Contains("Head of CX", StringComparison.OrdinalIgnoreCase) ||
                 u.Role.Contains("Head", StringComparison.OrdinalIgnoreCase)) &&
                u.Id != c.OwnerId);

            if (headOfCx != null) return headOfCx;

            return allUsers.FirstOrDefault(u =>
                u.Role.Contains("Head", StringComparison.OrdinalIgnoreCase));
        }

        return null;
    }

    public async Task EscalateCaseAsync(Guid caseId, EscalateCaseDto dto, Guid userId)
    {
        var existingCase = await _context.Cases
            .Include(c => c.Department)
            .Include(c => c.Owner)
            .FirstOrDefaultAsync(c => c.Id == caseId);

        if (existingCase == null) throw new ArgumentException("Case not found.");

        if (existingCase.Status == CaseStatus.Resolved || existingCase.Status == CaseStatus.Closed || existingCase.Status == CaseStatus.Cancelled)
            throw new InvalidOperationException($"Cannot escalate a case in '{existingCase.Status}' status.");

        if (string.IsNullOrWhiteSpace(dto.Reason))
            throw new ArgumentException("An escalation reason is required for manual escalation.");

        // Determine current escalation level
        int currentLevel = existingCase.EscalationLevel > 0 ? existingCase.EscalationLevel : 1;

        // Query maximum configured escalation level from database
        var allLevels = await _context.EscalationLevelConfigs.OrderBy(l => l.LevelNumber).ToListAsync();
        int maxLevel = allLevels.Count > 0 ? allLevels.Max(l => l.LevelNumber) : 4;

        if (currentLevel >= maxLevel)
        {
            var maxLevelName = allLevels.FirstOrDefault(l => l.LevelNumber == maxLevel)?.Name ?? $"Level {maxLevel}";
            throw new InvalidOperationException($"Case has reached the maximum escalation level ({maxLevelName}) and cannot be escalated further.");
        }

        int nextLevel = currentLevel + 1;
        var nextConfig = allLevels.FirstOrDefault(l => l.LevelNumber == nextLevel);

        User? targetUser = null;
        if (dto.TargetUserId.HasValue)
        {
            targetUser = await _context.Users.FirstOrDefaultAsync(u => u.Id == dto.TargetUserId.Value);
        }

        if (targetUser == null && _slaRoutingService != null)
        {
            targetUser = await _slaRoutingService.ResolveNextEscalationTargetAsync(existingCase, nextLevel);
        }

        if (targetUser == null)
        {
            targetUser = await ResolveEscalationTargetAsync(existingCase, nextLevel);
        }

        if (targetUser == null)
        {
            targetUser = await _context.Users.FirstOrDefaultAsync(u => u.Role.ToLower().Contains("supervisor") || u.Role.ToLower().Contains("lead"))
                         ?? await _context.Users.FirstOrDefaultAsync();
        }

        if (targetUser == null)
        {
            throw new InvalidOperationException("No active user found for escalation target.");
        }

        var oldOwnerName = existingCase.Owner?.Name ?? "Agent";
        bool shouldReassign = nextConfig == null || nextConfig.ReassignOwner;
        if (shouldReassign)
        {
            existingCase.OwnerId = targetUser.Id;
        }

        existingCase.EscalationLevel = nextLevel;
        existingCase.Status = CaseStatus.Escalated;
        if (nextLevel >= 2) existingCase.Sla90Escalated = true;
        if (nextLevel >= 3) existingCase.SlaBreachedEscalated = true;
        if (nextLevel >= 4) existingCase.Sla12hBreachedEscalated = true;

        if (existingCase.SlaPausedAt.HasValue && existingCase.Status != CaseStatus.WaitingOnCustomer)
        {
            var pausedMinutes = (int)Math.Max(0, Math.Round((DateTime.UtcNow - existingCase.SlaPausedAt.Value).TotalMinutes));
            existingCase.SlaTotalPausedMinutes += pausedMinutes;
            existingCase.SlaPausedAt = null;
        }

        var nextLevelName = nextConfig?.Name ?? $"Level {nextLevel}";
        var targetRoleName = nextConfig?.TargetRole ?? "Escalation Manager";
        var reasonText = dto.Reason.Trim();
        var noteText = !string.IsNullOrWhiteSpace(dto.Note) ? $" Note: {dto.Note.Trim()}" : "";
        var message = $"[Manual Escalation] Case escalated to {nextLevelName} ({targetRoleName}: {targetUser.Name}) from {oldOwnerName}. Reason: {reasonText}.{noteText}";

        var currentUser = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);

        var caseEvent = new CaseEvent
        {
            CaseId = caseId,
            EventType = EventType.Escalate,
            Message = message,
            CreatedAt = DateTime.UtcNow,
            UserId = userId
        };

        await ExecuteInTransactionAsync(async () =>
        {
            await _context.SaveChangesAsync();
            await _caseRepository.AddEventAsync(caseEvent);
        });

        try
        {
            await _notificationService.CreateNotificationAsync(
                targetUser.Id,
                "CASE_ESCALATED",
                $"Case Escalated ({nextLevelName})",
                $"Case {existingCase.CaseNumber} has been escalated to you by {currentUser?.Name ?? "User"}. Reason: {reasonText}",
                existingCase.Id,
                existingCase.CaseNumber,
                "Critical"
            );
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Escalate Notification Error] {ex.Message}");
        }
    }

    /// <summary>
    /// SLA monitoring and evaluation. Evaluates active cases against configured SLA thresholds,
    /// marks breaches, sends reminder notifications, and triggers automatic escalations when configured.
    /// </summary>
    public async Task EvaluateSlaEscalationsAsync(Guid? caseId = null, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var escalationLevels = await _context.EscalationLevelConfigs.OrderBy(l => l.LevelNumber).ToListAsync(ct);
        int maxLevel = escalationLevels.Count > 0 ? escalationLevels.Max(l => l.LevelNumber) : 4;

        var query = _context.Cases
            .Include(c => c.Owner)
            .Where(c => c.Status != CaseStatus.Resolved && c.Status != CaseStatus.Closed && c.Status != CaseStatus.Cancelled);

        if (caseId.HasValue)
        {
            query = query.Where(c => c.Id == caseId.Value);
        }
        else
        {
            query = query.Where(c => !c.Sla70ReminderSent
                                  || c.SlaBreachedAt == null
                                  || (c.FirstResponseActualAt == null && c.FirstResponseDueAt != null && c.FirstResponseStatus != "Breached")
                                  || c.EscalationLevel < maxLevel);
        }

        var cases = await query.ToListAsync(ct);
        if (cases.Count == 0) return;

        var reminders = new List<Case>();
        var autoEscalations = new List<(Guid targetUserId, Guid caseId, string caseNumber, string levelName, string reason)>();

        foreach (var c in cases)
        {
            // 1. Paused minutes (Waiting on Customer stops the clock)
            int totalPaused = c.SlaTotalPausedMinutes;
            if (c.Status == CaseStatus.WaitingOnCustomer && c.SlaPausedAt.HasValue)
            {
                totalPaused += (int)Math.Max(0, (now - c.SlaPausedAt.Value).TotalMinutes);
            }

            // 2. First response breach
            if (!c.FirstResponseActualAt.HasValue && c.FirstResponseDueAt.HasValue && c.FirstResponseStatus != "Breached")
            {
                var effectiveFrDue = c.FirstResponseDueAt.Value.AddMinutes(totalPaused);
                if (now > effectiveFrDue)
                {
                    c.FirstResponseStatus = "Breached";
                }
            }

            // 3. Resolution SLA consumption
            double totalTargetMinutes = c.InternalResolutionTargetMinutes > 0
                ? c.InternalResolutionTargetMinutes
                : Math.Max(1, c.SlaTargetHours * 60);

            DateTime? effectiveResolutionDue = c.InternalResolutionDueAt ?? (c.SlaStartTime.AddMinutes(totalTargetMinutes).AddMinutes(totalPaused));
            bool isResolutionBreached = (effectiveResolutionDue.HasValue && now >= effectiveResolutionDue.Value) || c.SlaBreachedAt.HasValue;

            if (isResolutionBreached && !c.SlaBreachedAt.HasValue)
            {
                c.SlaBreachedAt = effectiveResolutionDue ?? now;
            }

            double elapsedMinutes = Math.Max(0, (now - c.SlaStartTime).TotalMinutes - totalPaused);
            double consumptionPercent = (elapsedMinutes / totalTargetMinutes) * 100.0;

            if (consumptionPercent >= 70.0 && !c.Sla70ReminderSent)
            {
                c.Sla70ReminderSent = true;
                reminders.Add(c);
            }

            // 4. Automatic Escalation Evaluation against dynamic EscalationLevelConfigs
            int currentLevel = c.EscalationLevel > 0 ? c.EscalationLevel : 1;
            var nextEligibleConfigs = escalationLevels
                .Where(l => l.LevelNumber > currentLevel)
                .OrderBy(l => l.LevelNumber)
                .ToList();

            foreach (var nextCfg in nextEligibleConfigs)
            {
                if (string.Equals(nextCfg.TriggerType, "ManualOnly", StringComparison.OrdinalIgnoreCase))
                {
                    continue; // Skip manual-only levels during automated worker run
                }

                bool triggerMet = false;
                string triggerReason = "";

                if (string.Equals(nextCfg.TriggerType, "SlaPercentage", StringComparison.OrdinalIgnoreCase))
                {
                    double threshold = (double)(nextCfg.TriggerValue ?? 70m);
                    if (consumptionPercent >= threshold)
                    {
                        triggerMet = true;
                        triggerReason = $"SLA consumption reached {Math.Round(consumptionPercent, 1)}% (Threshold: {threshold}%)";
                    }
                }
                else if (string.Equals(nextCfg.TriggerType, "SlaBreached", StringComparison.OrdinalIgnoreCase))
                {
                    if (isResolutionBreached)
                    {
                        triggerMet = true;
                        triggerReason = "Resolution SLA breached";
                    }
                }
                else if (string.Equals(nextCfg.TriggerType, "SlaPostBreachHours", StringComparison.OrdinalIgnoreCase))
                {
                    double postHours = (double)(nextCfg.TriggerValue ?? 12m);
                    if (c.SlaBreachedAt.HasValue && now >= c.SlaBreachedAt.Value.AddHours(postHours))
                    {
                        triggerMet = true;
                        triggerReason = $"Resolution SLA breached for more than {postHours} hours";
                    }
                }

                if (triggerMet)
                {
                    var oldOwnerName = c.Owner?.Name ?? "Agent";
                    c.EscalationLevel = nextCfg.LevelNumber;
                    c.Status = CaseStatus.Escalated;
                    if (nextCfg.LevelNumber >= 2) c.Sla90Escalated = true;
                    if (nextCfg.LevelNumber >= 3) c.SlaBreachedEscalated = true;
                    if (nextCfg.LevelNumber >= 4) c.Sla12hBreachedEscalated = true;

                    User? targetUser = _slaRoutingService != null
                        ? await _slaRoutingService.ResolveNextEscalationTargetAsync(c, nextCfg.LevelNumber, ct)
                        : null;
                    targetUser ??= await ResolveEscalationTargetAsync(c, nextCfg.LevelNumber);

                    if (targetUser != null && nextCfg.ReassignOwner)
                    {
                        c.OwnerId = targetUser.Id;
                    }

                    var autoMsg = $"[Automatic Escalation] Escalated to {nextCfg.Name} ({nextCfg.TargetRole}{(targetUser != null ? ": " + targetUser.Name : "")}) from {oldOwnerName}. Trigger: {triggerReason}. Action: {nextCfg.ActionDescription}";

                    _context.CaseEvents.Add(new CaseEvent
                    {
                        CaseId = c.Id,
                        EventType = EventType.Escalate,
                        Message = autoMsg,
                        IsInternal = true,
                        CreatedAt = now,
                        UserId = targetUser?.Id ?? c.OwnerId
                    });

                    if (targetUser != null)
                    {
                        autoEscalations.Add((targetUser.Id, c.Id, c.CaseNumber, nextCfg.Name, triggerReason));
                    }
                    break; // Progress one level per evaluation cycle
                }
            }
        }

        if (reminders.Count > 0)
        {
            var ownerIds = reminders.Select(r => r.OwnerId).Distinct().ToList();
            var ownerNames = await _context.Users.AsNoTracking()
                .Where(u => ownerIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => u.Name, ct);

            foreach (var c in reminders)
            {
                var ownerName = ownerNames.TryGetValue(c.OwnerId, out var foundName) ? foundName : "Agent";
                _context.CaseEvents.Add(new CaseEvent
                {
                    CaseId = c.Id,
                    EventType = EventType.Note,
                    Message = $"SLA reached 70% — reminder sent to assigned agent ({ownerName}).",
                    IsInternal = true,
                    CreatedAt = now,
                    UserId = c.OwnerId
                });
            }
        }

        await _context.SaveChangesAsync(ct);

        foreach (var c in reminders)
        {
            try
            {
                await _notificationService.CreateNotificationAsync(
                    c.OwnerId,
                    "SLA_REMINDER_70",
                    "SLA 70% Consumed",
                    $"SLA has reached 70% consumption for Case {c.CaseNumber} ({c.Title}). Please take the required action before SLA breach.",
                    c.Id,
                    c.CaseNumber,
                    "Medium",
                    0,
                    ct
                );
            }
            catch (Exception ex) { Console.WriteLine($"[SLA 70% Reminder Error] {ex.Message}"); }
        }

        foreach (var item in autoEscalations)
        {
            try
            {
                await _notificationService.CreateNotificationAsync(
                    item.targetUserId,
                    "CASE_AUTOMATICALLY_ESCALATED",
                    $"Automatic Escalation ({item.levelName})",
                    $"Case {item.caseNumber} has been automatically escalated to you. Trigger: {item.reason}",
                    item.caseId,
                    item.caseNumber,
                    "Critical",
                    0,
                    ct
                );
            }
            catch (Exception ex) { Console.WriteLine($"[Auto-Escalate Notification Error] {ex.Message}"); }
        }
    }

    public async Task<EscalationMatrixResponseDto> GetEscalationMatrixConfigAsync(Guid? caseId = null, CancellationToken ct = default)
    {
        Case? c = null;
        if (caseId.HasValue)
        {
            c = await _context.Cases
                .Include(x => x.Department)
                .Include(x => x.Owner)
                .FirstOrDefaultAsync(x => x.Id == caseId.Value, ct);
        }

        var dbLevels = await _context.EscalationLevelConfigs
            .Include(l => l.TargetUser)
            .OrderBy(l => l.LevelNumber)
            .ToListAsync(ct);

        int currentLevel = c != null && c.EscalationLevel > 0 ? c.EscalationLevel : 1;
        int maxLevel = dbLevels.Count > 0 ? dbLevels.Max(l => l.LevelNumber) : 4;
        int? nextLevel = currentLevel < maxLevel ? currentLevel + 1 : null;

        var nextConfig = nextLevel.HasValue ? dbLevels.FirstOrDefault(l => l.LevelNumber == nextLevel.Value) : null;
        User? nextUser = null;
        if (nextLevel.HasValue && c != null && _slaRoutingService != null)
        {
            nextUser = await _slaRoutingService.ResolveNextEscalationTargetAsync(c, nextLevel.Value, ct);
        }

        var levelDtos = new List<EscalationMatrixLevelDto>();
        foreach (var lvl in dbLevels)
        {
            User? targetUser = null;
            if (c != null && _slaRoutingService != null)
            {
                targetUser = await _slaRoutingService.ResolveNextEscalationTargetAsync(c, lvl.LevelNumber, ct);
            }
            targetUser ??= lvl.TargetUser;

            levelDtos.Add(new EscalationMatrixLevelDto
            {
                Level = lvl.LevelNumber,
                Name = lvl.Name,
                Role = lvl.TargetRole,
                Trigger = lvl.TriggerDescription,
                Action = lvl.ActionDescription,
                CurrentTargetUserName = targetUser?.Name,
                CurrentTargetUserId = targetUser?.Id
            });
        }

        return new EscalationMatrixResponseDto
        {
            Title = "Escalation Matrix",
            Subtitle = "Sequential escalation architecture with dynamic database configuration, audit logs, and automatic/manual routing.",
            CurrentLevel = currentLevel,
            NextLevel = nextLevel,
            NextTargetRole = nextConfig?.TargetRole,
            NextTargetUserName = nextUser?.Name,
            NextTargetUserId = nextUser?.Id,
            Levels = levelDtos
        };
    }

    // ======================== STATUS TRANSITION VALIDATION ========================

    /// <summary>
    /// Defines the approved status transitions. Resolved is only reachable through
    /// ResolveCaseAsync. Escalated is only reachable through EscalateCaseAsync.
    /// </summary>
    private static readonly Dictionary<CaseStatus, CaseStatus[]> AllowedTransitions = new()
    {
        [CaseStatus.Open] = new[] { CaseStatus.InProgress, CaseStatus.WaitingOnCustomer },
        [CaseStatus.InProgress] = new[] { CaseStatus.Open, CaseStatus.WaitingOnCustomer },
        [CaseStatus.WaitingOnCustomer] = new[] { CaseStatus.Open, CaseStatus.InProgress },
        [CaseStatus.Escalated] = new[] { CaseStatus.Open, CaseStatus.InProgress, CaseStatus.WaitingOnCustomer },
        // Resolved and Closed are terminal via their dedicated workflows
        [CaseStatus.Resolved] = Array.Empty<CaseStatus>(),
        [CaseStatus.Closed] = Array.Empty<CaseStatus>(),
        [CaseStatus.Cancelled] = Array.Empty<CaseStatus>(),
    };

    public static bool IsValidTransition(CaseStatus from, CaseStatus to)
    {
        if (AllowedTransitions.TryGetValue(from, out var allowed))
            return allowed.Contains(to);
        return false;
    }

    public static IEnumerable<string> GetAllowedTransitions(CaseStatus from)
    {
        if (AllowedTransitions.TryGetValue(from, out var allowed))
            return allowed.Select(s => s.ToString());
        return Enumerable.Empty<string>();
    }

    // ======================== DASHBOARD SUMMARY ========================

    public async Task<DashboardSummaryDto> GetDashboardSummaryAsync(
        Guid? departmentId, string? caseType, string? status, string? severity,
        string? dateRange, string? customStartDate, string? customEndDate,
        Guid? myCasesUserId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;

        // Build base filtered query without heavy includes
        IQueryable<Case> query = _context.Cases.AsNoTracking();

        if (departmentId.HasValue)
            query = query.Where(c => c.DepartmentId == departmentId.Value);

        if (!string.IsNullOrWhiteSpace(caseType))
            query = query.Where(c => c.CaseType == caseType);

        if (!string.IsNullOrWhiteSpace(status))
        {
            if (Enum.TryParse<CaseStatus>(status.Replace(" ", "").Replace("_", ""), true, out var cs))
                query = query.Where(c => c.Status == cs);
        }

        if (!string.IsNullOrWhiteSpace(severity))
            query = query.Where(c => c.Severity == severity);

        if (myCasesUserId.HasValue)
            query = query.Where(c => c.OwnerId == myCasesUserId.Value);

        // Date range filtering
        if (!string.IsNullOrWhiteSpace(dateRange) && dateRange != "all")
        {
            DateTime? start = null, end = null;
            switch (dateRange)
            {
                case "today":
                    start = now.Date;
                    break;
                case "this_week":
                    var dayOfWeek = ((int)now.DayOfWeek + 6) % 7; // Monday = 0
                    start = now.Date.AddDays(-dayOfWeek);
                    break;
                case "this_month":
                    start = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                    break;
                case "this_quarter":
                    var qMonth = ((now.Month - 1) / 3) * 3 + 1;
                    start = new DateTime(now.Year, qMonth, 1, 0, 0, 0, DateTimeKind.Utc);
                    break;
                case "this_year":
                    start = new DateTime(now.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                    break;
                case "custom":
                    if (DateTime.TryParse(customStartDate, out var cs2))
                        start = DateTime.SpecifyKind(cs2.Date, DateTimeKind.Utc);
                    if (DateTime.TryParse(customEndDate, out var ce))
                        end = DateTime.SpecifyKind(ce.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);
                    break;
            }
            if (start.HasValue) query = query.Where(c => c.CreatedAt >= start.Value);
            if (end.HasValue) query = query.Where(c => c.CreatedAt <= end.Value);
        }

        // Database aggregations — do not load all rows into memory
        var emptyGuid = Guid.Empty;
        var totalCount = await query.CountAsync(ct);
        var statusCounts = await query.GroupBy(c => c.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var severityCounts = await query.GroupBy(c => c.Severity)
            .Select(g => new { Severity = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var unassignedCount = await query.CountAsync(c => c.OwnerId == emptyGuid, ct);

        var result = new DashboardSummaryDto
        {
            TotalCases = totalCount,
            OpenCases = statusCounts.FirstOrDefault(s => s.Status == CaseStatus.Open)?.Count ?? 0,
            InProgressCases = statusCounts.FirstOrDefault(s => s.Status == CaseStatus.InProgress)?.Count ?? 0,
            WaitingOnCustomerCases = statusCounts.FirstOrDefault(s => s.Status == CaseStatus.WaitingOnCustomer)?.Count ?? 0,
            EscalatedCases = statusCounts.FirstOrDefault(s => s.Status == CaseStatus.Escalated)?.Count ?? 0,
            ResolvedCases = statusCounts.FirstOrDefault(s => s.Status == CaseStatus.Resolved)?.Count ?? 0,
            UnassignedCases = unassignedCount,
            CriticalCases = severityCounts.FirstOrDefault(s => s.Severity == "Critical")?.Count ?? 0,
            HighCases = severityCounts.FirstOrDefault(s => s.Severity == "High")?.Count ?? 0,
            MediumCases = severityCounts.FirstOrDefault(s => s.Severity == "Medium")?.Count ?? 0,
            LowCases = severityCounts.FirstOrDefault(s => s.Severity == "Low")?.Count ?? 0,
        };

        // SLA calculations: fetch only lightweight scalar columns without joins
        var slaRows = await query.Select(c => new
        {
            c.SlaStartTime,
            c.SlaTargetHours,
            c.SlaTotalPausedMinutes,
            c.Status,
            c.ResolvedAt
        }).ToListAsync(ct);

        int breached = 0;
        int atRisk = 0;
        foreach (var c in slaRows)
        {
            var slaStart = c.SlaStartTime;
            var targetMs = c.SlaTargetHours * 3600.0 * 1000;
            var pausedMs = c.SlaTotalPausedMinutes * 60.0 * 1000;
            var effectiveDeadline = slaStart.AddMilliseconds(targetMs + pausedMs);
            var isResolved = c.Status == CaseStatus.Resolved;
            var checkTime = isResolved && c.ResolvedAt.HasValue ? c.ResolvedAt.Value : now;

            if (checkTime > effectiveDeadline)
                breached++;
            else if (!isResolved && (effectiveDeadline - now).TotalHours < 2)
                atRisk++;
        }
        result.SlaBreachedCases = breached;
        result.SlaAtRiskCases = atRisk;
        result.SlaHealthyCases = Math.Max(0, result.TotalCases - breached - atRisk);
        result.SlaAdherencePercent = result.TotalCases > 0
            ? Math.Round((decimal)(result.TotalCases - breached) / result.TotalCases * 100, 1)
            : 100;

        // Department breakdown via SQL GroupBy
        result.CasesByDepartment = await query
            .GroupBy(c => new { c.DepartmentId, Name = c.Department != null ? c.Department.Name : "General" })
            .Select(g => new DepartmentCaseCount
            {
                DepartmentId = g.Key.DepartmentId,
                DepartmentName = g.Key.Name,
                Count = g.Count()
            })
            .OrderByDescending(d => d.Count)
            .ToListAsync(ct);

        // Case type breakdown via SQL GroupBy
        result.CasesByType = await query
            .GroupBy(c => c.CaseType)
            .Select(g => new CaseTypeCaseCount
            {
                CaseType = g.Key ?? "Complaint",
                Count = g.Count()
            })
            .OrderByDescending(t => t.Count)
            .ToListAsync(ct);

        // Resolved over time: Daily (last 7 days)
        var sevenDaysAgo = now.Date.AddDays(-6);
        var resolvedDates = await query
            .Where(c => c.Status == CaseStatus.Resolved && c.ResolvedAt >= sevenDaysAgo)
            .Select(c => c.ResolvedAt!.Value)
            .ToListAsync(ct);

        for (int i = 6; i >= 0; i--)
        {
            var day = now.Date.AddDays(-i);
            result.ResolvedDaily.Add(new ResolvedTimePoint
            {
                Label = day.ToString("MMM d"),
                Count = resolvedDates.Count(d => d.Date == day)
            });
        }

        // Weekly (last 4 weeks)
        var fourWeeksAgo = now.Date.AddDays(-28);
        var resolvedMonthDates = await query
            .Where(c => c.Status == CaseStatus.Resolved && c.ResolvedAt >= fourWeeksAgo)
            .Select(c => c.ResolvedAt!.Value)
            .ToListAsync(ct);

        for (int i = 3; i >= 0; i--)
        {
            var weekStart = now.Date.AddDays(-((int)now.DayOfWeek == 0 ? 6 : (int)now.DayOfWeek - 1) - i * 7);
            var weekEnd = weekStart.AddDays(7);
            result.ResolvedWeekly.Add(new ResolvedTimePoint
            {
                Label = $"Wk {4 - i}",
                Count = resolvedMonthDates.Count(d => d >= weekStart && d < weekEnd)
            });
        }

        // Monthly (last 6 months)
        var sixMonthsAgo = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-5);
        var resolvedSixMonthDates = await query
            .Where(c => c.Status == CaseStatus.Resolved && c.ResolvedAt >= sixMonthsAgo)
            .Select(c => c.ResolvedAt!.Value)
            .ToListAsync(ct);

        for (int i = 5; i >= 0; i--)
        {
            var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-i);
            var monthEnd = monthStart.AddMonths(1);
            result.ResolvedMonthly.Add(new ResolvedTimePoint
            {
                Label = monthStart.ToString("MMM"),
                Count = resolvedSixMonthDates.Count(d => d >= monthStart && d < monthEnd)
            });
        }

        // Attention cases: SLA breached, at-risk, critical/high, unassigned — top 20 direct from DB
        result.AttentionCases = await query
            .Where(c => c.Status != CaseStatus.Resolved && c.Status != CaseStatus.Closed && c.Status != CaseStatus.Cancelled)
            .OrderByDescending(c => c.Severity == "Critical")
            .ThenByDescending(c => c.Severity == "High")
            .ThenBy(c => c.SlaStartTime)
            .Take(20)
            .Select(c => new AttentionCaseSummary
            {
                Id = c.Id,
                CaseNumber = c.CaseNumber,
                Title = c.Title,
                Status = c.Status.ToString(),
                Severity = c.Severity,
                OwnerName = c.Owner != null ? c.Owner.Name : string.Empty,
                OwnerId = c.OwnerId,
                DepartmentName = c.Department != null ? c.Department.Name : string.Empty,
                SlaStartTime = c.SlaStartTime,
                SlaTargetHours = c.SlaTargetHours,
                SlaBreachedAt = c.SlaBreachedAt,
                SlaPausedAt = c.SlaPausedAt,
                SlaTotalPausedMinutes = c.SlaTotalPausedMinutes,
                CustomerName = c.Customer != null ? c.Customer.FullName : string.Empty,
                CreatedAt = c.CreatedAt
            })
            .ToListAsync(ct);

        // Recent cases: top 15 most recent cases direct from DB
        result.RecentCases = await query
            .OrderByDescending(c => c.CreatedAt)
            .Take(15)
            .Select(c => new AttentionCaseSummary
            {
                Id = c.Id,
                CaseNumber = c.CaseNumber,
                Title = c.Title,
                Status = c.Status.ToString(),
                Severity = c.Severity,
                OwnerName = c.Owner != null ? c.Owner.Name : string.Empty,
                OwnerId = c.OwnerId,
                DepartmentName = c.Department != null ? c.Department.Name : string.Empty,
                SlaStartTime = c.SlaStartTime,
                SlaTargetHours = c.SlaTargetHours,
                SlaBreachedAt = c.SlaBreachedAt,
                SlaPausedAt = c.SlaPausedAt,
                SlaTotalPausedMinutes = c.SlaTotalPausedMinutes,
                CustomerName = c.Customer != null ? c.Customer.FullName : string.Empty,
                CreatedAt = c.CreatedAt
            })
            .ToListAsync(ct);

        // Recent activity: latest 15 events direct from DB
        result.RecentActivities = await _context.CaseEvents
            .AsNoTracking()
            .Include(e => e.Case)
            .Include(e => e.User)
            .OrderByDescending(e => e.CreatedAt)
            .Take(15)
            .Select(e => new RecentActivityItem
            {
                Id = $"act-{e.Id}",
                Type = e.EventType.ToString().ToLower(),
                Title = $"Case {(e.Case != null ? e.Case.CaseNumber : "")} {e.EventType}",
                Sub = $"{e.Message} · {(e.User != null ? e.User.Name : "System")}",
                CaseId = e.CaseId ?? Guid.Empty,
                Timestamp = e.CreatedAt
            })
            .ToListAsync(ct);

        return result;
    }

    // ======================== TIMELINE PAGINATION ========================

    public async Task<PagedResponseDto<CaseEventDto>> GetCaseTimelineEventsAsync(
        Guid caseId, DateTime? before, int limit = 50, CancellationToken ct = default)
    {
        var query = _context.CaseEvents
            .AsNoTracking()
            .Include(e => e.User)
            .Where(e => e.CaseId == caseId);

        if (before.HasValue)
            query = query.Where(e => e.CreatedAt < before.Value);

        var totalCount = await query.CountAsync(ct);

        var events = await query
            .OrderByDescending(e => e.CreatedAt)
            .Take(limit)
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
            })
            .ToListAsync(ct);

        return new PagedResponseDto<CaseEventDto>
        {
            Items = events,
            TotalCount = totalCount,
            Page = 1,
            PageSize = limit
        };
    }

    public async Task ValidateCreateCaseMetadataAsync(CreateCaseDto dto, CancellationToken ct = default)
    {
        // System invariants: CustomerId and DepartmentId are essential database relationships
        if (dto.CustomerId == Guid.Empty)
            throw new ArgumentException("A valid customer must be selected.");
        if (dto.DepartmentId == Guid.Empty)
            throw new ArgumentException("A valid department must be selected.");

        var configs = await _context.FieldConfigurations
            .AsNoTracking()
            .Where(f => f.ModuleKey == "CaseManagement" && f.SectionKey == "CreateCase")
            .ToListAsync(ct);

        if (!configs.Any()) return;

        foreach (var cfg in configs)
        {
            if (!cfg.IsVisible) continue; // Skip hidden fields

            string? val = cfg.ApiField.ToLowerInvariant() switch
            {
                "casetype" => dto.CaseType,
                "title" => dto.Title,
                "description" => dto.Description,
                "subcategory" => dto.Subcategory,
                "preferredlanguage" => dto.PreferredLanguage,
                "communicationchannel" => dto.CommunicationChannel,
                "preferredcommunicationchannel" => dto.PreferredCommunicationChannel,
                "sourcechannel" => dto.SourceChannel,
                "severity" => dto.Severity,
                "selectcustomer" => dto.CustomerId != Guid.Empty ? dto.CustomerId.ToString() : null,
                "departmentid" => dto.DepartmentId != Guid.Empty ? dto.DepartmentId.ToString() : null,
                _ => null
            };

            var strVal = val?.Trim();

            // 1. Mandatory check
            if (cfg.IsRequired && string.IsNullOrEmpty(strVal))
            {
                throw new ArgumentException($"{cfg.DisplayLabel} is required.");
            }

            if (!string.IsNullOrEmpty(strVal))
            {
                // 2. MinLength check
                if (cfg.MinLength.HasValue && strVal.Length < cfg.MinLength.Value)
                {
                    throw new ArgumentException($"{cfg.DisplayLabel} must be at least {cfg.MinLength.Value} characters.");
                }

                // 3. MaxLength check
                if (cfg.MaxLength.HasValue && strVal.Length > cfg.MaxLength.Value)
                {
                    throw new ArgumentException($"{cfg.DisplayLabel} cannot exceed {cfg.MaxLength.Value} characters.");
                }

                // 4. Regex check
                if (!string.IsNullOrWhiteSpace(cfg.ValidationRegex))
                {
                    try
                    {
                        var regex = new System.Text.RegularExpressions.Regex(cfg.ValidationRegex);
                        if (!regex.IsMatch(strVal))
                        {
                            throw new ArgumentException($"{cfg.DisplayLabel} format is invalid.");
                        }
                    }
                    catch (System.Text.RegularExpressions.RegexParseException)
                    {
                        // Ignore invalid regex in configuration
                    }
                }
            }
        }
    }
}
