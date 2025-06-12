const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
require('dotenv').config();
const { upload, deleteFromS3, uploadBufferToS3 } = require('./config/s3Config');
const fs = require('fs');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for local file uploads (for admin templates)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Keep original filename for CSV files
    cb(null, file.originalname);
  }
});

const fileUpload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept CSV files only
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('✅ MongoDB connected successfully');
  // Load data after MongoDB connection is established
  await loadData();
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  // If MongoDB fails, still try to load CSV data
  loadData();
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_session_secret_key_here_change_in_production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Temporarily disable for debugging
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax' // Add this for better cookie handling
  }
}));

// Debug middleware để log sessions
app.use((req, res, next) => {
  console.log(`Session ID: ${req.sessionID}`);
  console.log(`Session User: ${req.session.user ? req.session.user.username : 'undefined'}`);
  console.log(`Request URL: ${req.url}`);
  next();
});

// Models
const User = require('./models/User');
const Store = require('./models/Store');
const Category = require('./models/Category');
const Submission = require('./models/Submission');

// Admin middleware
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Load data on startup
let usersData = [];
let storesData = [];
let categoriesData = [];

async function loadData() {
  try {
    // Ensure MongoDB connection is established
    if (mongoose.connection.readyState !== 1) {
      console.log('⏳ Waiting for MongoDB connection...');
      await new Promise(resolve => {
        mongoose.connection.once('connected', resolve);
      });
    }
    
    // Load users from MongoDB
    console.log('🔄 Loading users from MongoDB...');
    const users = await User.find({});
    usersData = users.map(user => ({
      'Username': user.username,
      'User ID': user.userId,
      'Role': user.role,
      'Password': user.password
    }));
    console.log(`✅ Users loaded from MongoDB: ${usersData.length} users`);
    if (usersData.length > 0) {
      console.log('👤 First user:', usersData[0]);
      console.log('👤 Total admins:', usersData.filter(u => u.Role === 'Admin').length);
      console.log('👤 Total TDL:', usersData.filter(u => u.Role === 'TDL').length);
      console.log('👤 Total TDS:', usersData.filter(u => u.Role === 'TDS').length);
    } else {
      console.log('⚠️ No users found in MongoDB, will try CSV fallback...');
      await loadUsersFromCSV();
    }
  } catch (error) {
    console.error('❌ Error loading users from MongoDB:', error);
    console.log('🔄 Falling back to CSV...');
    // Fallback to CSV if MongoDB fails
    await loadUsersFromCSV();
  }  // Load stores from MongoDB
  await loadStoresFromMongoDB();
  
  // Load categories from MongoDB (with CSV fallback)
  await loadCategoriesFromMongoDB();
}

async function loadUsersFromCSV() {
  return new Promise((resolve) => {
    usersData = [];
    fs.createReadStream('users.csv')
      .pipe(csv())
      .on('data', (row) => {
        // Làm sạch dữ liệu, loại bỏ khoảng trắng thừa
        const cleanRow = {};
        Object.keys(row).forEach(key => {
          // Xử lý ký tự BOM ở đầu trường Username
          const cleanKey = key.replace(/^\uFEFF/, '');
          cleanRow[cleanKey] = row[key] ? row[key].trim() : row[key];
        });
        usersData.push(cleanRow);
      })
      .on('end', () => {
        console.log('📄 Users CSV loaded');
        console.log('👤 User đầu tiên:', usersData[0]);
        resolve();
      });
  });
}

async function loadStoresFromMongoDB() {
  try {
    console.log('🔄 Loading stores from MongoDB...');
    const stores = await Store.find({});
    storesData = stores.map(store => ({
      'STT': store.stt,
      'TDL name': store.tdlName,
      'TDS name': store.tdsName,
      'Promoter name': store.promoterName,
      'Type shop': store.typeShop,
      'Headcount invest': store.headcountInvest,
      'Headcount active': store.headcountActive,
      'Seniority (Ngày)': store.seniority,
      'Store name': store.storeName,
      'Store code (Fieldcheck)': store.storeCode,
      'Dealer code': store.dealerCode,
      'Address (No.Street, Ward/District, City, Province/State/Region)': store.address,
      'Store type/ grade (ABC)': store.storeType,
      'Channel': store.channel,
      'Key cities': store.keyCities,
      'Nearest Key City': store.nearestKeyCity,
      'Ranking Commune': store.rankingCommune,
      'Base': store.base,
      'SHOP TIER': store.shopTier,
      'Region': store.region,
      'Province': store.province,
      'City': store.city,
      'District': store.district
    }));
    console.log(`✅ Stores loaded from MongoDB: ${storesData.length} stores`);
    if (storesData.length > 0) {
      console.log('🏪 First store TDL:', storesData[0]['TDL name']);
      console.log('🏪 First store TDS:', storesData[0]['TDS name']);
      console.log('🏪 First store name:', storesData[0]['Store name']);
      
      // Check for stores without store codes
      const storesWithoutCodes = storesData.filter(store => !store['Store code (Fieldcheck)']);
      if (storesWithoutCodes.length > 0) {
        console.warn(`⚠️ Warning: ${storesWithoutCodes.length} stores don't have a store code`);
      }
    } else {
      console.log('⚠️ No stores found in MongoDB, will try CSV fallback...');
      await loadStoresFromCSV();
    }
  } catch (error) {
    console.error('❌ Error loading stores from MongoDB:', error);
    console.log('🔄 Falling back to CSV...');
    // Fallback to CSV if MongoDB fails
    await loadStoresFromCSV();
  }
}

async function loadStoresFromCSV() {
  return new Promise((resolve) => {
    storesData = [];
    fs.createReadStream('storelist.csv')
      .pipe(csv())
      .on('data', (row) => {
        // Làm sạch dữ liệu, loại bỏ khoảng trắng thừa
        const cleanRow = {};
        Object.keys(row).forEach(key => {
          cleanRow[key] = row[key] ? row[key].trim() : row[key];
        });
        storesData.push(cleanRow);
      })
      .on('end', () => {
        console.log('📄 Stores CSV loaded');
        if (storesData.length > 0) {
          console.log('🏪 Store đầu tiên TDL:', storesData[0]['TDL name']);
          console.log('🏪 Store đầu tiên TDS:', storesData[0]['TDS name']);
        }
        
        // Check for stores without store codes
        const storesWithoutCodes = storesData.filter(store => !store['Store code (Fieldcheck)']);
        if (storesWithoutCodes.length > 0) {
          console.warn(`⚠️ Warning: ${storesWithoutCodes.length} stores don't have a store code. Example:`, storesWithoutCodes[0]);
        }
        resolve();
      });
  });
}

async function loadCategoriesFromMongoDB() {
  try {
    console.log('🔄 Loading categories from MongoDB...');
    const categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 });
    
    // Convert to the format expected by the frontend
    categoriesData = categories.map(category => ({
      'ID': category.id,
      'Category': category.name,
      'Description': category.description,
      'Order': category.order
    }));
    
    console.log(`✅ Categories loaded from MongoDB: ${categoriesData.length} categories`);
    if (categoriesData.length > 0) {
      console.log('📋 First category:', categoriesData[0]['Category']);
    } else {
      console.log('⚠️ No categories found in MongoDB, will try CSV fallback...');
      await loadCategoriesFromCSV();
    }
  } catch (error) {
    console.error('❌ Error loading categories from MongoDB:', error);
    console.log('🔄 Falling back to CSV...');
    // Fallback to CSV if MongoDB fails
    await loadCategoriesFromCSV();
  }
}

async function loadCategoriesFromCSV() {
  return new Promise((resolve) => {
    categoriesData = [];
    fs.createReadStream('category.csv')
      .pipe(csv())
      .on('data', (row) => {
        // Làm sạch dữ liệu category
        const cleanRow = {};
        Object.keys(row).forEach(key => {
          cleanRow[key] = row[key] ? row[key].trim() : row[key];
        });
        categoriesData.push(cleanRow);
      })
      .on('end', () => {
        console.log('📄 Categories CSV loaded');
        resolve();
      });
  });
}

async function migrateCategoriesFromCSVToMongoDB() {
  try {
    console.log('🔄 Starting category migration from CSV to MongoDB...');
    
    // First load from CSV
    await loadCategoriesFromCSV();
    
    if (categoriesData.length === 0) {
      console.log('⚠️ No categories found in CSV file');
      return;
    }
    
    // Clear existing categories (optional - be careful in production)
    await Category.deleteMany({});
    console.log('🗑️ Cleared existing categories');
    
    // Migrate each category
    const categoryPromises = categoriesData.map((category, index) => {
      return Category.create({
        id: category.ID || `cat_${index + 1}`,
        name: category.Category || `Category ${index + 1}`,
        description: category.Description || '',
        order: index + 1,
        isActive: true
      });
    });
    
    await Promise.all(categoryPromises);
    console.log(`🎉 Successfully migrated ${categoriesData.length} categories to MongoDB`);
    
    // Reload from MongoDB to verify
    await loadCategoriesFromMongoDB();
    
  } catch (error) {
    console.error('❌ Error migrating categories:', error);
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  console.log(`Đang tìm user với ID: ${username}`);
  console.log('Danh sách users:', usersData.map(u => u['User ID']));
  
  // Tìm kiếm không phân biệt khoảng trắng
  const user = usersData.find(u => {
    if (!u['User ID']) return false;
    return u['User ID'].trim() === username.trim();
  });
  
  if (!user) {
    console.log('Không tìm thấy user');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  console.log(`Tìm thấy user: ${user.Username}, Role: ${user.Role}, User ID: ${user['User ID']}`);

  // For demo purposes, we'll use simple password comparison
  // In production, use proper password hashing
  if (user.Password === password) {
    req.session.user = {
      id: user['User ID'].trim(),
      username: user.Username ? user.Username.trim() : '',
      role: user.Role ? user.Role.trim() : ''
    };
    
    console.log('Đăng nhập thành công, session user:', req.session.user);
    res.json({ success: true, user: req.session.user });
  } else {
    console.log('Password không khớp');
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Change password API
app.post('/api/change-password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
      // Find user in MongoDB
    const user = await User.findOne({ userId: userId.trim() });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.password !== currentPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password in MongoDB
    user.password = newPassword;
    await user.save();
      // Also update in memory array for compatibility
    const userIndex = usersData.findIndex(u => u['User ID'] && u['User ID'].trim() === userId.trim());
    if (userIndex !== -1) {
      usersData[userIndex].Password = newPassword;
    }
    
    console.log(`✅ Password updated for user: ${user.username}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Debug middleware để kiểm tra session
app.use((req, res, next) => {
  console.log('Session ID:', req.sessionID);
  console.log('Session User:', req.session.user);
  console.log('Request URL:', req.url);
  next();
});

// Get user stores
app.get('/api/stores', (req, res) => {
  console.log('API stores called, session:', req.session);
  
  if (!req.session.user) {
    console.log('Không có session user - yêu cầu đăng nhập lại');
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }

  console.log('Session user:', req.session.user);

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

// Get categories
app.get('/api/categories', (req, res) => {
  res.json(categoriesData);
});

// Admin category management endpoints
app.post('/api/admin/categories/migrate', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    await migrateCategoriesFromCSVToMongoDB();
    res.json({ success: true, message: 'Categories migrated successfully' });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed' });
  }
});

app.get('/api/admin/categories', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const categories = await Category.find({}).sort({ order: 1, name: 1 });
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

app.post('/api/admin/categories', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const { id, name, description, order } = req.body;
    
    const newCategory = new Category({
      id: id || `cat_${Date.now()}`,
      name,
      description: description || '',
      order: order || 0,
      isActive: true
    });
    
    await newCategory.save();
    
    // Reload categories data
    await loadCategoriesFromMongoDB();
    
    res.json({ success: true, category: newCategory });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

app.put('/api/admin/categories/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const { id } = req.params;
    const { name, description, order, isActive } = req.body;
    
    const category = await Category.findOne({ id });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    category.name = name || category.name;
    category.description = description !== undefined ? description : category.description;
    category.order = order !== undefined ? order : category.order;
    category.isActive = isActive !== undefined ? isActive : category.isActive;
    
    await category.save();
    
    // Reload categories data
    await loadCategoriesFromMongoDB();
    
    res.json({ success: true, category });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

app.delete('/api/admin/categories/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const { id } = req.params;
    
    const category = await Category.findOneAndDelete({ id });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Reload categories data
    await loadCategoriesFromMongoDB();
    
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Template Management Endpoints
// Sample template downloads
app.get('/api/template/stores-sample', (req, res) => {
  const sampleData = [
    { id: 'STORE001', name: 'Cửa hàng mẫu 1', address: '123 Đường ABC, Quận 1, TP.HCM', region: 'Miền Nam' },
    { id: 'STORE002', name: 'Cửa hàng mẫu 2', address: '456 Đường XYZ, Quận 2, TP.HCM', region: 'Miền Nam' },
    { id: 'STORE003', name: 'Cửa hàng mẫu 3', address: '789 Đường DEF, Quận 3, TP.HCM', region: 'Miền Nam' }
  ];
  
  const csv = [
    'id,name,address,region',
    ...sampleData.map(store => `${store.id},"${store.name}","${store.address}",${store.region}`)
  ].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="stores-template.csv"');
  res.send(csv);
});

app.get('/api/template/categories-sample', (req, res) => {
  const sampleData = [
    { id: 'CAT001', name: 'Danh mục mẫu 1', description: 'Mô tả danh mục 1', isActive: 'true', order: '1' },
    { id: 'CAT002', name: 'Danh mục mẫu 2', description: 'Mô tả danh mục 2', isActive: 'true', order: '2' },
    { id: 'CAT003', name: 'Danh mục mẫu 3', description: 'Mô tả danh mục 3', isActive: 'false', order: '3' }
  ];
  
  const csv = [
    'id,name,description,isActive,order',
    ...sampleData.map(cat => `${cat.id},"${cat.name}","${cat.description}",${cat.isActive},${cat.order}`)
  ].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="categories-template.csv"');
  res.send(csv);
});

// Upload and process stores template
app.post('/api/template/upload-stores', fileUpload.single('storesFile'), async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    const filePath = req.file.path;
    const csvContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse CSV
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV file must have at least header and one data row' });
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const requiredHeaders = ['id', 'name', 'address', 'region'];
    
    // Validate headers
    for (const header of requiredHeaders) {
      if (!headers.includes(header)) {
        return res.status(400).json({ error: `Missing required column: ${header}` });
      }
    }
    
    const stores = [];
    const errors = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      
      if (values.length !== headers.length) {
        errors.push(`Line ${i + 1}: Column count mismatch`);
        continue;
      }
      
      const store = {};
      headers.forEach((header, index) => {
        store[header] = values[index];
      });
      
      // Validate required fields
      if (!store.id || !store.name) {
        errors.push(`Line ${i + 1}: Missing required fields (id, name)`);
        continue;
      }
      
      stores.push(store);
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation errors', details: errors });
    }
    
    // Update stores data (this would typically update your stores collection/file)
    storesData = stores;
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    res.json({ 
      success: true, 
      message: `Successfully processed ${stores.length} stores`,
      count: stores.length 
    });
    
  } catch (error) {
    console.error('Upload stores error:', error);
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to process stores file' });
  }
});

// Upload and process categories template
app.post('/api/template/upload-categories', fileUpload.single('categoriesFile'), async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    const filePath = req.file.path;
    const csvContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse CSV
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV file must have at least header and one data row' });
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const requiredHeaders = ['id', 'name', 'description', 'isActive', 'order'];
    
    // Validate headers
    for (const header of requiredHeaders) {
      if (!headers.includes(header)) {
        return res.status(400).json({ error: `Missing required column: ${header}` });
      }
    }
    
    const categories = [];
    const errors = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      
      if (values.length !== headers.length) {
        errors.push(`Line ${i + 1}: Column count mismatch`);
        continue;
      }
      
      const category = {};
      headers.forEach((header, index) => {
        category[header] = values[index];
      });
      
      // Validate and convert data types
      if (!category.id || !category.name) {
        errors.push(`Line ${i + 1}: Missing required fields (id, name)`);
        continue;
      }
      
      // Convert boolean and number fields
      category.isActive = category.isActive === 'true';
      category.order = parseInt(category.order) || 0;
      
      categories.push(category);
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation errors', details: errors });
    }
    
    // Update categories in MongoDB
    for (const categoryData of categories) {
      await Category.findOneAndUpdate(
        { id: categoryData.id },
        categoryData,
        { upsert: true, new: true }
      );
    }
    
    // Reload categories data
    await loadCategoriesFromMongoDB();
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    res.json({ 
      success: true, 
      message: `Successfully processed ${categories.length} categories`,
      count: categories.length 
    });
    
  } catch (error) {
    console.error('Upload categories error:', error);
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to process categories file' });
  }
});

// User Management API Endpoints
// Get all users
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }) // Exclude password from response
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create new user
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { username, userId, tdsName, password, status = 'active' } = req.body;
    
    // Validate required fields
    if (!username || !userId || !password) {
      return res.status(400).json({ error: 'Username, userId, and password are required' });
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
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const newUser = new User({
      username,
      userId,
      tdsName: tdsName || '',
      password: hashedPassword,
      status,
      createdAt: new Date()
    });
    
    await newUser.save();
    
    // Return user without password
    const { password: _, ...userResponse } = newUser.toObject();
    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, userId, tdsName, password, status } = req.body;
    
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
    if (tdsName !== undefined) user.tdsName = tdsName;
    if (status) user.status = status;
    
    // Update password if provided
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    
    user.updatedAt = new Date();
    await user.save();
    
    // Return user without password
    const { password: _, ...userResponse } = user.toObject();
    res.json(userResponse);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
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
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Reset user password
app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
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
    user.password = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date();
    await user.save();
    
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Toggle user status
app.post('/api/admin/users/:id/toggle-status', requireAdmin, async (req, res) => {
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
    
    // Return user without password
    const { password: _, ...userResponse } = user.toObject();
    res.json(userResponse);
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
