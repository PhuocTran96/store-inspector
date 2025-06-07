const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  id: String,
  name: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Category', categorySchema);
