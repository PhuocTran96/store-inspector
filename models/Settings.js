const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // Singleton pattern - only one settings document
  _id: { type: String, default: 'app_settings' },

  // Telegram configuration
  telegramEnabled: { type: Boolean, default: true },
  telegramChatIds: [{ type: String }], // Support multiple chat IDs

  // Notification filters
  notificationFilters: {
    // Only notify for specific categories (empty = all categories)
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

    // Only notify for specific TDS users (empty = all TDS users)
    onlyForTDS: [{ type: String }],

    // Minimum severity level (for future use)
    minSeverity: { type: String, enum: ['low', 'medium', 'high', 'all'], default: 'all' }
  },

  // Rate limiting
  rateLimits: {
    maxNotificationsPerHour: { type: Number, default: 100 },
    delayBetweenImages: { type: Number, default: 300 } // milliseconds
  },

  // Metadata
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String } // username of admin who updated
});

// Update timestamp on save
settingsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Settings', settingsSchema);
