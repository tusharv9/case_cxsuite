// ===== NOTIFICATION SERVICE API =====

import api from './api.js';

export const notificationService = {
  /**
   * Get paginated notifications for current user
   */
  getNotifications(params = {}) {
    return api.get('/api/notifications', { params }).then((r) => r.data);
  },

  /**
   * Get unread notification count for current user
   */
  getUnreadCount() {
    return api.get('/api/notifications/unread-count').then((r) => r.data?.unreadCount || 0);
  },

  /**
   * Mark a single notification as read
   */
  markAsRead(id) {
    return api.put(`/api/notifications/${id}/read`).then((r) => r.data);
  },

  /**
   * Mark all notifications as read for current user
   */
  markAllAsRead() {
    return api.put('/api/notifications/read-all').then((r) => r.data);
  },

  /**
   * Delete / dismiss a single notification for current user
   */
  deleteNotification(id) {
    return api.delete(`/api/notifications/${id}`).then((r) => r.data);
  },
};
