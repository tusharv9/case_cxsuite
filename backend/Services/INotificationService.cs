namespace CaseManagement.Api.Services;

using CaseManagement.Api.DTOs;

public interface INotificationService
{
    Task CreateNotificationAsync(Guid recipientUserId, string type, string title, string message, Guid? caseId = null, string? caseNumber = null, string priority = "High", int reminderCount = 0, CancellationToken ct = default);
    Task<PagedResponseDto<NotificationDto>> GetNotificationsAsync(Guid userId, int page = 1, int pageSize = 15, CancellationToken ct = default);
    Task<int> GetUnreadCountAsync(Guid userId, CancellationToken ct = default);
    Task MarkAsReadAsync(Guid notificationId, Guid userId, CancellationToken ct = default);
    Task MarkAllAsReadAsync(Guid userId, CancellationToken ct = default);
    Task DeleteNotificationAsync(Guid notificationId, Guid userId, CancellationToken ct = default);
    Task CheckAndGenerateSlaNotificationsAsync(CancellationToken ct = default);

    // Notification Rules Management
    Task<IEnumerable<NotificationRuleDto>> GetNotificationRulesAsync(CancellationToken ct = default);
    Task<NotificationRuleDto?> UpdateNotificationRuleAsync(Guid id, UpdateNotificationRuleDto dto, Guid userId, CancellationToken ct = default);
    Task<NotificationRuleDto?> ToggleNotificationRuleAsync(Guid id, Guid userId, CancellationToken ct = default);
    Task CreateConfigChangedNotificationAsync(string title, string message, CancellationToken ct = default);
}
