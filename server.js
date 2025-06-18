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
    // Accept CSV and Excel files
    if (file.mimetype === 'text/csv' || 
        file.originalname.endsWith('.csv') ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed!'), false);
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
      'Password': user.password,
      'TDS name': user.tdsName || '' // Add TDS name for session
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

// Submission API
app.post('/api/submit', async (req, res) => {
  try {
    console.log('📥 Received submission request');
    console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
    
    const { storeId, categories, step, sessionId, userId, username, storeName } = req.body;
    
    if (!req.session.user) {
      return res.status(401).json({ error: 'User not logged in' });
    }
    
    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'Categories data is required' });
    }
    
    console.log(`📋 Processing ${categories.length} category submissions for step: ${step}`);
      // Debug: Log the structure of categories to see note data
    categories.forEach((category, index) => {
      console.log(`📝 Category ${index + 1}:`, {
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        note: category.note,
        fixed: category.fixed, // Log the fixed status
        imageCount: category.images ? category.images.length : 0
      });
    });
    
    // Find store information
    const store = storesData.find(s =>
      s.storeCode === storeId ||
      s['Store code (Fieldcheck)'] === storeId ||
      s.STT === storeId
    );
    
    if (!store) {
      return res.status(400).json({ error: 'Store not found' });
    }
    
    // Process images and upload to S3
    let totalUploadedImages = 0;
    
    if (categories && categories.length > 0) {
      const { uploadBufferToS3 } = require('./config/s3Config');
      
      for (const category of categories) {
        console.log(`📤 Uploading ${category.images?.length || 0} images for category ${category.categoryName}...`);
        
        const processedImages = [];
        
        if (category.images && category.images.length > 0) {
          for (let i = 0; i < category.images.length; i++) {
            try {
              const base64Data = category.images[i];
              const matches = base64Data.match(/^data:image\/([a-zA-Z]*);base64,(.+)$/);
              
              if (!matches) {
                console.warn(`⚠️ Invalid base64 image format for category ${category.categoryId}, image ${i}`);
                continue;
              }
              
              const imageType = matches[1];
              const imageBuffer = Buffer.from(matches[2], 'base64');
              const filename = `${step}-${sessionId}-${category.categoryId}-${i + 1}.${imageType}`;
              
              const imageUrl = await uploadBufferToS3(imageBuffer, filename, `image/${imageType}`);
              processedImages.push(imageUrl);
              totalUploadedImages++;
              console.log(`✅ Image ${i + 1} uploaded successfully for category ${category.categoryName}`);
              
            } catch (uploadError) {
              console.error(`❌ Error uploading image ${i + 1} for category ${category.categoryName}:`, uploadError);
            }
          }
        }
        
        // Update the category with processed image URLs
        category.processedImages = processedImages;
      }
    }
    
    console.log(`📸 Successfully uploaded ${totalUploadedImages} images across ${categories.length} categories`);
    
    // Create submission documents for each category
    for (const category of categories) {
      try {        const newSubmission = new Submission({
          username: req.session.user.username,
          userId: req.session.user.id || req.session.user.userId,
          tdsName: (store.tdsName || store['TDS name'] || '').trim(),
          storeId: storeId,
          storeName: store['Store name'] || store.storeName || store.name || 'Unknown Store',
          storeAddress: store.Address || store.address || '',
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          note: category.note || '',
          fixed: category.fixed, // Save the yes/no answer separately
          images: category.processedImages || [],
          submissionType: step,
          sessionId: sessionId,
          submittedAt: new Date()
        });
        
        await newSubmission.save();
        console.log(`✅ Saved submission for category: ${category.categoryName} with ${category.processedImages?.length || 0} images`);
        
      } catch (saveError) {
        console.error('❌ Error saving submission:', saveError);
      }
    }
    
    console.log(`🎉 Submission completed successfully`);
    res.json({
      success: true,
      message: 'Submission saved successfully',
      imageCount: totalUploadedImages
    });
    
  } catch (error) {
    console.error('❌ Submission error:', error);
    res.status(500).json({ error: 'Failed to process submission' });
  }
});

// Get before categories for step 2
app.get('/api/before-categories/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params;
    const { sessionId } = req.query;
    
    if (!req.session.user) {
      return res.status(401).json({ error: 'User not logged in' });
    }
    
    console.log(`📋 Loading before categories for store: ${storeId}, sessionId: ${sessionId}`);    // Find submissions with submissionType 'before' for this store and session    // Build query dynamically to handle cases where userId might be undefined
    const baseQuery = {
      storeId: storeId,
      sessionId: sessionId,
      submissionType: 'before'
    };
    
    const currentUserId = req.session.user.id || req.session.user.userId;
    const currentUsername = req.session.user.username;
    
    console.log(`📋 Base query filters:`, baseQuery);
    console.log(`📋 Current user - ID: ${currentUserId}, Username: ${currentUsername}`);
    
    // Try to find submissions with userId first
    let beforeSubmissions = [];
    
    if (currentUserId) {
      const userIdQuery = { ...baseQuery, userId: currentUserId };
      console.log(`📋 Trying userId query:`, userIdQuery);
      beforeSubmissions = await Submission.find(userIdQuery).select('categoryId categoryName').lean();
      console.log(`📋 Found ${beforeSubmissions.length} submissions with userId`);
    }
    
    // If no results with userId, try with username
    if (beforeSubmissions.length === 0 && currentUsername) {
      const usernameQuery = { ...baseQuery, username: currentUsername };
      console.log(`📋 Trying username query:`, usernameQuery);
      beforeSubmissions = await Submission.find(usernameQuery).select('categoryId categoryName').lean();
      console.log(`📋 Found ${beforeSubmissions.length} submissions with username`);
    }
    
    // If still no results, try without user filtering (for backward compatibility)
    if (beforeSubmissions.length === 0) {
      console.log(`📋 Trying base query without user filtering:`, baseQuery);
      beforeSubmissions = await Submission.find(baseQuery).select('categoryId categoryName').lean();
      console.log(`📋 Found ${beforeSubmissions.length} submissions without user filtering`);
    }
    
    console.log(`📋 Found ${beforeSubmissions.length} before submissions`);
    
    // Extract unique categories with imageCount
    const beforeCategories = beforeSubmissions.reduce((acc, submission) => {
      let existing = acc.find(cat => cat.categoryId === submission.categoryId);
      if (!existing) {
        existing = {
          categoryId: submission.categoryId,
          categoryName: submission.categoryName,
          imageCount: 1
        };
        acc.push(existing);
      } else {
        existing.imageCount = (existing.imageCount || 1) + 1;
      }
      return acc;
    }, []);
    
    console.log(`📋 Before categories:`, beforeCategories);
    res.json(beforeCategories);
    
  } catch (error) {
    console.error('❌ Error loading before categories:', error);
    res.status(500).json({ error: 'Failed to load before categories' });
  }
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

  console.log(`Tìm thấy user: ${user.Username}, Role: ${user.Role}, User ID: ${user['User ID']}`);  // For demo purposes, we'll use simple password comparison
  // In production, use proper password hashing
  if (user.Password === password) {
    req.session.user = {
      id: user['User ID'].trim(),
      userId: user['User ID'].trim(), // Add for consistency
      username: user.Username ? user.Username.trim() : '',
      tdsName: user['TDS name'] ? user['TDS name'].trim() : '', // Keep for compatibility
      role: user.Role ? user.Role.trim() : ''
    };
    
    console.log('Đăng nhập thành công, session user:', req.session.user);
    res.json({ success: true, user: req.session.user });
  } else {
    console.log('Password không khớp');
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Check session API
app.get('/api/check-session', (req, res) => {
  if (req.session.user) {
    res.json({ success: true, user: req.session.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
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
app.get('/api/template/stores-sample', async (req, res) => {
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

app.get('/api/template/categories-sample', async (req, res) => {
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

// Export users template/data
app.get('/api/template/users-sample', async (req, res) => {
  try {
    // Get all users from MongoDB
    const users = await User.find({}, { password: 0 }).sort({ username: 1 }).lean();
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Users Data');
    
    // Use the exact field names that the database expects
    worksheet.columns = [
      { header: 'username', key: 'username', width: 20 },
      { header: 'userId', key: 'userId', width: 15 },
      { header: 'role', key: 'role', width: 15 },
      { header: 'status', key: 'status', width: 10 },
      { header: 'createdAt', key: 'createdAt', width: 20 }
    ];
    
    // Add all actual user data
    users.forEach(user => {
      worksheet.addRow({
        username: user.username || '',
        userId: user.userId || '',
        role: user.role || '',
        status: user.status || 'active',
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString().split('T')[0] : ''
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
    const ext = filePath.split('.').pop().toLowerCase();
    let stores = [];
    if (ext === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.worksheets[0];      worksheet.eachRow((row, rowNumber) => {
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
          id: values[1], name: values[2], description: values[3], isActive: values[4], order: values[5]
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

// Admin Submission Management API Endpoints
// Get all submissions with filtering
app.get('/api/admin/submissions', requireAdmin, async (req, res) => {
  try {
    const { username, tdsName, store, category, startDate, endDate } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (username && username.trim() !== '') {
      filter.username = { $regex: username.trim(), $options: 'i' };
    }
    
    if (tdsName && tdsName.trim() !== '') {
      filter.tdsName = { $regex: tdsName.trim(), $options: 'i' };
    }
    
    if (store && store.trim() !== '') {
      filter.storeName = { $regex: store.trim(), $options: 'i' };
    }
    
    if (category && category.trim() !== '') {
      filter.categoryName = { $regex: category.trim(), $options: 'i' };
    }
    
    if (startDate || endDate) {
      filter.submittedAt = {};
      if (startDate) {
        filter.submittedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999); // End of day
        filter.submittedAt.$lte = endDateTime;
      }
    }
    
    console.log('Admin submissions filter:', filter);
    
    const submissions = await Submission.find(filter)
      .sort({ submittedAt: -1 })
      .lean();
    
    console.log(`Found ${submissions.length} submissions for admin`);
    res.json(submissions);
    
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Bulk delete submissions
app.delete('/api/admin/submissions/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Valid submission IDs array is required' });
    }
    
    // Find all submissions to get their image URLs
    const submissions = await Submission.find({ _id: { $in: ids } });
    
    if (submissions.length === 0) {
      return res.status(404).json({ error: 'No submissions found' });
    }
    
    // Delete images from S3
    const { deleteFromS3 } = require('./config/s3Config');
    let deletedImagesCount = 0;
    for (const submission of submissions) {
      if (submission.images && submission.images.length > 0) {
        for (const imageUrl of submission.images) {
          try {
            await deleteFromS3(imageUrl);
            deletedImagesCount++;
          } catch (s3Error) {
            console.error('Error deleting image from S3:', s3Error);
            // Continue with deletion even if some images fail to delete
          }
        }
      }
    }
    
    // Delete all submissions from MongoDB
    const deleteResult = await Submission.deleteMany({ _id: { $in: ids } });
    
    console.log(`Bulk delete completed: ${deleteResult.deletedCount} submissions deleted, ${deletedImagesCount} images removed from S3`);
    
    res.json({ 
      success: true, 
      deletedCount: deleteResult.deletedCount,
      deletedImagesCount: deletedImagesCount
    });
    
  } catch (error) {
    console.error('Bulk delete submissions error:', error);
    res.status(500).json({ error: 'Failed to delete submissions' });
  }
});

// Delete single submission
app.delete('/api/admin/submissions/:id', requireAdmin, async (req, res) => {
  try {
    const submissionId = req.params.id;
    
    // Find the submission to get the image URLs
    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    // Delete images from S3 if needed
    if (submission.images && submission.images.length > 0) {
      const { deleteFromS3 } = require('./config/s3Config');
      for (const imageUrl of submission.images) {
        try {
          await deleteFromS3(imageUrl);
        } catch (s3Error) {
          console.error('Error deleting image from S3:', s3Error);
          // Continue with deletion even if some images fail to delete
        }
      }
    }
    
    // Delete the submission from MongoDB
    await Submission.findByIdAndDelete(submissionId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete submission error:', error);
    res.status(500).json({ error: 'Failed to delete submission' });  }
});

// Check admin session
app.get('/api/admin/check-session', (req, res) => {
  if (req.session.user && req.session.user.role === 'Admin') {
    res.json({ isAdmin: true, user: req.session.user });
  } else {
    res.status(403).json({ isAdmin: false });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
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
    const hashedPassword = await bcrypt.hash(password, 10);
    
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

// Get user submission history (paginated)
app.get('/api/user/history', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'User not logged in' });
  }
  try {
    const userId = req.session.user.id || req.session.user.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Find all submissions for this user
    const allSubs = await Submission.find({ userId }).sort({ submittedAt: -1 }).lean();

    // Group by sessionId + storeId
    const sessionMap = {};
    for (const sub of allSubs) {
      const key = `${sub.sessionId}|${sub.storeId}`;
      if (!sessionMap[key]) {
        sessionMap[key] = {
          storeId: sub.storeId,
          storeName: sub.storeName,
          sessionId: sub.sessionId,
          submittedAt: sub.submittedAt,
          before: [],
          after: []
        };
      }
      if (sub.submissionType === 'before') sessionMap[key].before.push(sub);
      if (sub.submissionType === 'after') sessionMap[key].after.push(sub);
    }    // Convert to array and paginate
    const sessions = Object.values(sessionMap).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const paged = sessions.slice(skip, skip + limit);
    
    // Format response to match client expectations
    const totalPages = Math.ceil(sessions.length / limit);
    res.json({ 
      history: paged, 
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        total: sessions.length,
        limit: limit
      }
    });
  } catch (error) {
    console.error('❌ Error loading user history:', error);
    res.status(500).json({ error: 'Failed to load user history' });
  }
});

// Export submissions as Excel
app.get('/api/admin/export', requireAdmin, async (req, res) => {
  try {
    // Build filter from query params (use same logic as submissions API)
    const filter = {};
    if (req.query.username && req.query.username.trim() !== '') {
      filter.username = { $regex: req.query.username.trim(), $options: 'i' };
    }
    if (req.query.tdsName && req.query.tdsName.trim() !== '') {
      filter.tdsName = { $regex: req.query.tdsName.trim(), $options: 'i' };
    }
    if (req.query.store && req.query.store.trim() !== '') {
      filter.storeName = { $regex: req.query.store.trim(), $options: 'i' };
    }
    if (req.query.category && req.query.category.trim() !== '') {
      filter.categoryName = { $regex: req.query.category.trim(), $options: 'i' };
    }
    if (req.query.startDate || req.query.endDate) {
      filter.submittedAt = {};
      if (req.query.startDate) {
        filter.submittedAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        const endDateTime = new Date(req.query.endDate);
        endDateTime.setHours(23, 59, 59, 999); // End of day
        filter.submittedAt.$lte = endDateTime;
      }    }
    
    console.log('Export filter:', filter);
    const submissions = await Submission.find(filter).sort({ submittedAt: -1 }).lean();
    console.log(`Found ${submissions.length} submissions for Excel export`);
    
    // Debug: Log some sample submission dates if any exist
    if (submissions.length > 0) {
      console.log('Sample submission dates:');
      submissions.slice(0, 3).forEach((sub, idx) => {
        console.log(`  ${idx + 1}. ${sub.submittedAt} (${sub.storeName}) - Note: "${sub.note}" - Fixed: ${sub.fixed} - Type: ${sub.submissionType}`);
      });
    } else {
      console.log('No submissions found matching the filter criteria');
    }
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Submissions');    worksheet.columns = [
      { header: 'Username', key: 'username', width: 15 },
      { header: 'TDS Name', key: 'tdsName', width: 20 },
      { header: 'Store Name', key: 'storeName', width: 30 },
      { header: 'Category', key: 'categoryName', width: 25 },
      { header: 'Step (Before/After)', key: 'submissionType', width: 15 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Fixed Status', key: 'fixedStatus', width: 15 },
      { header: 'Images', key: 'images', width: 50 },
      { header: 'Date', key: 'submittedAt', width: 20 }
    ];    submissions.forEach(sub => {
      // Format the fixed status for display
      let fixedStatus = '';
      if (sub.submissionType === 'after') {
        if (sub.fixed === true) {
          fixedStatus = 'Đã fix';
        } else if (sub.fixed === false) {
          fixedStatus = 'Chưa fix';
        } else {
          fixedStatus = 'Chưa trả lời';
        }
      } else {
        fixedStatus = '0';
      }
      
      worksheet.addRow({
        username: sub.username || '',
        tdsName: sub.tdsName || '',
        storeName: sub.storeName || '',
        categoryName: sub.categoryName || '',
        submissionType: sub.submissionType || '',
        note: sub.note || '',
        fixedStatus: fixedStatus,
        images: (sub.images || []).join(', '),
        submittedAt: sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('vi-VN') : ''
      });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export Excel error:', error);
    res.status(500).json({ error: 'Failed to export Excel' });
  }
});

// Export submissions as PowerPoint (2x2 grid per step, matching target layout)
app.get('/api/admin/export-pptx', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.username && req.query.username.trim() !== '') {
      filter.username = { $regex: req.query.username.trim(), $options: 'i' };
    }
    if (req.query.tdsName && req.query.tdsName.trim() !== '') {
      filter.tdsName = { $regex: req.query.tdsName.trim(), $options: 'i' };
    }
    if (req.query.store && req.query.store.trim() !== '') {
      filter.storeName = { $regex: req.query.store.trim(), $options: 'i' };
    }
    if (req.query.category && req.query.category.trim() !== '') {
      filter.categoryName = { $regex: req.query.category.trim(), $options: 'i' };
    }
    if (req.query.startDate || req.query.endDate) {
      filter.submittedAt = {};
      if (req.query.startDate) {
        filter.submittedAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        const endDateTime = new Date(req.query.endDate);
        endDateTime.setHours(23, 59, 59, 999); // End of day
        filter.submittedAt.$lte = endDateTime;
      }
    }
      console.log('Export PPTX filter:', filter);
    const submissions = await Submission.find(filter).sort({ submittedAt: -1 }).lean();
    console.log(`Found ${submissions.length} submissions for PPTX export`);
    
    // Group by sessionId + storeId + categoryId
    const sessionMap = {};
    for (const sub of submissions) {
      const key = `${sub.sessionId}|${sub.storeId}|${sub.categoryId}`;
      if (!sessionMap[key]) {
        sessionMap[key] = { before: [], after: [], meta: sub };
      }
      if (sub.submissionType === 'before') sessionMap[key].before.push(sub);
      if (sub.submissionType === 'after') sessionMap[key].after.push(sub);
    }    // Group sessions by store for creating store info slides
    const storeMap = {};
    const storeIds = [...new Set(Object.values(sessionMap).map(session => session.meta.storeId))];
    
    // Fetch full store information for all unique stores
    // Note: storeId in submissions is actually the store code, not MongoDB _id
    const stores = await Store.find({ 
      $or: [
        { storeCode: { $in: storeIds } },
        { 'Store code (Fieldcheck)': { $in: storeIds } },
        { STT: { $in: storeIds } }
      ]
    }).lean();
    
    const storeInfoMap = {};
    stores.forEach(store => {
      // Map by the actual storeId value used in submissions
      const storeKey = store.storeCode || store['Store code (Fieldcheck)'] || store.STT;
      if (storeKey) {
        storeInfoMap[storeKey] = store;
      }
    });

    Object.values(sessionMap).forEach((session) => {
      const storeKey = session.meta.storeId;
      if (!storeMap[storeKey]) {
        storeMap[storeKey] = {
          storeMeta: session.meta,
          storeInfo: storeInfoMap[storeKey] || {}, // Full store information
          sessions: []
        };
      }
      storeMap[storeKey].sessions.push(session);
    });

    const pptx = new PptxGenJS();
    const placeholderPath = 'public/no-image-placeholder.svg';
    
    pptx.defineSlideMaster({
      title: 'CLEAN_LAYOUT',
      background: { fill: 'FFFFFF' },
      objects: [
        { shape: 'rect', x: 0, y: 0, w: 10, h: 0.6, fill: { color: 'F2F2F2' } },
        { shape: 'line', x: 5, y: 0.6, w: 0, h: 5.5, line: { color: 'C0C0C0', width: 2 } }
      ]
    });

    // Define store info slide master with light blue background
    pptx.defineSlideMaster({
      title: 'STORE_INFO_LAYOUT',
      background: { fill: 'E6F2FF' }, // Light blue background
      objects: []
    });    // Create slides for each store
    Object.values(storeMap).forEach(({ storeMeta, storeInfo, sessions }) => {
      // Create store information slide first
      const storeInfoSlide = pptx.addSlide({ masterName: 'STORE_INFO_LAYOUT' });
        // Store information in two columns
      const startY = 0.3; // Starting Y position
      const rowHeight = 0.8; // Height between rows
      
      // First column properties
      const col1Props = {
        x: 0.4, // X position for left column
        w: 4.5, // Width of text box for first column
        h: 0.6, // Height of each text box
        fontSize: 18,
        bold: true,
        color: '1F4E79', // Dark blue color for better contrast on light blue background
        align: 'left'
      };

      // Second column properties
      const col2Props = {
        x: 5.2, // X position for right column
        w: 4.5, // Width of text box for second column
        h: 0.6, // Height of each text box
        fontSize: 18,
        bold: true,
        color: '1F4E79', // Dark blue color for better contrast on light blue background
        align: 'left'
      };

      // Count "Chưa fix" (not fixed) responses for this store
      let unfixedCount = 0;
      sessions.forEach(({ after }) => {
        after.forEach(submission => {
          if (submission.fixed === false) {
            unfixedCount++;
          }
        });
      });

      // COLUMN 1 - Left side
      // Row 1: Store Name
      storeInfoSlide.addText(`Store: ${storeInfo.storeName || storeMeta.storeName || 'N/A'}`, {
        ...col1Props,
        y: startY
      });

      // Row 2: TDL Name
      storeInfoSlide.addText(`TDL: ${storeInfo.tdlName || 'N/A'}`, {
        ...col1Props,
        y: startY + rowHeight
      });

      // Row 3: TDS Name
      storeInfoSlide.addText(`TDS: ${storeInfo.tdsName || storeMeta.tdsName || 'N/A'}`, {
        ...col1Props,
        y: startY + (rowHeight * 2)
      });

      // Row 4: Type Shop
      storeInfoSlide.addText(`Type: ${storeInfo.typeShop || 'N/A'}`, {
        ...col1Props,
        y: startY + (rowHeight * 3)
      });

      // Row 5: Province
      storeInfoSlide.addText(`Province: ${storeInfo.province || 'N/A'}`, {
        ...col1Props,
        y: startY + (rowHeight * 4)
      });

      // Format date as DD-MM-YYYY for store info slide
      const formatDateForStore = (date) => {
        if (!date) return 'N/A';
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
      };

      // Row 6: Submitted At
      storeInfoSlide.addText(`Submitted: ${formatDateForStore(storeMeta.submittedAt)}`, {
        ...col1Props,
        y: startY + (rowHeight * 5)
      });

      // COLUMN 2 - Right side
      // Row 1 of Column 2: Unfixed POSM/Shelves count
      storeInfoSlide.addText(`Có lỗi POSM/Quầy kệ không: ${unfixedCount}`, {
        ...col2Props,
        y: startY
      });

      // Now create submission slides for this store
      sessions.forEach(({ before, after, meta }) => {
      const slide = pptx.addSlide({ masterName: 'CLEAN_LAYOUT' });
      // Format date as DD-MM-YYYY
      const formatDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
      };
      // First row: storeName | tdsName | Date
      const title1 = `${meta.storeName || ''} | ${meta.tdsName || ''} | ${formatDate(meta.submittedAt)}`;
      slide.addText(title1, {
        x: 0.3, y: 0.16, w: 9, h: 0.5, fontSize: 16, bold: true, align: 'left', color: '333333'
      });
      // Second row: category | userName
      const title2 = `${meta.categoryName || ''} | ${meta.username || ''}`;
      slide.addText(title2, {
        x: 0.3, y: 0.53, w: 9, h: 0.4, fontSize: 12, align: 'left', color: '666666'
      });
      // Section labels
      slide.addText('Before', { x: 0.3, y: 0.95, w: 4, h: 0.4, fontSize: 13, bold: true, color: '0070C0' });
      slide.addText('After', { x: 5.2, y: 0.95, w: 4, h: 0.4, fontSize: 13, bold: true, color: '00B050' });
      slide.addShape(pptx.ShapeType.line, { x: 5.05, y: 1.1, w: 0, h: 4.4, line: { color: 'C0C0C0', width: 2 } });
      // Notes (grey, not bold, separated)
      let beforeNote = '';
      if (before.length > 0 && before[0].note) beforeNote = before[0].note;
      if (beforeNote) {
        slide.addText(beforeNote, { x: 0.3, y: 1.2, w: 4.5, h: 0.4, fontSize: 9, color: '888888', bold: false });
      }
      let afterNote = '';
      if (after.length > 0 && after[0].note) afterNote = after[0].note;
      if (afterNote) {
        slide.addText(afterNote, { x: 5.2, y: 1.2, w: 4.5, h: 0.4, fontSize: 9, color: '888888', bold: false });
      }
      const imgW = 2.23, imgH = 1.68, gapX = 0.2, gapY = 0.2;
      const leftStartX = 0.2, leftStartY = 1.6;
      const rightStartX = 5.2, rightStartY = 1.6;
      // Always 4 images for before grid
      let beforeImgs = before.flatMap(sub => sub.images || []);
      while (beforeImgs.length < 4) beforeImgs.push(placeholderPath);
      beforeImgs = beforeImgs.slice(0, 4);
      beforeImgs.forEach((img, idx) => {
        const row = Math.floor(idx / 2);
        const col = idx % 2;
        slide.addImage({
          path: img,
          x: leftStartX + col * (imgW + gapX),
          y: leftStartY + row * (imgH + gapY),
          w: imgW,
          h: imgH
        });
      });
      // Always 4 images for after grid
      let afterImgs = after.flatMap(sub => sub.images || []);
      while (afterImgs.length < 4) afterImgs.push(placeholderPath);
      afterImgs = afterImgs.slice(0, 4);
      afterImgs.forEach((img, idx) => {
        const row = Math.floor(idx / 2);
        const col = idx % 2;
        slide.addImage({
          path: img,
          x: rightStartX + col * (imgW + gapX),
          y: rightStartY + row * (imgH + gapY),
          w: imgW,
          h: imgH
        });      });
      }); // Close sessions.forEach
    }); // Close Object.values(storeMap).forEach
    
    const buf = await pptx.write('nodebuffer');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions.pptx"');
    res.end(buf);
  } catch (error) {
    console.error('Export PPTX error:', error);
    res.status(500).json({ error: 'Failed to export PowerPoint' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
