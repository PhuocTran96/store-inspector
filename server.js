/**
 * Store Inspector App - Main Server File (Refactored)
 * A mobile-friendly web application for store inspections with admin dashboard
 */

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MongoDB Connection
// ============================================================================
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('✅ MongoDB connected successfully');
  // Load data after MongoDB connection is established
  const { loadData } = require('./services/dataLoader');
  await loadData();
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  // If MongoDB fails, still try to load CSV data
  const { loadData } = require('./services/dataLoader');
  loadData();
});

// ============================================================================
// Middleware Configuration
// ============================================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_session_secret_key_here_change_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Debug middleware to log sessions
const { logSession } = require('./middleware/auth');
app.use(logSession);

// ============================================================================
// Routes
// ============================================================================

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const submissionsRoutes = require('./routes/submissions');
const historyRoutes = require('./routes/history');
const adminUsersRoutes = require('./routes/adminUsers');
const adminCategoriesRoutes = require('./routes/adminCategories');
const adminTemplatesRoutes = require('./routes/adminTemplates');
const adminExportRoutes = require('./routes/adminExport');

// Mount routes
app.use('/api', authRoutes);
app.use('/api', dataRoutes);
app.use('/api', submissionsRoutes);
app.use('/api/user/history', historyRoutes);
app.use('/api/admin', adminUsersRoutes);
app.use('/api/admin', adminCategoriesRoutes);
app.use('/api/template', adminTemplatesRoutes);
app.use('/api/admin', adminExportRoutes);

// ============================================================================
// Error Handling
// ============================================================================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ============================================================================
// Start Server
// ============================================================================
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} in your browser`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down gracefully...');
  mongoose.connection.close(() => {
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  });
});
