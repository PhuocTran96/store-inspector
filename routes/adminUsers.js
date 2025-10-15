/**
 * Admin User Management routes
 * Handles all administrative user operations including CRUD, password reset, and status toggling
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');
const { getData, loadUsers } = require('../services/dataLoader');

/**
 * GET /api/admin/check-session
 * Check if current user has admin privileges
 */
router.get('/check-session', (req, res) => {
  if (req.session.user && req.session.user.role === 'Admin') {
    res.json({ isAdmin: true, user: req.session.user });
  } else {
    res.status(403).json({ isAdmin: false });
  }
});

/**
 * GET /api/admin/users
 * Get all users (excluding passwords)
 */
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }) // Exclude password from response
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * POST /api/admin/users
 * Create a new user
 */
router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { username, userId, role, password, status = 'active' } = req.body;

    // Validate required fields
    if (!username || !userId || !password || !role) {
      return res.status(400).json({ error: 'Username, userId, role, and password are required' });
    }

    // Check if username or userId already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { userId }]
    });

    if (existingUser) {
      return res.status(400).json({
        error: existingUser.username === username ? 'Username already exists' : 'User ID already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(String(password), 10);

    // Create new user
    const newUser = new User({
      username,
      userId,
      role,
      password: hashedPassword,
      status,
      createdAt: new Date()
    });

    await newUser.save();

    // Reload users data to ensure in-memory data is synchronized
    await loadUsers();

    // Return user without password
    const { password: _, ...userResponse } = newUser.toObject();
    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update an existing user
 */
router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, userId, role, password, status } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if username or userId conflicts with other users
    if (username || userId) {
      const existingUser = await User.findOne({
        _id: { $ne: id },
        $or: [
          ...(username ? [{ username }] : []),
          ...(userId ? [{ userId }] : [])
        ]
      });

      if (existingUser) {
        return res.status(400).json({
          error: existingUser.username === username ? 'Username already exists' : 'User ID already exists'
        });
      }
    }

    // Update fields
    if (username) user.username = username;
    if (userId) user.userId = userId;
    if (role !== undefined) user.role = role;
    if (status) user.status = status;

    // Update password if provided
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    user.updatedAt = new Date();
    await user.save();

    // Reload users data to ensure in-memory data is synchronized
    await loadUsers();

    // Return user without password
    const { password: _, ...userResponse } = user.toObject();
    res.json(userResponse);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user (cannot delete admin user)
 */
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't allow deletion of admin user
    if (user.username === 'admin') {
      return res.status(403).json({ error: 'Cannot delete admin user' });
    }

    await User.findByIdAndDelete(id);

    // Reload users data to ensure in-memory data is synchronized
    await loadUsers();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Reset a user's password
 */
router.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.updatedAt = new Date();
    await user.save();

    // Update the in-memory usersData array to ensure login works immediately
    const { usersData } = getData();
    const userIndex = usersData.findIndex(u => u['User ID'] && u['User ID'].trim() === user.userId.trim());
    if (userIndex !== -1) {
      usersData[userIndex].Password = hashedPassword;
      console.log(`Password updated in memory for user: ${user.username}`);
    }

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

/**
 * POST /api/admin/users/:id/toggle-status
 * Toggle user status between active and inactive (cannot disable admin user)
 */
router.post('/users/:id/toggle-status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't allow disabling admin user
    if (user.username === 'admin') {
      return res.status(403).json({ error: 'Cannot disable admin user' });
    }

    user.status = user.status === 'active' ? 'inactive' : 'active';
    user.updatedAt = new Date();
    await user.save();

    // Reload users data to ensure in-memory data is synchronized
    await loadUsers();

    // Return user without password
    const { password: _, ...userResponse } = user.toObject();
    res.json(userResponse);
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
});

module.exports = router;
