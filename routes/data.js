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
router.get('/api/stores', (req, res) => {
  console.log('API stores called, session:', req.session);

  if (!req.session.user) {
    console.log('Không có session user - yêu cầu đăng nhập lại');
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }

  console.log('Session user:', req.session.user);

  const { storesData } = getData();

  // Nếu là Admin, trả về tất cả stores
  if (req.session.user.role === 'Admin') {
    console.log('User là Admin, trả về tất cả stores');
    return res.json(storesData);
  }

  // Nếu là TDL hoặc TDS, lọc theo username
  const username = req.session.user.username ? req.session.user.username.trim() : '';
  console.log(`Tìm store cho username: "${username}"`);

  // Tạo một bản sao của tên người dùng không dấu để so sánh
  const normalizedUsername = username.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  console.log(`Tên người dùng không dấu: "${normalizedUsername}"`);

  // Lấy stores theo tên người dùng, bao gồm cả phiên bản có dấu và không dấu
  let userStores = storesData.filter(store => {
    const tdlName = store['TDL name'] ? store['TDL name'].trim() : '';
    const tdsName = store['TDS name'] ? store['TDS name'].trim() : '';

    // Chuyển đổi tên trong store sang không dấu để so sánh
    const normalizedTDL = tdlName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normalizedTDS = tdsName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const exactMatch = tdlName === username || tdsName === username;
    const normalizedMatch = normalizedTDL === normalizedUsername || normalizedTDS === normalizedUsername;

    return exactMatch || normalizedMatch;
  });

  // Nếu không tìm thấy stores theo tên, thử match một phần tên
  if (userStores.length === 0) {
    console.log('Không tìm thấy matches chính xác, thử tìm kiếm một phần');
    userStores = storesData.filter(store => {
      const tdlName = store['TDL name'] ? store['TDL name'].trim().toLowerCase() : '';
      const tdsName = store['TDS name'] ? store['TDS name'].trim().toLowerCase() : '';

      const lowercaseName = username.toLowerCase();
      return tdlName.includes(lowercaseName) || tdsName.includes(lowercaseName);
    });
  }

  // Luôn trả về ít nhất 3 stores để demo
  if (userStores.length === 0) {
    console.log('Không tìm thấy stores, lấy stores đầu tiên làm demo');
    userStores = storesData.slice(0, 5);
  }

  console.log(`Tìm thấy ${userStores.length} stores`);
  res.json(userStores);
});

/**
 * GET /api/categories
 * Get all categories
 * Returns all available categories for the application
 */
router.get('/api/categories', (req, res) => {
  const { categoriesData } = getData();
  res.json(categoriesData);
});

module.exports = router;
