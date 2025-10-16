const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema({
  // Reference to submission
  submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },

  // Notification details
  type: { type: String, enum: ['telegram', 'email', 'sms'], default: 'telegram' },
  status: { type: String, enum: ['sent', 'failed', 'pending'], required: true },

  // Telegram specific
  chatId: { type: String },
  messageId: { type: String }, // Telegram message ID for tracking

  // Submission context (denormalized for quick queries)
  username: { type: String },
  userId: { type: String },
  tdsName: { type: String },
  storeName: { type: String },
  categoryName: { type: String },

  // Timing
  sentAt: { type: Date },
  createdAt: { type: Date, default: Date.now },

  // Error handling
  error: { type: String },
  errorCode: { type: String },
  retryCount: { type: Number, default: 0 },
  lastRetryAt: { type: Date },

  // Image tracking
  imageCount: { type: Number, default: 0 },
  imageUrls: [{ type: String }]
});

// Indexes for common queries
notificationLogSchema.index({ submissionId: 1 });
notificationLogSchema.index({ status: 1, createdAt: -1 });
notificationLogSchema.index({ userId: 1, createdAt: -1 });
notificationLogSchema.index({ tdsName: 1, createdAt: -1 });
notificationLogSchema.index({ createdAt: -1 }); // For recent logs

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
