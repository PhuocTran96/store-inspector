/**
 * Admin template management routes
 * Handles Excel template downloads and bulk uploads for stores, categories, users, and MCP data
 */
const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../middleware/auth');
const { fileUpload } = require('../middleware/upload');
const { loadUsers, loadStoresFromMongoDB, loadCategoriesFromMongoDB, loadData } = require('../services/dataLoader');

// Models
const Store = require('../models/Store');
const Category = require('../models/Category');
const User = require('../models/User');

// PlanVisit model for MCP data (connects to project_display_app database)
const mongoose = require('mongoose');
const planVisitSchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'plan_visit'
});
const planVisitConnection = mongoose.createConnection(
  process.env.MONGODB_URI?.replace(/\/[^\/]*$/, '/project_display_app') || 'mongodb://localhost:27017/project_display_app',
  {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
);
const PlanVisit = planVisitConnection.model('plan_visit', planVisitSchema);

/**
 * GET /api/template/stores-sample
 * Export all stores data to Excel template
 * Returns an Excel file with all current store data
 */
router.get('/stores-sample', async (req, res) => {
  try {
    // Get all stores from MongoDB
    const stores = await Store.find({}).sort({ storeName: 1 }).lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stores Data');

    // Use the exact field names that the database expects
    worksheet.columns = [
      { header: 'stt', key: 'stt', width: 10 },
      { header: 'tdlName', key: 'tdlName', width: 20 },
      { header: 'tdsName', key: 'tdsName', width: 20 },
      { header: 'promoterName', key: 'promoterName', width: 20 },
      { header: 'typeShop', key: 'typeShop', width: 10 },
      { header: 'headcountInvest', key: 'headcountInvest', width: 15 },
      { header: 'headcountActive', key: 'headcountActive', width: 15 },
      { header: 'seniority', key: 'seniority', width: 15 },
      { header: 'storeName', key: 'storeName', width: 30 },
      { header: 'storeCode', key: 'storeCode', width: 15 },
      { header: 'dealerCode', key: 'dealerCode', width: 15 },
      { header: 'address', key: 'address', width: 50 },
      { header: 'storeType', key: 'storeType', width: 10 },
      { header: 'channel', key: 'channel', width: 20 },
      { header: 'keyCities', key: 'keyCities', width: 15 },
      { header: 'nearestKeyCity', key: 'nearestKeyCity', width: 20 },
      { header: 'rankingCommune', key: 'rankingCommune', width: 20 },
      { header: 'base', key: 'base', width: 15 },
      { header: 'shopTier', key: 'shopTier', width: 15 },
      { header: 'region', key: 'region', width: 15 },
      { header: 'province', key: 'province', width: 20 },
      { header: 'city', key: 'city', width: 20 },
      { header: 'district', key: 'district', width: 20 }
    ];

    // Add all actual store data
    stores.forEach(store => {
      worksheet.addRow({
        stt: store.stt || '',
        tdlName: store.tdlName || '',
        tdsName: store.tdsName || '',
        promoterName: store.promoterName || '',
        typeShop: store.typeShop || '',
        headcountInvest: store.headcountInvest || '',
        headcountActive: store.headcountActive || '',
        seniority: store.seniority || '',
        storeName: store.storeName || '',
        storeCode: store.storeCode || '',
        dealerCode: store.dealerCode || '',
        address: store.address || '',
        storeType: store.storeType || '',
        channel: store.channel || '',
        keyCities: store.keyCities || '',
        nearestKeyCity: store.nearestKeyCity || '',
        rankingCommune: store.rankingCommune || '',
        base: store.base || '',
        shopTier: store.shopTier || '',
        region: store.region || '',
        province: store.province || '',
        city: store.city || '',
        district: store.district || ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="stores-data-${new Date().toISOString().split('T')[0]}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting stores data:', error);
    res.status(500).json({ error: 'Failed to export stores data' });
  }
});

/**
 * GET /api/template/categories-sample
 * Export all categories data to Excel template
 * Returns an Excel file with all current category data
 */
router.get('/categories-sample', async (req, res) => {
  try {
    // Get all categories from MongoDB
    const categories = await Category.find({}).sort({ order: 1 }).lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Categories Data');

    // Use the exact field names that the database expects
    worksheet.columns = [
      { header: 'id', key: 'id', width: 15 },
      { header: 'name', key: 'name', width: 30 },
      { header: 'description', key: 'description', width: 50 },
      { header: 'isActive', key: 'isActive', width: 10 },
      { header: 'order', key: 'order', width: 10 }
    ];

    // Add all actual category data
    categories.forEach(category => {
      worksheet.addRow({
        id: category.id || '',
        name: category.name || '',
        description: category.description || '',
        isActive: category.isActive !== undefined ? category.isActive.toString() : 'true',
        order: category.order || ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="categories-data-${new Date().toISOString().split('T')[0]}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting categories data:', error);
    res.status(500).json({ error: 'Failed to export categories data' });
  }
});

/**
 * GET /api/template/users-sample
 * Export all users data to Excel template
 * Returns an Excel file with all current user data (passwords excluded)
 */
router.get('/users-sample', async (req, res) => {
  try {
    // Get all users from MongoDB
    const users = await User.find({}, { password: 0 }).sort({ username: 1 }).lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Users Data');

    // Use the exact field names and order that the import expects
    worksheet.columns = [
      { header: 'username', key: 'username', width: 20 },
      { header: 'userId', key: 'userId', width: 15 },
      { header: 'role', key: 'role', width: 15 },
      { header: 'password', key: 'password', width: 15 },
      { header: 'status', key: 'status', width: 10 }
    ];

    // Add all actual user data, password is left empty
    users.forEach(user => {
      worksheet.addRow({
        username: user.username || '',
        userId: user.userId || '',
        role: user.role || '',
        password: '',
        status: user.status || 'active'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="users-data-${new Date().toISOString().split('T')[0]}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting users data:', error);
    res.status(500).json({ error: 'Failed to export users data' });
  }
});

/**
 * GET /api/template/mcp-sample
 * Export MCP (Visit Plan) data to Excel template
 * Requires admin access
 * Returns an Excel file with all plan visit data
 */
router.get('/mcp-sample', requireAdmin, async (req, res) => {
  try {
    const planVisits = await PlanVisit.find({}).lean();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('MCP Data');
    worksheet.columns = [
      { header: 'username', key: 'username', width: 20 },
      { header: 'storeCode', key: 'storeCode', width: 15 },
      { header: 'Date', key: 'Date', width: 12 },
      { header: 'Value', key: 'Value', width: 8 },
    ];
    planVisits.forEach(row => {
      worksheet.addRow({
        username: row.username || '',
        storeCode: row.storeCode || '',
        Date: row.Date ? new Date(row.Date).toISOString().slice(0, 10) : '',
        Value: row.Value || '',
      });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mcp-sample.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/template/upload-stores
 * Upload and process stores Excel template
 * Upserts store records into MongoDB and reloads the in-memory store cache
 * Requires admin access and an Excel file upload
 */
router.post('/upload-stores', fileUpload.single('storesFile'), async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  try {
    const filePath = req.file.path;
    const ext = filePath.split('.').pop().toLowerCase();
    let stores = [];
    if (ext === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const values = row.values;
        // Map according to the template column order: stt, tdlName, tdsName, promoterName, typeShop, headcountInvest, headcountActive, seniority, storeName, storeCode, dealerCode, address, storeType, channel, keyCities, nearestKeyCity, rankingCommune, base, shopTier, region, province, city, district
        stores.push({
          stt: values[1],
          tdlName: values[2],
          tdsName: values[3],
          promoterName: values[4],
          typeShop: values[5],
          headcountInvest: values[6],
          headcountActive: values[7],
          seniority: values[8],
          storeName: values[9],
          storeCode: values[10],
          dealerCode: values[11],
          address: values[12],
          storeType: values[13],
          channel: values[14],
          keyCities: values[15],
          nearestKeyCity: values[16],
          rankingCommune: values[17],
          base: values[18],
          shopTier: values[19],
          region: values[20],
          province: values[21],
          city: values[22],
          district: values[23]
        });
      });
    } else {
      return res.status(400).json({ error: 'Please upload an Excel (.xlsx) file.' });
    }
    if (stores.length === 0) {
      return res.status(400).json({ error: 'No valid store data found in file.' });
    }
    let upserted = 0;
    for (const store of stores) {
      if (!store.storeCode || !store.storeName) continue;
      await Store.findOneAndUpdate(
        { storeCode: store.storeCode },
        { $set: store },
        { upsert: true, new: true }
      );
      upserted++;
    }
    await loadStoresFromMongoDB();
    fs.unlinkSync(filePath);
    res.json({ success: true, message: `Successfully processed ${upserted} stores`, count: upserted });
  } catch (error) {
    console.error('Upload stores error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to process stores file' });
  }
});

/**
 * POST /api/template/upload-categories
 * Upload and process categories Excel template
 * Upserts category records into MongoDB and reloads the in-memory category cache
 * Requires admin access and an Excel file upload
 */
router.post('/upload-categories', fileUpload.single('categoriesFile'), async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  try {
    const filePath = req.file.path;
    const ext = filePath.split('.').pop().toLowerCase();
    let categories = [];
    if (ext === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const values = row.values;
        categories.push({
          id: values[1],
          name: values[2],
          description: values[3],
          isActive: values[4],
          order: values[5]
        });
      });
    } else {
      return res.status(400).json({ error: 'Please upload an Excel (.xlsx) file.' });
    }
    if (categories.length === 0) {
      return res.status(400).json({ error: 'No valid category data found in file.' });
    }
    let upserted = 0;
    for (const cat of categories) {
      if (!cat.id || !cat.name) continue;
      await Category.findOneAndUpdate(
        { id: cat.id },
        { $set: cat },
        { upsert: true, new: true }
      );
      upserted++;
    }
    await loadCategoriesFromMongoDB();
    fs.unlinkSync(filePath);
    res.json({ success: true, message: `Successfully processed ${upserted} categories`, count: upserted });
  } catch (error) {
    console.error('Upload categories error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to process categories file' });
  }
});

/**
 * POST /api/template/upload-users
 * Upload and process users Excel template
 * Upserts user records into MongoDB with hashed passwords and reloads the in-memory user cache
 * Requires admin access and an Excel file upload
 * Sets mustChangePassword flag to true for all uploaded users
 */
router.post('/upload-users', fileUpload.single('usersFile'), requireAdmin, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  try {
    const filePath = req.file.path;
    const ext = filePath.split('.').pop().toLowerCase();
    let users = [];
    if (ext === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const values = row.values;
        users.push({
          username: values[1],
          userId: values[2],
          role: values[3],
          password: values[4],
          status: values[5] || 'active'
        });
      });
    } else {
      return res.status(400).json({ error: 'Please upload an Excel (.xlsx) file.' });
    }
    if (users.length === 0) {
      return res.status(400).json({ error: 'No valid user data found in file.' });
    }
    let upserted = 0;
    let updated = 0;
    let errors = [];
    for (const user of users) {
      if (!user.username || !user.userId || !user.role || !user.password) {
        errors.push(`Skipped user with missing data: ${JSON.stringify(user)}`);
        continue;
      }
      const hashedPassword = await bcrypt.hash(String(user.password), 10);
      const existingUser = await User.findOne({
        $or: [{ username: user.username }, { userId: user.userId }]
      });
      if (existingUser) {
        await User.findOneAndUpdate(
          { $or: [{ username: user.username }, { userId: user.userId }] },
          { $set: { ...user, password: hashedPassword, mustChangePassword: true } },
          { new: true }
        );
        updated++;
      } else {
        await User.findOneAndUpdate(
          { userId: user.userId },
          { $set: { ...user, password: hashedPassword, mustChangePassword: true } },
          { upsert: true, new: true }
        );
        upserted++;
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({
        error: `Processed ${upserted} new users and updated ${updated} existing users, but encountered errors: ${errors.join('; ')}`,
        count: upserted + updated
      });
    }
    await loadData();
    fs.unlinkSync(filePath);
    res.json({ success: true, message: `Successfully processed ${upserted} users`, count: upserted });
  } catch (error) {
    console.error('Upload users error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to process users file' });
  }
});

/**
 * POST /api/template/upload-mcp
 * Upload and process MCP (Visit Plan) Excel template
 * Upserts plan visit records into MongoDB
 * Requires admin access and an Excel file upload
 */
router.post('/upload-mcp', requireAdmin, fileUpload.single('mcpFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  try {
    const filePath = req.file.path;
    const ext = filePath.split('.').pop().toLowerCase();
    let imported = 0;
    if (ext === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];
      const rows = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const values = row.values;
        rows.push({
          username: values[1],
          storeCode: values[2],
          Date: values[3],
          Value: values[4],
        });
      });
      for (const row of rows) {
        if (!row.username || !row.storeCode || !row.Date) continue;
        // Only keep date part for Date
        const dateOnly = row.Date ? new Date(row.Date).toISOString().slice(0, 10) : '';
        await PlanVisit.findOneAndUpdate(
          { username: row.username, storeCode: row.storeCode, Date: dateOnly },
          { $set: { username: row.username, storeCode: row.storeCode, Date: dateOnly, Value: row.Value } },
          { upsert: true, new: true }
        );
        imported++;
      }
    }
    fs.unlinkSync(filePath);
    res.json({ success: true, imported });
  } catch (e) {
    console.error('Upload MCP error:', e);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
