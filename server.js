const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Cloudinary for image storage
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://admin:xNo9bso92Yvt0r7y@cluster0.bglf6fm.mongodb.net/project_display_app', {
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
  }
  // Load stores from MongoDB
  await loadStoresFromMongoDB();
  
  // Load categories from CSV (will migrate this later)
  await loadCategoriesFromCSV();
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

// Configure multer for image upload
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

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

// Get all store names for autocomplete
app.get('/api/store-names', (req, res) => {
  try {
    const storeNames = storesData.map(store => ({
      name: store['Store name'],
      code: store['Store code (Fieldcheck)'],
      address: store['Address (No.Street, Ward/District, City, Province/State/Region)']
    })).filter(store => store.name && store.name.trim() !== '');
    
    res.json(storeNames);
  } catch (error) {
    console.error('Error getting store names:', error);
    res.status(500).json({ error: 'Không thể lấy danh sách tên cửa hàng' });
  }
});

// Submit inspection data
app.post('/api/submit', upload.array('images', 64), async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }  try {
    const { storeId, submissions } = req.body;
    const submissionsData = JSON.parse(submissions);
    
    // Find the store name based on store code instead of STT
    const store = storesData.find(s => s['Store code (Fieldcheck)'] === storeId);
    const storeName = store ? store['Store name'] : 'Unknown Store';
    
    console.log(`Processing submission for store: ${storeName} (Code: ${storeId})`);
    
    // Upload images to Cloudinary
    const imageUploads = [];
    if (req.files) {
      for (const file of req.files) {
        try {
          const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              { resource_type: 'image' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            ).end(file.buffer);
          });
          imageUploads.push(result.secure_url);
        } catch (error) {
          console.error('Image upload error:', error);
        }
      }
    }

    // Process submissions and save to database
    let imageIndex = 0;
    for (const submission of submissionsData) {
      const categoryImages = [];
      for (let i = 0; i < submission.imageCount; i++) {
        if (imageIndex < imageUploads.length) {
          categoryImages.push(imageUploads[imageIndex]);
          imageIndex++;
        }
      }      const newSubmission = new Submission({
        username: req.session.user.username,
        storeId: storeId, // Now using store code instead of STT
        storeName: storeName,
        categoryId: submission.categoryId,
        categoryName: submission.categoryName,
        note: submission.note,
        images: categoryImages,
        submittedAt: new Date()      });
      
      try {
        await newSubmission.save();
        console.log(`Saved submission for category: ${submission.categoryName} in store: ${storeName}`);
      } catch (saveError) {
        console.error('Error saving submission:', saveError);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ error: 'Submission failed' });
  }
});

// Admin export to Excel
app.get('/api/admin/export', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    // Apply filters if provided
    const filters = {};
    if (req.query.username) filters.username = new RegExp(req.query.username, 'i');
    if (req.query.store) filters.storeName = new RegExp(req.query.store, 'i');
    if (req.query.category) filters.categoryName = new RegExp(req.query.category, 'i');
    
    // Date range filtering
    if (req.query.startDate || req.query.endDate) {
      filters.submittedAt = {};
      
      if (req.query.startDate) {
        // Set start of day for startDate
        const startDate = new Date(req.query.startDate);
        startDate.setHours(0, 0, 0, 0);
        filters.submittedAt.$gte = startDate;
      }
      
      if (req.query.endDate) {
        // Set end of day for endDate
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999);
        filters.submittedAt.$lte = endDate;
      }
    }
    
    console.log('Export filters:', filters);
      const submissions = await Submission.find(filters).sort({ submittedAt: -1 });
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Submissions');

    // Headers
    const headers = ['Username', 'Store', 'Category', 'Note', 'Date'];
    for (let i = 1; i <= 8; i++) {
      headers.push(`Image ${i}`);
    }
    worksheet.addRow(headers);
    
    // Data rows
    for (const submission of submissions) {
      // Use storeName directly from the submission document
      // If storeName is not available, try to find it using storeId as the store code
      let displayStoreName = submission.storeName || '';
      
      if (!displayStoreName && submission.storeId) {
        const store = storesData.find(s => s['Store code (Fieldcheck)'] === submission.storeId);
        displayStoreName = store ? store['Store name'] : 'Unknown Store';
      }
      
      // Format date as DD-MM-YYYY
      const submissionDate = submission.submittedAt ? new Date(submission.submittedAt) : new Date();
      const formattedDate = `${String(submissionDate.getDate()).padStart(2, '0')}-${String(submissionDate.getMonth() + 1).padStart(2, '0')}-${submissionDate.getFullYear()}`;
      
      const row = [
        submission.username,
        displayStoreName,
        submission.categoryName,
        submission.note,
        formattedDate
      ];
      
      // Add image URLs (up to 8)
      for (let i = 0; i < 8; i++) {
        row.push(submission.images[i] || '');
      }
      
      worksheet.addRow(row);
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=submissions.xlsx');

    // Send the Excel file
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Admin check session
app.get('/api/admin/check-session', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  if (req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  res.json({ success: true, user: req.session.user });
});

// Admin get submissions
app.get('/api/admin/submissions', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    // Apply filters if provided
    const filters = {};
    if (req.query.username) filters.username = new RegExp(req.query.username, 'i');
    if (req.query.store) filters.storeName = new RegExp(req.query.store, 'i');
    if (req.query.category) filters.categoryName = new RegExp(req.query.category, 'i');
    
    // Date range filtering
    if (req.query.startDate || req.query.endDate) {
      filters.submittedAt = {};
      
      if (req.query.startDate) {
        // Set start of day for startDate
        const startDate = new Date(req.query.startDate);
        startDate.setHours(0, 0, 0, 0);
        filters.submittedAt.$gte = startDate;
      }
      
      if (req.query.endDate) {
        // Set end of day for endDate
        const endDate = new Date(req.query.endDate);
        endDate.setHours(23, 59, 59, 999);
        filters.submittedAt.$lte = endDate;
      }
    }
    
    console.log('Submission filters:', filters);
    
    const submissions = await Submission.find(filters).sort({ submittedAt: -1 });
    res.json(submissions);
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Failed to retrieve submissions' });
  }
});

// Admin delete submission
app.delete('/api/admin/submissions/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const submissionId = req.params.id;
    
    // Find the submission to get the image URLs
    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    // Delete images from Cloudinary if needed
    if (submission.images && submission.images.length > 0) {
      for (const imageUrl of submission.images) {
        try {
          // Extract public_id from the Cloudinary URL
          const publicId = imageUrl.split('/').pop().split('.')[0];
          if (publicId) {
            await cloudinary.uploader.destroy(publicId);
          }
        } catch (cloudinaryError) {
          console.error('Error deleting image from Cloudinary:', cloudinaryError);
          // Continue with deletion even if some images fail to delete
        }
      }
    }
    
    // Delete the submission from MongoDB
    await Submission.findByIdAndDelete(submissionId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete submission error:', error);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

// Get user info by user ID for change password screen
app.post('/api/get-user-info', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Find user in MongoDB
    const user = await User.findOne({ userId: userId.trim() });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return user info (without password)
    res.json({
      id: user.userId,
      username: user.username,
      role: user.role
    });
    
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
