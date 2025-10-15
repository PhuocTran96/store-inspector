/**
 * Authentication routes
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { getData } = require('../services/dataLoader');

/**
 * POST /api/login
 * User login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('🔐 Login attempt:', { username });

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const { usersData } = getData();
    const user = usersData.find(u => u.Username === username);

    if (!user) {
      console.log('❌ User not found:', username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const dbUser = await User.findOne({ username: username });
    if (!dbUser) {
      console.log('❌ User not found in database:', username);
      return res.status(401).json({ error: 'Invalid username or password' });
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
    const dbUser = await User.findOne({ username: req.session.user.username });
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
    const { username, currentPassword, newPassword } = req.body;

    if (!req.session.user || req.session.user.username !== username) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const dbUser = await User.findOne({ username: username });
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

    console.log(`✅ Password changed successfully for user: ${username}`);

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
