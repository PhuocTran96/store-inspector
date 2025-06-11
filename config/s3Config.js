const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');

// Configure AWS with error handling
try {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
  });
} catch (error) {
  console.warn('AWS configuration warning:', error.message);
}

const s3 = new AWS.S3();

// Configure multer for S3 upload
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    // Remove ACL as many buckets don't support it
    // acl: 'public-read', 
    key: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'store-inspections/' + uniqueSuffix + '-' + file.originalname);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Function to delete file from S3
const deleteFromS3 = async (fileUrl) => {
  try {
    // Extract key from S3 URL
    const urlParts = new URL(fileUrl);
    const key = urlParts.pathname.substring(1); // Remove leading slash
    
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key
    };
    
    await s3.deleteObject(params).promise();
    console.log(`Successfully deleted from S3: ${key}`);
    return true;
  } catch (error) {
    console.error('Error deleting from S3:', error);
    return false;
  }
};

// Function to upload buffer to S3 (for base64 images)
const uploadBufferToS3 = async (buffer, filename, contentType = 'image/jpeg') => {
  try {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const key = `store-inspections/${uniqueSuffix}-${filename}`;
    
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Remove ACL as many buckets don't support it
      // ACL: 'public-read'
    };
    
    const result = await s3.upload(params).promise();
    return result.Location;
  } catch (error) {
    console.error('Error uploading buffer to S3:', error);
    throw error;
  }
};

module.exports = {
  upload,
  s3,
  deleteFromS3,
  uploadBufferToS3
};
