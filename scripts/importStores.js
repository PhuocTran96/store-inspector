const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import Store model
const Store = require('../models/Store');

console.log('🚀 Starting store import process...');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:xNo9bso92Yvt0r7y@cluster0.bglf6fm.mongodb.net/project_display_app';

async function importStores() {
    try {
        console.log('📡 Connecting to MongoDB...');
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to MongoDB');

        // Clear existing stores
        console.log('🧹 Clearing existing stores...');
        const deletedCount = await Store.deleteMany({});
        console.log(`🗑️ Deleted ${deletedCount.deletedCount} existing stores`);

        const stores = [];
        const csvPath = path.join(__dirname, '../storelist.csv');
        console.log('📂 Reading CSV file:', csvPath);

        // Check if CSV file exists
        if (!fs.existsSync(csvPath)) {
            throw new Error(`CSV file not found: ${csvPath}`);
        }

        // Read and parse CSV
        await new Promise((resolve, reject) => {
            let rowCount = 0;
            fs.createReadStream(csvPath)
                .pipe(csv())
                .on('data', (row) => {
                    rowCount++;
                    if (rowCount <= 3) {
                        console.log(`📄 Processing row ${rowCount}:`, Object.keys(row));
                    }
                    
                    // Map CSV columns to Store schema
                    const store = {
                        stt: row['STT'] || '',
                        tdlName: row['TDL name'] || '',
                        tdsName: row['TDS name'] || '',
                        promoterName: row['Promoter name'] || '',
                        typeShop: row['Type shop'] || '',
                        headcountInvest: row['Headcount invest'] || '',
                        headcountActive: row['Headcount active'] || '',
                        seniority: row['Seniority\n (Ngày)'] || row['Seniority (Ngày)'] || '',
                        storeName: row['Store name'] || '',
                        storeCode: row['Store code (Fieldcheck)'] || '',
                        dealerCode: row['Dealer code'] || '',
                        address: row['Address (No.Street, Ward/District, City, Province/State/Region)'] || '',
                        storeType: row['Store type/ grade (ABC)'] || '',
                        channel: row['Channel'] || '',
                        keyCities: row['Key cities'] || '',
                        nearestKeyCity: row['Nearest Key City'] || '',
                        rankingCommune: row['Ranking Commune'] || '',
                        base: row['Base'] || '',
                        shopTier: row['SHOP TIER'] || '',
                        region: row['Region'] || '',
                        province: row['Province'] || '',
                        city: row['City'] || '',
                        district: row['District'] || ''
                    };
                    stores.push(store);
                })
                .on('end', () => {
                    console.log(`📊 Finished reading CSV. Total rows: ${stores.length}`);
                    resolve();
                })
                .on('error', (error) => {
                    console.error('❌ Error reading CSV:', error);
                    reject(error);
                });
        });

        // Insert all stores
        console.log('💾 Inserting stores into MongoDB...');
        const result = await Store.insertMany(stores);
        console.log(`✅ Successfully imported ${result.length} stores`);
        
        // Display sample data
        console.log('\n--- Sample imported stores ---');
        const sampleStores = await Store.find().limit(3);
        sampleStores.forEach((store, index) => {
            console.log(`${index + 1}. ${store.storeName} (${store.storeCode}) - ${store.address}`);
        });

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('🔌 MongoDB connection closed');
        }
    }
}

// Run the import
importStores()
    .then(() => {
        console.log('🎉 Import completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Import failed:', error.message);
        process.exit(1);
    });
