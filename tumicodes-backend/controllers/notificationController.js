// controllers/notificationController.js - Notification controller
const { NotificationModel } = require('../models/models');

class NotificationController {
    // Get user notifications
    static async getNotifications(req, res) {
        try {
            const { limit = 50, offset = 0, unread_only = false } = req.query;
            
            const notifications = await NotificationModel.getUserNotifications(req.user.id, {
                limit: parseInt(limit),
                offset: parseInt(offset),
                unread_only: unread_only === 'true'
            });
            
            // Get unread count
            const unreadCount = await NotificationModel.getUnreadCount(req.user.id);
            
            res.json({
                notifications,
                unread_count: unreadCount,
                total: notifications.length
            });
        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({
                error: 'Failed to get notifications',
                code: 'NOTIFICATIONS_FETCH_FAILED'
            });
        }
    }
    
    // Mark notification as read
    static async markAsRead(req, res) {
        try {
            await NotificationModel.markAsRead(req.params.id, req.user.id);
            
            // Send real-time update
            if (global.sendToUser) {
                global.sendToUser(req.user.id, 'notification_read', { id: req.params.id });
            }
            
            res.json({
                message: 'Notification marked as read'
            });
        } catch (error) {
            console.error('Mark notification read error:', error);
            res.status(500).json({
                error: 'Failed to mark notification as read',
                code: 'NOTIFICATION_UPDATE_FAILED'
            });
        }
    }
    
    // Mark all notifications as read
    static async markAllAsRead(req, res) {
        try {
            await NotificationModel.markAllAsRead(req.user.id);
            
            // Send real-time update
            if (global.sendToUser) {
                global.sendToUser(req.user.id, 'all_notifications_read', {});
            }
            
            res.json({
                message: 'All notifications marked as read'
            });
        } catch (error) {
            console.error('Mark all notifications read error:', error);
            res.status(500).json({
                error: 'Failed to mark notifications as read',
                code: 'NOTIFICATIONS_UPDATE_FAILED'
            });
        }
    }
    
    // Create notification
    static async createNotification(req, res) {
        try {
            const { user_id, type, title, message, icon, data } = req.body;
            
            if (!user_id || !type || !title || !message) {
                return res.status(400).json({
                    error: 'User ID, type, title, and message are required',
                    code: 'VALIDATION_ERROR'
                });
            }
            
            // Check if user is admin or creating for themselves
            if (user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({
                    error: 'Not authorized to create notifications for other users',
                    code: 'UNAUTHORIZED'
                });
            }
            
            const notificationId = await NotificationModel.create({
                user_id,
                type,
                title,
                message,
                icon,
                data
            });
            
            // Send real-time notification
            if (global.sendToUser) {
                const notification = {
                    id: notificationId,
                    type,
                    title,
                    message,
                    icon,
                    data: data || {},
                    created_at: new Date().toISOString(),
                    is_read: false
                };
                global.sendToUser(user_id, 'notification', notification);
            }
            
            res.status(201).json({
                message: 'Notification created successfully',
                notification_id: notificationId
            });
        } catch (error) {
            console.error('Create notification error:', error);
            res.status(500).json({
                error: 'Failed to create notification',
                code: 'NOTIFICATION_CREATE_FAILED'
            });
        }
    }
    
    // Delete notification
    static async deleteNotification(req, res) {
        try {
            // Get notification
            const { executeQuery } = require('../models/db');
            const [notifications] = await executeQuery(
                'SELECT user_id FROM notifications WHERE id = ?',
                [req.params.id]
            );
            
            if (notifications.length === 0) {
                return res.status(404).json({
                    error: 'Notification not found',
                    code: 'NOTIFICATION_NOT_FOUND'
                });
            }
            
            const notification = notifications[0];
            
            // Check ownership
            if (notification.user_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({
                    error: 'Not authorized to delete this notification',
                    code: 'UNAUTHORIZED'
                });
            }
            
            // Delete notification
            await executeQuery('DELETE FROM notifications WHERE id = ?', [req.params.id]);
            
            res.json({
                message: 'Notification deleted successfully'
            });
        } catch (error) {
            console.error('Delete notification error:', error);
            res.status(500).json({
                error: 'Failed to delete notification',
                code: 'NOTIFICATION_DELETE_FAILED'
            });
        }
    }
    
    // Get notification preferences (placeholder)
    static async getPreferences(req, res) {
        try {
            // In a real application, you would store notification preferences
            // For now, return default preferences
            res.json({
                email_notifications: true,
                push_notifications: true,
                course_updates: true,
                certificate_updates: true,
                project_updates: true,
                marketing_emails: false
            });
        } catch (error) {
            console.error('Get preferences error:', error);
            res.status(500).json({
                error: 'Failed to get notification preferences',
                code: 'PREFERENCES_FETCH_FAILED'
            });
        }
    }
    
    // Update notification preferences (placeholder)
    static async updatePreferences(req, res) {
        try {
            const preferences = req.body;
            
            // In a real application, you would save these to a database
            // For now, just return the received preferences
            res.json({
                message: 'Preferences updated successfully',
                preferences
            });
        } catch (error) {
            console.error('Update preferences error:', error);
            res.status(500).json({
                error: 'Failed to update notification preferences',
                code: 'PREFERENCES_UPDATE_FAILED'
            });
        }
    }
}

module.exports = NotificationController;