# Store Inspector App

A mobile-friendly web application for store inspections, with a powerful admin dashboard for data management, user management, and reporting.

---

## Features

### For Inspectors (Field Users)
- **Login** with your user credentials.
- **Select assigned store** and complete inspections in two steps:
  1. **Before Improvement:** Take/upload photos and notes for each category.
  2. **After Improvement:** Select improved categories, take/upload new photos, and answer follow-up questions.
- **Submit** your inspection when both steps are complete.
- **View your submission history** at any time.

### For Admins
- **Admin Dashboard** with:
  - **Template Management:** Upload/download store and category templates (Excel).
  - **User Management:** Add, edit, activate/deactivate, reset password, or delete users.
  - **Category Management:** Manage inspection categories.
  - **Export Data:** Download inspection data as Excel or PowerPoint.
  - **Smart Pagination** and responsive tables for large datasets.

---

## Project Structure

```
store-inspector/
├── app.json
├── package.json
├── Procfile
├── server.js                # Main Express server
├── config/
│   └── s3Config.js          # S3 upload config (if used)
├── models/
│   ├── Category.js
│   ├── Store.js
│   ├── Submission.js
│   └── User.js
├── public/
│   ├── admin.html           # Admin dashboard UI
│   ├── admin-styles.css     # Admin dashboard styles
│   ├── history.html         # Submission history UI
│   ├── index.html           # Main user UI
│   ├── script.js            # Main frontend JS
│   ├── styles.css           # Main user styles
│   └── ...                  # Other static assets
└── README.md
```

---

## Setup & Run

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure environment:**
   - Create a `.env` file with your MongoDB URI and session secret.
   - (Optional) Add AWS S3 credentials if using image uploads to S3.
3. **Start the server:**
   ```bash
   npm start
   ```
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```
4. **Open the app:**
   - Go to [http://localhost:3000](http://localhost:3000) in your browser.

---

## Notes

- All data is stored in MongoDB.
- Admin features are protected and require admin login.
- For any issues, check the browser console or server logs for errors.
- For template formats, see the sample files in the admin dashboard.

---

For more details, see comments in each file or contact the project maintainer.
