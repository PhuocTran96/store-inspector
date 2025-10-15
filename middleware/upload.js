/**
 * File upload middleware configuration
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Configure multer for local file uploads (for admin templates)
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads');
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

module.exports = {
  fileUpload
};
