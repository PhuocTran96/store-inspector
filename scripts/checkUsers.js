const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');

// Read MongoDB URI
const mongoUri = fs.readFileSync(path.join(__dirname, '../mongoDB_URI.txt'), 'utf8').trim() + 'project_display_app';

async function checkUsers() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Check collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('📋 Available collections:');
        collections.forEach(col => console.log(`   - ${col.name}`));

        // Check users
        console.log('\n👥 Checking users...');
        const userCount = await User.countDocuments();
        console.log(`📊 Total users: ${userCount}`);

        if (userCount > 0) {
            const users = await User.find({}).limit(3);
            console.log('\n👤 Sample users:');
            users.forEach(user => {
                console.log(`   - ${user.username} (${user.userId}) - ${user.role}`);
            });
        }

        // Check database name
        console.log(`\n🗄️ Database name: ${mongoose.connection.name}`);
        console.log(`🔗 Connection state: ${mongoose.connection.readyState}`);

    } catch (error) {
        console.error('💥 Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

// Run check
if (require.main === module) {
    console.log('🔍 Checking MongoDB users...\n');
    checkUsers();
}

module.exports = { checkUsers };
