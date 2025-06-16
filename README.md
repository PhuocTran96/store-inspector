# Store Inspection App 2025

## Project Structure

```
store-inspection-app-2025/
├── app.json
├── package.json
├── Procfile
├── server.js                # Main Express server
├── config/
│   └── s3Config.js          # S3 upload config (if used)
├── models/
│   ├── Category.js          # Mongoose model for categories
│   ├── Store.js             # Mongoose model for stores
│   ├── Submission.js        # Mongoose model for submissions
│   └── User.js              # Mongoose model for users
├── public/
│   ├── admin.html           # Admin dashboard UI
│   ├── admin-styles.css     # Admin dashboard styles
│   ├── history.html         # Submission history UI
│   ├── index.html           # Main user UI
│   ├── script.js            # Main frontend JS
│   ├── styles.css           # Main user styles
│   └── ...                  # Other static assets
└── scripts/                 # (Optional) Utility scripts
```

## User Guidelines

### For Inspectors/Field Users
- **Login** with your User ID and password on the main page.
- **Select your assigned store** from the list.
- **Complete the inspection**:
  - Step 1: Take/upload photos and notes for each category ("Trước cải thiện").
  - Step 2: After improvement, select categories and take/upload "Sau cải thiện" photos.
- **Submit** your inspection when both steps are complete.
- **View your submission history** via the "Lịch sử" button.

### For Admins
- **Login** with admin credentials.
- **Access the Admin Dashboard** for:
  - **Template Management**: Upload/download store/category templates (CSV).
  - **Category Management**: Add, edit, delete, and migrate categories.
  - **User Management**: Add, edit, reset password, activate/deactivate, or delete users.
  - **Export Data**: Download inspection data as Excel or PowerPoint.

## CSV Template Guidelines
- **Store Template**: Columns required: `id, name, address, region`
- **Category Template**: Columns required: `id, name, description, isActive, order`

## Setup & Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up your `.env` file for MongoDB and (optionally) AWS S3.
3. Start the server:
   ```bash
   node server.js
   ```
4. Open `http://localhost:3000` in your browser.

## Notes
- All data is stored in MongoDB.
- Admin features are protected and require admin login.
- For any issues, check the browser console or server logs for errors.

---
For more details, see comments in each file or contact the project maintainer.
