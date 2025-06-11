const mongoose = require('mongoose');
const Submission = require('../models/Submission');

// Test database connection and check image format
async function testImageFormat() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://admin:xNo9bso92Yvt0r7y@cluster0.bglf6fm.mongodb.net/project_display_app');
    console.log('Connected to MongoDB');
    
    const submission = await Submission.findOne({ images: { $exists: true, $ne: [] } });
    
    if (submission && submission.images && submission.images.length > 0) {
      console.log('Found submission with images');
      console.log('Image format sample:', submission.images[0].substring(0, 100));
      console.log('Has data: prefix?', submission.images[0].startsWith('data:'));
    } else {
      console.log('No submissions with images found');
    }
    
    mongoose.connection.close();
  } catch (error) {
    console.error('Test error:', error);
  }
}

testImageFormat();
