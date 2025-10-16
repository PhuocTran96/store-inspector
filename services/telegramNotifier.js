/**
 * Telegram Notifier Service
 * Sends notifications to Telegram when store inspection issues are not fixed
 */

const TelegramBot = require('node-telegram-bot-api');
const Settings = require('../models/Settings');
const NotificationLog = require('../models/NotificationLog');

// Initialize Telegram bot
let bot = null;

/**
 * Initialize Telegram bot
 * @returns {boolean} - True if initialized successfully
 */
function initTelegramBot() {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      console.warn('⚠️ TELEGRAM_BOT_TOKEN not found in environment variables. Telegram notifications disabled.');
      return false;
    }

    // Create bot instance without polling (we only send messages, don't receive)
    bot = new TelegramBot(botToken, { polling: false });
    console.log('✅ Telegram bot initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Error initializing Telegram bot:', error.message);
    return false;
  }
}

/**
 * Format date to DD-MM-YYYY
 * @param {Date} date - Date object
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
  if (!date) return 'N/A';

  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}-${month}-${year}`;
}

/**
 * Format notification message
 * @param {Object} data - Submission data
 * @returns {string} - Formatted message text
 */
function formatNotificationMessage(data) {
  const {
    userId,
    username,
    storeName,
    categoryName,
    submittedAt,
    note,
    expectedResolutionDate
  } = data;

  let message = '🚨 Lỗi chưa được khắc phục\n\n';
  message += `User ID: ${userId || 'N/A'}\n`;
  message += `Username: ${username || 'N/A'}\n`;
  message += `Store: ${storeName || 'N/A'}\n`;
  message += `Category: ${categoryName || 'N/A'}\n`;
  message += `Lỗi: before\n`;
  message += `Ngày: ${formatDate(submittedAt)}\n`;

  if (note && note.trim()) {
    message += `\n📝 Ghi chú: ${note}\n`;
  }

  if (expectedResolutionDate) {
    message += `Ngày dự kiến khắc phục: ${formatDate(expectedResolutionDate)}\n`;
  }

  return message;
}

/**
 * Send unfixed issue notification to Telegram
 * @param {Object} submissionData - After submission data
 * @param {Object} beforeSubmission - Corresponding before submission with images
 * @param {String} submissionId - MongoDB submission ID for logging
 */
async function sendUnfixedIssueNotification(submissionData, beforeSubmission, submissionId = null) {
  let logEntry = null;

  try {
    // Check if notifications are enabled in settings
    let settings = null;
    try {
      settings = await Settings.findById('app_settings').maxTimeMS(3000);
    } catch (dbError) {
      console.log('⚠️ Could not load settings from database (using defaults):', dbError.message);
    }

    if (settings && !settings.telegramEnabled) {
      console.log('⚠️ Telegram notifications disabled in settings. Skipping notification.');
      return;
    }

    // Check if bot is initialized
    if (!bot) {
      const initialized = initTelegramBot();
      if (!initialized) {
        console.log('⚠️ Telegram bot not initialized. Skipping notification.');
        return;
      }
    }

    // Get chat IDs from settings or fallback to env
    let chatIds = [];
    if (settings && settings.telegramChatIds && settings.telegramChatIds.length > 0) {
      chatIds = settings.telegramChatIds;
    } else if (process.env.TELEGRAM_CHAT_ID) {
      chatIds = [process.env.TELEGRAM_CHAT_ID];
    }

    if (chatIds.length === 0) {
      console.warn('⚠️ No chat IDs configured. Skipping notification.');
      return;
    }

    console.log('📨 Preparing Telegram notification for unfixed issue...');
    console.log('📋 Submission data:', {
      username: submissionData.username,
      store: submissionData.storeName,
      category: submissionData.categoryName
    });

    // Send to all configured chat IDs
    for (const chatId of chatIds) {
      try {
        // Create log entry (skip if database not available)
        try {
          logEntry = new NotificationLog({
            submissionId: submissionId || beforeSubmission?._id,
            type: 'telegram',
            status: 'pending',
            chatId: chatId,
            username: submissionData.username,
            userId: submissionData.userId,
            tdsName: submissionData.tdsName,
            storeName: submissionData.storeName,
            categoryName: submissionData.categoryName,
            imageCount: beforeSubmission?.images?.length || 0,
            imageUrls: beforeSubmission?.images || []
          });
        } catch (logError) {
          console.log('⚠️ Could not create log entry (database not available)');
        }

        const message = formatNotificationMessage(submissionData);
        let sentMessage;

        // Check if there are images to send
        if (beforeSubmission && beforeSubmission.images && beforeSubmission.images.length > 0) {
          console.log(`📸 Before submission has ${beforeSubmission.images.length} images`);

          // Limit to first 10 images (Telegram media group limit)
          const imageUrls = beforeSubmission.images.slice(0, 10);

          if (imageUrls.length === 1) {
            // Single image - send with caption
            console.log(`📤 Sending single image with notification message...`);
            sentMessage = await bot.sendPhoto(chatId, imageUrls[0], {
              caption: message
            });
            console.log(`✅ Image sent successfully with message`);
          } else {
            // Multiple images - send as media group (album)
            console.log(`📤 Sending ${imageUrls.length} images as media group...`);

            // Build media array for media group
            const media = imageUrls.map((url, index) => ({
              type: 'photo',
              media: url,
              // Only add caption to first image
              caption: index === 0 ? message : undefined
            }));

            // Send as media group
            const messages = await bot.sendMediaGroup(chatId, media);
            sentMessage = messages[0]; // Get first message for logging
            console.log(`✅ Media group sent successfully (${imageUrls.length} images)`);
          }

          // Update log with message ID
          if (logEntry && sentMessage) {
            logEntry.messageId = sentMessage.message_id?.toString();
          }
        } else {
          // No images, send text message only
          console.log('ℹ️ No images found in before submission, sending text only');
          sentMessage = await bot.sendMessage(chatId, message);
          console.log(`✅ Notification message sent successfully to chat ${chatId}`);

          // Update log with message ID
          if (logEntry) {
            logEntry.messageId = sentMessage.message_id?.toString();
          }
        }

        // Mark as sent (skip if log entry not created)
        if (logEntry) {
          try {
            logEntry.status = 'sent';
            logEntry.sentAt = new Date();
            await logEntry.save();
          } catch (saveError) {
            console.log('⚠️ Could not save log entry:', saveError.message);
          }
        }

        console.log('✅ Telegram notification completed successfully');

      } catch (chatError) {
        console.error(`❌ Error sending to chat ${chatId}:`, chatError.message);

        // Log failure
        if (logEntry) {
          logEntry.status = 'failed';
          logEntry.error = chatError.message;
          logEntry.errorCode = chatError.code;
          await logEntry.save();
        }
      }
    }

  } catch (error) {
    console.error('❌ Error sending Telegram notification:', error.message);

    // Log failure
    if (logEntry) {
      logEntry.status = 'failed';
      logEntry.error = error.message;
      logEntry.errorCode = error.code;
      await logEntry.save();
    }

    // Don't throw error - we don't want to fail the submission if Telegram fails
  }
}

/**
 * Handle Telegram errors gracefully
 * @param {Error} error - Error object
 */
function handleTelegramError(error) {
  console.error('❌ Telegram error:', {
    message: error.message,
    code: error.code,
    response: error.response?.body
  });

  // Log specific error types
  if (error.code === 'ETELEGRAM') {
    console.error('Telegram API error - check bot token and permissions');
  } else if (error.code === 'EFATAL') {
    console.error('Fatal error - bot may need reinitialization');
  }
}

// Initialize bot on module load
initTelegramBot();

module.exports = {
  sendUnfixedIssueNotification,
  initTelegramBot,
  handleTelegramError
};
