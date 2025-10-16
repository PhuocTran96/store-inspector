/**
 * Admin Settings Routes
 * Handles Telegram notification configuration and notification logs
 */

const express = require('express');
const router = express.Router();

// Models
const Settings = require('../models/Settings');
const NotificationLog = require('../models/NotificationLog');
const Category = require('../models/Category');

// Middleware
const { requireAdmin } = require('../middleware/auth');

// Services
const { sendUnfixedIssueNotification } = require('../services/telegramNotifier');

/**
 * GET /api/admin/settings/telegram
 * Get current Telegram notification settings
 */
router.get('/telegram', requireAdmin, async (req, res) => {
  try {
    let settings = await Settings.findById('app_settings');

    // Create default settings if none exist
    if (!settings) {
      settings = new Settings({
        _id: 'app_settings',
        telegramEnabled: true,
        telegramChatIds: process.env.TELEGRAM_CHAT_ID ? [process.env.TELEGRAM_CHAT_ID] : [],
        notificationFilters: {
          categories: [],
          onlyForTDS: [],
          minSeverity: 'all'
        },
        rateLimits: {
          maxNotificationsPerHour: 100,
          delayBetweenImages: 300
        }
      });
      await settings.save();
    }

    res.json(settings);
  } catch (error) {
    console.error('Error fetching Telegram settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /api/admin/settings/telegram
 * Update Telegram notification settings
 */
router.put('/telegram', requireAdmin, async (req, res) => {
  try {
    const {
      telegramEnabled,
      telegramChatIds,
      notificationFilters,
      rateLimits
    } = req.body;

    let settings = await Settings.findById('app_settings');

    if (!settings) {
      settings = new Settings({ _id: 'app_settings' });
    }

    // Update fields
    if (typeof telegramEnabled === 'boolean') {
      settings.telegramEnabled = telegramEnabled;
    }

    if (Array.isArray(telegramChatIds)) {
      settings.telegramChatIds = telegramChatIds.filter(id => id && id.trim());
    }

    if (notificationFilters) {
      if (Array.isArray(notificationFilters.categories)) {
        settings.notificationFilters.categories = notificationFilters.categories;
      }
      if (Array.isArray(notificationFilters.onlyForTDS)) {
        settings.notificationFilters.onlyForTDS = notificationFilters.onlyForTDS;
      }
      if (notificationFilters.minSeverity) {
        settings.notificationFilters.minSeverity = notificationFilters.minSeverity;
      }
    }

    if (rateLimits) {
      if (rateLimits.maxNotificationsPerHour) {
        settings.rateLimits.maxNotificationsPerHour = rateLimits.maxNotificationsPerHour;
      }
      if (rateLimits.delayBetweenImages) {
        settings.rateLimits.delayBetweenImages = rateLimits.delayBetweenImages;
      }
    }

    settings.updatedBy = req.session.user.username;
    await settings.save();

    console.log(`✅ Telegram settings updated by ${req.session.user.username}`);
    res.json(settings);

  } catch (error) {
    console.error('Error updating Telegram settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * POST /api/admin/settings/telegram/test
 * Send a test notification to verify configuration
 */
router.post('/telegram/test', requireAdmin, async (req, res) => {
  try {
    const testData = {
      userId: 'test_user_id',
      username: 'Test User',
      tdsName: 'Test TDS',
      storeName: 'Test Store',
      categoryName: 'Test Category',
      note: 'This is a test notification from the admin panel',
      submittedAt: new Date()
    };

    const testBeforeSubmission = {
      images: [] // No images for test
    };

    console.log('📨 Sending test notification from admin panel...');
    await sendUnfixedIssueNotification(testData, testBeforeSubmission);

    res.json({
      success: true,
      message: 'Test notification sent successfully'
    });

  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/notification-logs
 * Get notification logs with filters
 */
router.get('/notification-logs', requireAdmin, async (req, res) => {
  try {
    const {
      status,
      username,
      tdsName,
      storeName,
      startDate,
      endDate,
      limit = 50,
      page = 1
    } = req.query;

    // Build filter
    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (username && username.trim()) {
      filter.username = { $regex: username.trim(), $options: 'i' };
    }

    if (tdsName && tdsName.trim()) {
      filter.tdsName = { $regex: tdsName.trim(), $options: 'i' };
    }

    if (storeName && storeName.trim()) {
      filter.storeName = { $regex: storeName.trim(), $options: 'i' };
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDateTime;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      NotificationLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      NotificationLog.countDocuments(filter)
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching notification logs:', error);
    res.status(500).json({ error: 'Failed to fetch notification logs' });
  }
});

/**
 * GET /api/admin/notification-logs/stats
 * Get notification statistics
 */
router.get('/notification-logs/stats', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = endDateTime;
      }
    }

    const [
      total,
      sent,
      failed,
      pending,
      recentLogs
    ] = await Promise.all([
      NotificationLog.countDocuments(dateFilter),
      NotificationLog.countDocuments({ ...dateFilter, status: 'sent' }),
      NotificationLog.countDocuments({ ...dateFilter, status: 'failed' }),
      NotificationLog.countDocuments({ ...dateFilter, status: 'pending' }),
      NotificationLog.find(dateFilter)
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    ]);

    const successRate = total > 0 ? ((sent / total) * 100).toFixed(2) : 0;

    res.json({
      total,
      sent,
      failed,
      pending,
      successRate: parseFloat(successRate),
      recentLogs
    });

  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * DELETE /api/admin/notification-logs/:id
 * Delete a notification log
 */
router.delete('/notification-logs/:id', requireAdmin, async (req, res) => {
  try {
    const logId = req.params.id;
    await NotificationLog.findByIdAndDelete(logId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification log:', error);
    res.status(500).json({ error: 'Failed to delete log' });
  }
});

/**
 * POST /api/admin/notification-logs/clear-old
 * Clear old notification logs (older than specified days)
 */
router.post('/notification-logs/clear-old', requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await NotificationLog.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    console.log(`🗑️ Cleared ${result.deletedCount} notification logs older than ${days} days`);

    res.json({
      success: true,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Error clearing old logs:', error);
    res.status(500).json({ error: 'Failed to clear old logs' });
  }
});

module.exports = router;
