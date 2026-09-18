namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

public class NotificationService : INotificationService
{
    private const int SeedNotificationCount = 12;
    private const int SeedUnreadCount = 3;

    private static DateTime _lastSlaCheckTime = DateTime.MinValue;
    private static readonly TimeSpan SlaCheckInterval = TimeSpan.FromMinutes(2);
    private static readonly object _slaLock = new();

    private const double SlaApproachingThresholdHours = 2;

    private readonly AppDbContext _context;

    public NotificationService(AppDbContext context)
    {
        _context = context;
    }

    public async Task CreateNotificationAsync(Guid recipientUserId, string type, string title, string message, Guid? caseId = null, string? caseNumber = null, string priority = "High", int reminderCount = 0, CancellationToken ct = default)
    {
        var cutoff = DateTime.UtcNow.AddMinutes(-5);
        var exists = await _context.Notifications.AnyAsync(n =>
            n.RecipientUserId == recipientUserId &&
            n.Type == type &&
            n.CaseId == caseId &&
            n.CreatedAt >= cutoff, ct);

        if (exists) return;

        var notification = new NotificationItem
        {
            Id = Guid.NewGuid(),
            RecipientUserId = recipientUserId,
            Type = type,
            Title = title,
            Message = message,
            CaseId = caseId,
            CaseNumber = caseNumber,
            IsRead = false,
            Priority = string.IsNullOrWhiteSpace(priority) ? "High" : priority,
            ReminderCount = reminderCount,
            CreatedAt = DateTime.UtcNow
        };

        _context.Notifications.Add(notification);
        await _context.SaveChangesAsync(ct);
    }

    public async Task<PagedResponseDto<NotificationDto>> GetNotificationsAsync(Guid userId, int page = 1, int pageSize = 15, CancellationToken ct = default)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 15;

        await EnsureSeedNotificationsForUserAsync(userId, ct);
        await CheckAndGenerateSlaNotificationsAsync(ct);

        var query = _context.Notifications
            .AsNoTracking()
            .Where(n => n.RecipientUserId == userId);

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new NotificationDto
            {
                Id = n.Id,
                RecipientUserId = n.RecipientUserId,
                Type = n.Type,
                Title = n.Title,
                Message = n.Message,
                CaseId = n.CaseId,
                CaseNumber = n.CaseNumber,
                IsRead = n.IsRead,
                Priority = n.Priority ?? "High",
                ReminderCount = n.ReminderCount,
                CreatedAt = n.CreatedAt,
                ReadAt = n.ReadAt
            })
            .ToListAsync(ct);

        return new PagedResponseDto<NotificationDto>
        {
            Items = items,
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        };
    }

    public async Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default)
    {
        return await _context.Notifications
            .AsNoTracking()
            .CountAsync(n => n.RecipientUserId == userId && !n.IsRead, ct);
    }

    public async Task MarkAsReadAsync(Guid notificationId, Guid userId, CancellationToken ct = default)
    {
        var item = await _context.Notifications.FirstOrDefaultAsync(n => n.Id == notificationId && n.RecipientUserId == userId, ct);
        if (item != null && !item.IsRead)
        {
            item.IsRead = true;
            item.ReadAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(ct);
        }
    }

    public async Task MarkAllAsReadAsync(Guid userId, CancellationToken ct = default)
    {
        var unreadItems = await _context.Notifications
            .Where(n => n.RecipientUserId == userId && !n.IsRead)
            .ToListAsync(ct);

        if (unreadItems.Any())
        {
            var now = DateTime.UtcNow;
            foreach (var item in unreadItems)
            {
                item.IsRead = true;
                item.ReadAt = now;
            }
            await _context.SaveChangesAsync(ct);
        }
    }

    public async Task DeleteNotificationAsync(Guid notificationId, Guid userId, CancellationToken ct = default)
    {
        var item = await _context.Notifications.FirstOrDefaultAsync(n => n.Id == notificationId && n.RecipientUserId == userId, ct);
        if (item != null)
        {
            _context.Notifications.Remove(item);
            await _context.SaveChangesAsync(ct);
        }
    }

    public async Task CheckAndGenerateSlaNotificationsAsync(CancellationToken ct = default)
    {
        lock (_slaLock)
        {
            if (DateTime.UtcNow - _lastSlaCheckTime < SlaCheckInterval)
            {
                return;
            }
            _lastSlaCheckTime = DateTime.UtcNow;
        }

        var now = DateTime.UtcNow;

        // Fetch rules
        await EnsureSeedNotificationRulesAsync(ct);

        var breachRule = await _context.NotificationRules.AsNoTracking().FirstOrDefaultAsync(r => r.EventType == "SLA_BREACHED", ct)
            ?? new NotificationRule { EventType = "SLA_BREACHED", IsEnabled = true, Priority = "High", CooldownMinutes = 60, MaxReminders = 3, EnableAggregation = true, AggregationThreshold = 3 };

        var approachingRule = await _context.NotificationRules.AsNoTracking().FirstOrDefaultAsync(r => r.EventType == "SLA_APPROACHING", ct)
            ?? new NotificationRule { EventType = "SLA_APPROACHING", IsEnabled = true, Priority = "Medium", CooldownMinutes = 120, MaxReminders = 2, EnableAggregation = true, AggregationThreshold = 3 };

        if (!breachRule.IsEnabled && !approachingRule.IsEnabled) return;

        var activeCases = await _context.Cases
            .AsNoTracking()
            .Where(c => c.Status != CaseStatus.Resolved && c.Status != CaseStatus.Closed)
            .Select(c => new SlaCandidate
            {
                Id = c.Id,
                CaseNumber = c.CaseNumber,
                Title = c.Title,
                OwnerId = c.OwnerId,
                SlaStartTime = c.SlaStartTime,
                SlaTargetHours = c.SlaTargetHours
            })
            .ToListAsync(ct);

        var dueBreaches = new List<SlaCandidate>();
        var dueApproaching = new List<SlaCandidate>();

        foreach (var c in activeCases)
        {
            var slaTargetTime = c.SlaStartTime.AddHours(c.SlaTargetHours);
            var remainingHours = (slaTargetTime - now).TotalHours;

            if (remainingHours <= 0 && breachRule.IsEnabled)
            {
                dueBreaches.Add(c);
            }
            else if (remainingHours > 0 && remainingHours <= SlaApproachingThresholdHours && approachingRule.IsEnabled)
            {
                dueApproaching.Add(c);
            }
        }

        var toInsert = new List<NotificationItem>();

        // Process SLA Breaches with Cooldown & Reminder Engine (Grouped Per Owner)
        if (dueBreaches.Any())
        {
            var breachCaseIds = dueBreaches.Select(b => b.Id).ToList();
            var existingNotifications = await _context.Notifications
                .AsNoTracking()
                .Where(n => n.CaseId.HasValue && breachCaseIds.Contains(n.CaseId.Value) && (n.Type == "SLA_BREACHED" || n.Type == "SLA_BREACH_REMINDER"))
                .ToListAsync(ct);

            // Map latest notification per case for the current SLA cycle
            var notifsByCase = dueBreaches.ToDictionary(
                c => c.Id,
                c => existingNotifications
                    .Where(n => n.CaseId == c.Id && n.CreatedAt >= c.SlaStartTime.AddMinutes(-1))
                    .OrderByDescending(n => n.CreatedAt)
                    .FirstOrDefault()
            );

            // Group breaches by OwnerId so each owner gets appropriate aggregated or individual notifications
            var breachesByOwner = dueBreaches.GroupBy(b => b.OwnerId);

            foreach (var ownerGroup in breachesByOwner)
            {
                var ownerId = ownerGroup.Key;
                var ownerBreaches = ownerGroup.ToList();
                var ownerNewlyBreached = ownerBreaches.Where(b => notifsByCase[b.Id] == null).ToList();

                if (breachRule.EnableAggregation && ownerNewlyBreached.Count >= breachRule.AggregationThreshold)
                {
                    // 1 Grouped notification for this owner's newly breached cases
                    var actualCount = ownerNewlyBreached.Count;
                    toInsert.Add(new NotificationItem
                    {
                        Id = Guid.NewGuid(),
                        RecipientUserId = ownerId,
                        Type = "SLA_BREACHED",
                        Title = $"{actualCount} Cases Breached SLA",
                        Message = $"{actualCount} active cases assigned to you have breached SLA. Click to inspect affected cases.",
                        CaseId = null,
                        CaseNumber = $"{actualCount} Cases",
                        Priority = breachRule.Priority,
                        IsRead = false,
                        CreatedAt = now
                    });

                    // Evaluate cooldown & reminder limits for existing breaches belonging to this owner
                    foreach (var c in ownerBreaches.Where(b => notifsByCase[b.Id] != null))
                    {
                        var latestNotif = notifsByCase[c.Id]!;
                        var minutesElapsed = (now - latestNotif.CreatedAt).TotalMinutes;
                        if (minutesElapsed >= breachRule.CooldownMinutes && latestNotif.ReminderCount < breachRule.MaxReminders)
                        {
                            var nextReminderCount = latestNotif.ReminderCount + 1;
                            toInsert.Add(new NotificationItem
                            {
                                Id = Guid.NewGuid(),
                                RecipientUserId = ownerId,
                                Type = "SLA_BREACH_REMINDER",
                                Title = "SLA Breach Reminder",
                                Message = $"Reminder ({nextReminderCount}/{breachRule.MaxReminders}): Case {c.CaseNumber} ({c.Title}) remains unresolved and is still outside its SLA.",
                                CaseId = c.Id,
                                CaseNumber = c.CaseNumber,
                                Priority = breachRule.Priority,
                                ReminderCount = nextReminderCount,
                                LastReminderAt = now,
                                IsRead = false,
                                CreatedAt = now
                            });
                        }
                    }
                }
                else
                {
                    // Individual breach or reminder notifications for each of this owner's cases
                    foreach (var c in ownerBreaches)
                    {
                        var latestNotif = notifsByCase[c.Id];
                        if (latestNotif == null)
                        {
                            // 1. Initial SLA Breach Notification
                            toInsert.Add(new NotificationItem
                            {
                                Id = Guid.NewGuid(),
                                RecipientUserId = ownerId,
                                Type = "SLA_BREACHED",
                                Title = "SLA Breached",
                                Message = $"Case {c.CaseNumber} ({c.Title}) has breached its SLA.",
                                CaseId = c.Id,
                                CaseNumber = c.CaseNumber,
                                Priority = breachRule.Priority,
                                ReminderCount = 0,
                                IsRead = false,
                                CreatedAt = now
                            });
                        }
                        else
                        {
                            // 2. Cooldown & Max Reminders Evaluation
                            var minutesElapsed = (now - latestNotif.CreatedAt).TotalMinutes;
                            if (minutesElapsed >= breachRule.CooldownMinutes && latestNotif.ReminderCount < breachRule.MaxReminders)
                            {
                                var nextReminderCount = latestNotif.ReminderCount + 1;
                                toInsert.Add(new NotificationItem
                                {
                                    Id = Guid.NewGuid(),
                                    RecipientUserId = ownerId,
                                    Type = "SLA_BREACH_REMINDER",
                                    Title = "SLA Breach Reminder",
                                    Message = $"Reminder ({nextReminderCount}/{breachRule.MaxReminders}): Case {c.CaseNumber} ({c.Title}) remains unresolved and is still outside its SLA.",
                                    CaseId = c.Id,
                                    CaseNumber = c.CaseNumber,
                                    Priority = breachRule.Priority,
                                    ReminderCount = nextReminderCount,
                                    LastReminderAt = now,
                                    IsRead = false,
                                    CreatedAt = now
                                });
                            }
                        }
                    }
                }
            }
        }

        // Process SLA Approaching Warnings
        if (dueApproaching.Any())
        {
            var approachingCaseIds = dueApproaching.Select(b => b.Id).ToList();
            var recentApproaching = await _context.Notifications
                .AsNoTracking()
                .Where(n => n.CaseId.HasValue && approachingCaseIds.Contains(n.CaseId.Value) && n.Type == "SLA_APPROACHING")
                .Select(n => n.CaseId!.Value)
                .ToListAsync(ct);

            var set = new HashSet<Guid>(recentApproaching);
            foreach (var c in dueApproaching)
            {
                if (set.Contains(c.Id)) continue;
                toInsert.Add(new NotificationItem
                {
                    Id = Guid.NewGuid(),
                    RecipientUserId = c.OwnerId,
                    Type = "SLA_APPROACHING",
                    Title = "SLA Approaching",
                    Message = $"Case {c.CaseNumber} is approaching its SLA deadline.",
                    CaseId = c.Id,
                    CaseNumber = c.CaseNumber,
                    Priority = approachingRule.Priority,
                    IsRead = false,
                    CreatedAt = now
                });
            }
        }

        if (toInsert.Count > 0)
        {
            _context.Notifications.AddRange(toInsert);
            await _context.SaveChangesAsync(ct);
        }
    }

    // Notification Rules Management Implementation
    public async Task<IEnumerable<NotificationRuleDto>> GetNotificationRulesAsync(CancellationToken ct = default)
    {
        await EnsureSeedNotificationRulesAsync(ct);

        var rules = await _context.NotificationRules
            .AsNoTracking()
            .OrderBy(r => r.Name)
            .ToListAsync(ct);

        return rules.Select(r => new NotificationRuleDto
        {
            Id = r.Id,
            EventType = r.EventType,
            Name = r.Name,
            IsEnabled = r.IsEnabled,
            Priority = r.Priority,
            CooldownMinutes = r.CooldownMinutes,
            MaxReminders = r.MaxReminders,
            EnableAggregation = r.EnableAggregation,
            AggregationThreshold = r.AggregationThreshold,
            CreatedAt = r.CreatedAt,
            UpdatedAt = r.UpdatedAt
        });
    }

    public async Task<NotificationRuleDto?> UpdateNotificationRuleAsync(Guid id, UpdateNotificationRuleDto dto, Guid userId, CancellationToken ct = default)
    {
        var rule = await _context.NotificationRules.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule == null) return null;

        var oldValue = $"Enabled={rule.IsEnabled}, Priority={rule.Priority}, Cooldown={rule.CooldownMinutes}m, Reminders={rule.MaxReminders}, Aggregation={rule.EnableAggregation} (Threshold: {rule.AggregationThreshold})";

        rule.IsEnabled = dto.IsEnabled;
        rule.Priority = string.IsNullOrWhiteSpace(dto.Priority) ? rule.Priority : dto.Priority.Trim();
        rule.CooldownMinutes = dto.CooldownMinutes < 0 ? 0 : dto.CooldownMinutes;
        rule.MaxReminders = dto.MaxReminders < 0 ? 0 : dto.MaxReminders;
        rule.EnableAggregation = dto.EnableAggregation;
        rule.AggregationThreshold = dto.AggregationThreshold < 1 ? 1 : dto.AggregationThreshold;
        rule.UpdatedAt = DateTime.UtcNow;

        var newValue = $"Enabled={rule.IsEnabled}, Priority={rule.Priority}, Cooldown={rule.CooldownMinutes}m, Reminders={rule.MaxReminders}, Aggregation={rule.EnableAggregation} (Threshold: {rule.AggregationThreshold})";

        // Audit Log Entry
        var audit = new CaseEvent
        {
            Id = Guid.NewGuid(),
            CaseId = null,
            EventType = EventType.Other,
            Message = $"Updated Notification Rule '{rule.Name}' ({rule.EventType})",
            CreatedAt = DateTime.UtcNow,
            UserId = userId,
            Module = "Configurable Settings",
            EntityName = $"Notification Rule: {rule.Name}",
            ActionType = "UPDATE",
            OldValue = oldValue,
            NewValue = newValue
        };

        _context.CaseEvents.Add(audit);
        await _context.SaveChangesAsync(ct);

        return new NotificationRuleDto
        {
            Id = rule.Id,
            EventType = rule.EventType,
            Name = rule.Name,
            IsEnabled = rule.IsEnabled,
            Priority = rule.Priority,
            CooldownMinutes = rule.CooldownMinutes,
            MaxReminders = rule.MaxReminders,
            EnableAggregation = rule.EnableAggregation,
            AggregationThreshold = rule.AggregationThreshold,
            CreatedAt = rule.CreatedAt,
            UpdatedAt = rule.UpdatedAt
        };
    }

    public async Task<NotificationRuleDto?> ToggleNotificationRuleAsync(Guid id, Guid userId, CancellationToken ct = default)
    {
        var rule = await _context.NotificationRules.FirstOrDefaultAsync(r => r.Id == id, ct);
        if (rule == null) return null;

        var oldStatus = rule.IsEnabled ? "Enabled" : "Disabled";
        rule.IsEnabled = !rule.IsEnabled;
        rule.UpdatedAt = DateTime.UtcNow;
        var newStatus = rule.IsEnabled ? "Enabled" : "Disabled";

        // Audit Log Entry
        var audit = new CaseEvent
        {
            Id = Guid.NewGuid(),
            CaseId = null,
            EventType = EventType.Other,
            Message = $"{newStatus} Notification Rule '{rule.Name}'",
            CreatedAt = DateTime.UtcNow,
            UserId = userId,
            Module = "Configurable Settings",
            EntityName = $"Notification Rule: {rule.Name}",
            ActionType = rule.IsEnabled ? "ENABLE" : "DISABLE",
            OldValue = oldStatus,
            NewValue = newStatus
        };

        _context.CaseEvents.Add(audit);
        await _context.SaveChangesAsync(ct);

        return new NotificationRuleDto
        {
            Id = rule.Id,
            EventType = rule.EventType,
            Name = rule.Name,
            IsEnabled = rule.IsEnabled,
            Priority = rule.Priority,
            CooldownMinutes = rule.CooldownMinutes,
            MaxReminders = rule.MaxReminders,
            EnableAggregation = rule.EnableAggregation,
            AggregationThreshold = rule.AggregationThreshold,
            CreatedAt = rule.CreatedAt,
            UpdatedAt = rule.UpdatedAt
        };
    }

    private sealed class SlaCandidate
    {
        public Guid Id { get; init; }
        public string CaseNumber { get; init; } = string.Empty;
        public string Title { get; init; } = string.Empty;
        public Guid OwnerId { get; init; }
        public DateTime SlaStartTime { get; init; }
        public int SlaTargetHours { get; init; }
    }

    private async Task EnsureSeedNotificationsForUserAsync(Guid userId, CancellationToken ct)
    {
        var hasAny = await _context.Notifications.AnyAsync(n => n.RecipientUserId == userId, ct);
        if (hasAny) return;

        var events = await _context.CaseEvents
            .AsNoTracking()
            .OrderByDescending(ce => ce.CreatedAt)
            .Take(SeedNotificationCount)
            .Select(ce => new
            {
                ce.EventType,
                ce.Message,
                ce.CaseId,
                CaseNumber = ce.Case != null ? ce.Case.CaseNumber : null,
                ce.CreatedAt
            })
            .ToListAsync(ct);

        var newNotifications = new List<NotificationItem>();
        var idx = 0;
        foreach (var ev in events)
        {
            var type = ev.EventType switch
            {
                EventType.Create => "CASE_ASSIGNED",
                EventType.Assign => "CASE_REASSIGNED",
                EventType.Escalate => "CASE_ESCALATED",
                EventType.Resolve => "CASE_RESOLVED",
                _ => "AUDIT_EVENT"
            };

            var title = ev.EventType switch
            {
                EventType.Create => "New Case Created",
                EventType.Assign => "Case Reassigned",
                EventType.Escalate => "Case Escalated",
                EventType.Resolve => "Case Resolved",
                _ => "Case Activity"
            };

            newNotifications.Add(new NotificationItem
            {
                Id = Guid.NewGuid(),
                RecipientUserId = userId,
                Type = type,
                Title = title,
                Message = ev.Message,
                CaseId = ev.CaseId,
                CaseNumber = ev.CaseNumber,
                Priority = "Medium",
                IsRead = idx >= SeedUnreadCount,
                CreatedAt = ev.CreatedAt,
                ReadAt = idx >= SeedUnreadCount ? ev.CreatedAt.AddMinutes(10) : null
            });
            idx++;
        }

        if (newNotifications.Any())
        {
            _context.Notifications.AddRange(newNotifications);
            await _context.SaveChangesAsync(ct);
        }
    }

    private async Task EnsureSeedNotificationRulesAsync(CancellationToken ct)
    {
        var hasAny = await _context.NotificationRules.AnyAsync(ct);
        if (hasAny) return;

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

        _context.NotificationRules.AddRange(defaultRules);
        await _context.SaveChangesAsync(ct);
    }

    public async Task CreateConfigChangedNotificationAsync(string title, string message, CancellationToken ct = default)
    {
        try
        {
            var configRule = await _context.NotificationRules.AsNoTracking().FirstOrDefaultAsync(r => r.EventType == "CONFIG_CHANGED", ct);
            if (configRule != null && !configRule.IsEnabled) return;

            var priority = configRule?.Priority ?? "Info";

            var adminUserIds = await _context.Users.AsNoTracking()
                .Where(u => u.Role.Contains("Admin") || u.Role.Contains("Officer") || u.Role.Contains("Agent"))
                .Select(u => u.Id)
                .ToListAsync(ct);

            if (!adminUserIds.Any()) return;

            var now = DateTime.UtcNow;
            var notifs = adminUserIds.Select(userId => new NotificationItem
            {
                Id = Guid.NewGuid(),
                RecipientUserId = userId,
                Type = "CONFIG_CHANGED",
                Title = title,
                Message = message,
                Priority = priority,
                IsRead = false,
                CreatedAt = now
            });

            _context.Notifications.AddRange(notifs);
            await _context.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[CreateConfigChangedNotification Error] {ex.Message}");
        }
    }
}
