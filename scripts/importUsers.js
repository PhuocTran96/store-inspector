const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');

// Read MongoDB URI
const mongoUri = fs.readFileSync(path.join(__dirname, '../mongoDB_URI.txt'), 'utf8').trim() + 'project_display_app';

// Function to parse CSV
function parseCSV(csvContent) {
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const users = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());
        if (values.length >= headers.length) {
            const user = {
                username: values[0],
                userId: values[1], 
                role: values[2],
                password: values[3]
            };
            users.push(user);
        }
    }

    return users;
}

async function importUsers() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Read CSV file
        console.log('📖 Reading users.csv...');
        const csvPath = path.join(__dirname, '../users.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf8');
        
        // Parse CSV
        const users = parseCSV(csvContent);
        console.log(`📊 Found ${users.length} users in CSV`);

        // Clear existing users (optional - comment out if you want to keep existing data)
        console.log('🗑️ Clearing existing users...');
        await User.deleteMany({});

        // Insert users
        console.log('💾 Importing users to MongoDB...');
        const results = [];
        
        for (const userData of users) {
            try {
                const user = new User(userData);
                await user.save();
                results.push({ success: true, user: userData.username });
                console.log(`✅ Imported: ${userData.username} (${userData.userId})`);
            } catch (error) {
                results.push({ success: false, user: userData.username, error: error.message });
                console.log(`❌ Failed to import: ${userData.username} - ${error.message}`);
            }
        }

        // Summary
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log('\n📋 Import Summary:');
        console.log(`✅ Successful: ${successful}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📊 Total: ${results.length}`);

        if (failed > 0) {
            console.log('\n❌ Failed imports:');
            results.filter(r => !r.success).forEach(r => {
                console.log(`   - ${r.user}: ${r.error}`);
            });
        }

    } catch (error) {
        console.error('💥 Import failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

// Run import
if (require.main === module) {
    console.log('🚀 Starting user import from CSV to MongoDB...\n');
    importUsers();
}

module.exports = { importUsers, parseCSV };
