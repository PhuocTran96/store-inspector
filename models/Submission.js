const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  username: { type: String, required: true },
  storeId: { type: String, required: true },
  storeName: { type: String, required: true }, // Added store name field
  categoryId: { type: String, required: true },
  categoryName: { type: String, required: true },
  note: { type: String, default: '' },
  images: [{ type: String }], // Array of image URLs
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Submission', submissionSchema);
