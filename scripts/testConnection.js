const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:xNo9bso92Yvt0r7y@cluster0.bglf6fm.mongodb.net/project_display_app';
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB successfully');
        
        const Store = require('../models/Store');
        const count = await Store.countDocuments();
        console.log(`Current stores count: ${count}`);
        
        await mongoose.connection.close();
        console.log('Connection closed');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testConnection();
