/**
 * Data routes for stores and categories
 * Non-admin routes for fetching store and category data
 */
const express = require('express');
const router = express.Router();
const { getData } = require('../services/dataLoader');

/**
 * GET /api/stores
 * Get user stores based on role and username
 * - Admin: returns all stores
 * - TDL/TDS: returns stores filtered by username
 */
router.get('/stores', (req, res) => {
  if (!req.session.user) {
    console.log('❌ No session user - login required');
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }

  console.log('📋 Fetching stores for user:', req.session.user);

  const { storesData } = getData();

  // If Admin, return all stores
  if (req.session.user.role === 'Admin') {
    console.log('✅ User is Admin, returning all stores:', storesData.length);
    return res.json(storesData);
  }

  // For TDL or TDS, filter by username and role
  const username = req.session.user.username ? req.session.user.username.trim() : '';
  const role = req.session.user.role;
  console.log(`🔍 Looking for stores matching username: "${username}" with role: "${role}"`);

  // Normalize username (remove Vietnamese accents for comparison)
  const normalizedUsername = username.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  console.log(`📝 Normalized username: "${normalizedUsername}"`);

  // Filter stores based on role
  let userStores = storesData.filter(store => {
    const tdlName = store['TDL name'] ? store['TDL name'].trim() : '';
    const tdsName = store['TDS name'] ? store['TDS name'].trim() : '';

    // Normalize store names (remove Vietnamese accents)
    const normalizedTDL = tdlName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normalizedTDS = tdsName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Match based on role
    if (role === 'TDL') {
      // TDL users match against TDL name field
      const exactMatch = tdlName === username;
      const normalizedMatch = normalizedTDL === normalizedUsername;
      return exactMatch || normalizedMatch;
    } else if (role === 'TDS') {
      // TDS users match against TDS name field
      const exactMatch = tdsName === username;
      const normalizedMatch = normalizedTDS === normalizedUsername;
      return exactMatch || normalizedMatch;
    }
    return false;
  });

  // If no exact match, try partial name matching (still respecting role)
  if (userStores.length === 0) {
    console.log('⚠️ No exact match found, trying partial name matching');
    userStores = storesData.filter(store => {
      const tdlName = store['TDL name'] ? store['TDL name'].trim().toLowerCase() : '';
      const tdsName = store['TDS name'] ? store['TDS name'].trim().toLowerCase() : '';
      const lowercaseName = username.toLowerCase();

      // Match based on role - partial match
      if (role === 'TDL') {
        return tdlName.includes(lowercaseName);
      } else if (role === 'TDS') {
        return tdsName.includes(lowercaseName);
      }
      return false;
    });
    console.log(`📝 Partial match found: ${userStores.length} stores`);
  }

  // Return first 5 stores as demo if still no match
  if (userStores.length === 0) {
    console.log('⚠️ No stores found, returning first 5 stores as demo');
    userStores = storesData.slice(0, 5);
    if (storesData.length > 0) {
      console.log('📋 Sample store TDL names:', storesData.slice(0, 5).map(s => s['TDL name']));
      console.log('📋 Sample store TDS names:', storesData.slice(0, 5).map(s => s['TDS name']));
    }
  }

  console.log(`✅ Returning ${userStores.length} stores for user "${username}"`);
  res.json(userStores);
});

/**
 * GET /api/categories
 * Get all categories
 * Returns all available categories for the application
 */
router.get('/categories', (req, res) => {
  const { categoriesData } = getData();
  res.json(categoriesData);
});

module.exports = router;
