namespace CaseManagement.Api.Services;

using CaseManagement.Api.Data;
using CaseManagement.Api.DTOs;
using CaseManagement.Api.Models;
using Microsoft.EntityFrameworkCore;

public class NotificationService : INotificationService
{
    private static DateTime _lastSlaCheckTime = DateTime.MinValue;
    private static readonly TimeSpan SlaCheckInterval = TimeSpan.FromMinutes(2);
    private static readonly object _slaLock = new();

    private const double SlaApproachingThresholdHours = 2;

    // Fixed SLA notification behaviour. These used to be editable "Notification Rules" in
    // Configurable Settings; that screen was removed, so the previous default values apply.
    private sealed record SlaNotificationPolicy(string Priority, int CooldownMinutes, int MaxReminders, bool EnableAggregation, int AggregationThreshold);
    private static readonly SlaNotificationPolicy BreachPolicy = new("High", 60, 3, true, 3);
    private static readonly SlaNotificationPolicy ApproachingPolicy = new("Medium", 120, 2, true, 3);

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

        var breachRule = BreachPolicy;
        var approachingRule = ApproachingPolicy;

        var activeCases = await _context.Cases
            .AsNoTracking()
            .Where(c => c.Status != CaseStatus.Resolved && c.Status != CaseStatus.Closed && c.Status != CaseStatus.Cancelled)
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

            if (remainingHours <= 0)
            {
                dueBreaches.Add(c);
            }
            else if (remainingHours > 0 && remainingHours <= SlaApproachingThresholdHours)
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

    private sealed class SlaCandidate
    {
        public Guid Id { get; init; }
        public string CaseNumber { get; init; } = string.Empty;
        public string Title { get; init; } = string.Empty;
        public Guid OwnerId { get; init; }
        public DateTime SlaStartTime { get; init; }
        public int SlaTargetHours { get; init; }
    }

    public async Task CreateConfigChangedNotificationAsync(string title, string message, CancellationToken ct = default)
    {
        try
        {
            const string priority = "Info";

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
