// Test script to verify AWS S3 configuration
require('dotenv').config();
const AWS = require('aws-sdk');

console.log('🧪 Testing AWS S3 Configuration...\n');

// Check environment variables
console.log('📋 Environment Variables:');
console.log(`AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing'}`);
console.log(`AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`AWS_REGION: ${process.env.AWS_REGION || '❌ Missing'}`);
console.log(`AWS_S3_BUCKET_NAME: ${process.env.AWS_S3_BUCKET_NAME || '❌ Missing'}\n`);

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

// Test S3 connection
async function testS3Connection() {
  try {
    console.log('🔗 Testing S3 connection...');
    
    // List buckets to test credentials
    const data = await s3.listBuckets().promise();
    console.log('✅ Successfully connected to AWS S3');
    console.log(`📦 Found ${data.Buckets.length} buckets`);
    
    // Check if our target bucket exists
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    if (bucketName) {
      const bucketExists = data.Buckets.some(bucket => bucket.Name === bucketName);
      if (bucketExists) {
        console.log(`✅ Target bucket '${bucketName}' exists`);
      } else {
        console.log(`⚠️ Target bucket '${bucketName}' not found`);
        console.log('📝 Available buckets:');
        data.Buckets.forEach(bucket => {
          console.log(`   - ${bucket.Name}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ S3 connection failed:', error.message);
    
    if (error.code === 'InvalidAccessKeyId') {
      console.log('💡 Check your AWS_ACCESS_KEY_ID');
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.log('💡 Check your AWS_SECRET_ACCESS_KEY');
    } else if (error.code === 'CredentialsError') {
      console.log('💡 Check your AWS credentials configuration');
    }
  }
}

testS3Connection();
