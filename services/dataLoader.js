/**
 * Data loading service for users, stores, and categories
 */
const fs = require('fs');
const csv = require('csv-parser');
const User = require('../models/User');
const Store = require('../models/Store');
const Category = require('../models/Category');

// In-memory data arrays
let usersData = [];
let storesData = [];
let categoriesData = [];

/**
 * Load all data on startup
 */
async function loadData() {
  await loadUsers();
  await loadStoresFromMongoDB();
  await loadCategoriesFromMongoDB();
}

/**
 * Load users from MongoDB with CSV fallback
 */
async function loadUsers() {
  try {
    console.log('🔄 Loading users from MongoDB...');
    const users = await User.find({});
    usersData = users.map(user => ({
      'Username': user.username,
      'User ID': user.userId,
      'Role': user.role,
      'Password': user.password,
      'TDS name': user.tdsName || ''
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
    await loadUsersFromCSV();
  }
}

/**
 * Load users from CSV file
 */
async function loadUsersFromCSV() {
  return new Promise((resolve) => {
    usersData = [];
    fs.createReadStream('users.csv')
      .pipe(csv())
      .on('data', (row) => {
        const cleanRow = {};
        Object.keys(row).forEach(key => {
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

/**
 * Load stores from MongoDB with CSV fallback
 */
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
    await loadStoresFromCSV();
  }
}

/**
 * Load stores from CSV file
 */
async function loadStoresFromCSV() {
  return new Promise((resolve) => {
    storesData = [];
    fs.createReadStream('storelist.csv')
      .pipe(csv())
      .on('data', (row) => {
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

        const storesWithoutCodes = storesData.filter(store => !store['Store code (Fieldcheck)']);
        if (storesWithoutCodes.length > 0) {
          console.warn(`⚠️ Warning: ${storesWithoutCodes.length} stores don't have a store code. Example:`, storesWithoutCodes[0]);
        }
        resolve();
      });
  });
}

/**
 * Load categories from MongoDB with CSV fallback
 */
async function loadCategoriesFromMongoDB() {
  try {
    console.log('🔄 Loading categories from MongoDB...');
    const categories = await Category.find({ isActive: true }).sort({ order: 1, name: 1 });

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
    await loadCategoriesFromCSV();
  }
}

/**
 * Load categories from CSV file
 */
async function loadCategoriesFromCSV() {
  return new Promise((resolve) => {
    categoriesData = [];
    fs.createReadStream('category.csv')
      .pipe(csv())
      .on('data', (row) => {
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

/**
 * Migrate categories from CSV to MongoDB
 */
async function migrateCategoriesFromCSVToMongoDB() {
  try {
    console.log('🔄 Starting category migration from CSV to MongoDB...');

    await loadCategoriesFromCSV();

    if (categoriesData.length === 0) {
      console.log('⚠️ No categories found in CSV file');
      return;
    }

    await Category.deleteMany({});
    console.log('🗑️ Cleared existing categories');

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

    await loadCategoriesFromMongoDB();

  } catch (error) {
    console.error('❌ Error migrating categories:', error);
  }
}

/**
 * Get data arrays
 */
function getData() {
  return {
    usersData,
    storesData,
    categoriesData
  };
}

/**
 * Set data arrays (for updating after bulk operations)
 */
function setUsersData(data) {
  usersData = data;
}

function setStoresData(data) {
  storesData = data;
}

function setCategoriesData(data) {
  categoriesData = data;
}

module.exports = {
  loadData,
  loadUsers,
  loadStoresFromMongoDB,
  loadCategoriesFromMongoDB,
  getData,
  setUsersData,
  setStoresData,
  setCategoriesData,
  migrateCategoriesFromCSVToMongoDB
};
