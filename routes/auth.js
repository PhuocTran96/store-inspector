/**
 * Authentication routes
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { getData, loadUsers } = require('../services/dataLoader');

/**
 * POST /api/login
 * User login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('🔐 Login attempt:', { userId: username });

    if (!username || !password) {
      return res.status(400).json({ error: 'User ID and password are required' });
    }

    const { usersData } = getData();
    console.log(`🔍 Looking for userId: "${username}" in ${usersData.length} users`);

    // Find user by userId (case-insensitive)
    const user = usersData.find(u =>
      u['User ID'] && u['User ID'].toLowerCase() === username.toLowerCase()
    );

    if (!user) {
      console.log('❌ User not found in cache:', username);
      return res.status(401).json({ error: 'Invalid user ID or password' });
    }

    // Find in database (case-insensitive)
    const dbUser = await User.findOne({
      userId: { $regex: new RegExp(`^${username}$`, 'i') }
    });
    if (!dbUser) {
      console.log('❌ User not found in database:', username);
      return res.status(401).json({ error: 'Invalid user ID or password' });
    }

    if (dbUser.status === 'inactive') {
      console.log('❌ User is inactive:', username);
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact an administrator.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.Password);

    if (!isPasswordValid) {
      console.log('❌ Invalid password for user:', username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    req.session.user = {
      username: user.Username,
      userId: user['User ID'],
      role: user.Role,
      tdsName: user['TDS name'] || ''
    };

    await req.session.save();

    console.log('✅ Login successful:', {
      username: req.session.user.username,
      role: req.session.user.role,
      sessionID: req.sessionID
    });

    res.json({
      success: true,
      user: {
        username: user.Username,
        userId: user['User ID'],
        role: user.Role,
        tdsName: user['TDS name'] || '',
        mustChangePassword: dbUser.mustChangePassword
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/check-session
 * Check if user is logged in
 */
router.get('/check-session', async (req, res) => {
  if (req.session.user) {
    // Find user by userId (case-insensitive)
    const dbUser = await User.findOne({
      userId: { $regex: new RegExp(`^${req.session.user.userId}$`, 'i') }
    });
    res.json({
      loggedIn: true,
      user: {
        ...req.session.user,
        mustChangePassword: dbUser?.mustChangePassword || false
      }
    });
  } else {
    res.json({ loggedIn: false });
  }
});

/**
 * POST /api/change-password
 * Change user password
 */
router.post('/change-password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    // Check if user is authorized (match by userId, case-insensitive)
    if (!req.session.user || req.session.user.userId.toLowerCase() !== userId.toLowerCase()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Find user by userId (case-insensitive)
    const dbUser = await User.findOne({
      userId: { $regex: new RegExp(`^${userId}$`, 'i') }
    });
    if (!dbUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, dbUser.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    dbUser.password = hashedPassword;
    dbUser.mustChangePassword = false;
    dbUser.updatedAt = new Date();
    await dbUser.save();

    // Reload users data to ensure in-memory cache is synchronized
    await loadUsers();

    console.log(`✅ Password changed successfully for user: ${userId}`);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * POST /api/logout
 * User logout
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

module.exports = router;
