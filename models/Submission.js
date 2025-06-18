const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  username: { type: String, required: true },
  userId: { type: String }, // Added userId field
  tdsName: { type: String, default: '' }, // Add tdsName field for admin table
  storeId: { type: String, required: true },
  storeName: { type: String, required: true },
  categoryId: { type: String, required: true },
  categoryName: { type: String, required: true },
  note: { type: String, default: '' }, // Text note/comment
  fixed: { type: Boolean }, // Yes/No answer for "after" submissions (true=fixed, false=not fixed)
  images: [{ type: String }], // Array of image URLs
  submissionType: { type: String, enum: ['before', 'after'], required: true }, // New field
  sessionId: { type: String, required: true }, // To link before and after submissions
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Submission', submissionSchema);
