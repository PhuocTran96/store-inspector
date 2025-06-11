const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  username: { type: String, required: true },
  storeId: { type: String, required: true },
  storeName: { type: String, required: true },
  categoryId: { type: String, required: true },
  categoryName: { type: String, required: true },
  note: { type: String, default: '' },
  images: [{ type: String }], // Array of image URLs
  submissionType: { type: String, enum: ['before', 'after'], required: true }, // New field
  sessionId: { type: String, required: true }, // To link before and after submissions
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Submission', submissionSchema);
