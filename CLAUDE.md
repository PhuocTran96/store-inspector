# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A mobile-friendly store inspection web application built with Express.js, MongoDB, and AWS S3. Field users (TDL/TDS roles) conduct two-stage inspections ("before" and "after"), while admins manage users, categories, templates, and export data to Excel/PowerPoint. The application tracks MCP (Visit Plan) compliance and supports image uploads to S3.

## Development Commands

**Start the server:**
```bash
npm start              # Production mode
npm run dev            # Development mode with auto-reload (nodemon)
```

**Upload data templates:**
```bash
node upload-plan-visit-enhanced.js  # Upload MCP visit plan data
```

## Core Architecture

### Modular Structure (Recently Refactored)

The application was refactored from a 2461-line monolithic `server.js` into a clean modular architecture:

- **`server.js`** (116 lines) - Main Express server, MongoDB connection, middleware setup, route mounting
- **`middleware/`** - Authentication (`requireAuth`, `requireAdmin`, `logSession`) and file upload (Multer + S3) configuration
- **`services/`** - Business logic layer:
  - `dataLoader.js` - In-memory caching of users/stores/categories with MongoDB/CSV fallback
  - `mcpCompliance.js` - MCP visit plan compliance checking against `plan_visit` collection
- **`routes/`** - API endpoints organized by feature (auth, data, submissions, history, admin)
- **`models/`** - Mongoose schemas (User, Store, Category, Submission)
- **`config/`** - AWS S3 configuration (upload, delete, buffer handling)

### Data Flow & Caching Strategy

**On Startup:**
1. MongoDB connects → `loadData()` runs automatically
2. Users, stores, and categories loaded from MongoDB into in-memory arrays (`usersData`, `storesData`, `categoriesData`)
3. CSV fallback if MongoDB fails or collections are empty

**During Runtime:**
- Most read operations use in-memory cached data (fast, no DB queries)
- Write operations (submissions, admin CRUD) go to MongoDB
- After bulk template uploads, call `setUsersData()`, `setStoresData()`, or `setCategoriesData()` to refresh cache

### Session-Based Authentication

- Express sessions with MongoDB (via express-session)
- Session stores: `user` object with `{ username, userId, role, tdsName }`
- Three roles: **Admin** (full access), **TDL** (Team Development Leader), **TDS** (Team Development Supervisor)
- **Login uses `userId` (case-insensitive)** - users can log in with any case variation of their userId
- Field users see only assigned stores filtered by role and name matching
- **IMPORTANT:** After password changes (user self-service or admin reset), `loadUsers()` is called to refresh the in-memory cache immediately

### Two-Stage Submission Workflow

1. **Before Inspection** (`submissionType: 'before'`)
   - User selects store, takes photos of issues across categories
   - Each category submission includes: images, note, sessionId
   - `sessionId` links before/after submissions together

2. **After Inspection** (`submissionType: 'after'`)
   - Load categories from before step via `/api/before-categories/:storeId?sessionId=xxx`
   - User selects which categories were improved
   - For each: add new photos, answer fixed status (`fixed: true/false`), optionally set `expectedResolutionDate`

### Image Handling

- Frontend sends base64-encoded images
- Backend extracts type/buffer from base64, uploads to S3 using `uploadBufferToS3()`
- S3 URLs stored in `Submission.images[]` array
- On deletion, images removed from S3 via `deleteFromS3()`

### MCP (Visit Plan) Compliance

- Separate MongoDB collection: `plan_visit` in `project_display_app` database
- Fields: `username`, `storeCode`, `Date`/`date`/`visitDate`, `Value` (target count)
- `checkMCPCompliance()` verifies if a submission matches a planned visit (case-insensitive username/storeCode, date range)
- Used in Excel export and PowerPoint store info slides

## Key API Endpoints

**Authentication (routes/auth.js):**
- `POST /api/login` - User login with **userId** (case-insensitive) and password (bcrypt). Matches against both in-memory cache and MongoDB using regex for case-insensitivity
- `POST /api/logout` - Session destruction
- `POST /api/change-password` - Password update with old password verification. Calls `loadUsers()` after save to refresh cache
- `GET /api/check-session` - Get current session user info

**Data (routes/data.js):**
- `GET /api/stores` - Get stores filtered by user role:
  - **Admin:** Returns all stores
  - **TDL:** Returns stores where `TDL name` matches `session.user.username` (exact or normalized Vietnamese)
  - **TDS:** Returns stores where `TDS name` matches `session.user.username` (exact or normalized Vietnamese)
  - Fallback to partial matching if no exact match, then returns first 5 stores as demo
- `GET /api/categories` - Get active categories sorted by order

**Submissions (routes/submissions.js):**
- `POST /api/submit` - Create before/after submission with S3 image uploads
- `GET /api/before-categories/:storeId` - Get categories from before step (for step 2)
- `GET /api/admin/submissions` - Admin view all with filters (username, tdsName, store, category, date range)
- `DELETE /api/admin/submissions/:id` - Delete single submission + S3 cleanup
- `DELETE /api/admin/submissions/bulk-delete` - Delete multiple submissions + S3 cleanup

**History (routes/history.js):**
- `GET /api/user/history` - Get user's own submission history

**Admin Users (routes/adminUsers.js):**
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user. Calls `loadUsers()` after save
- `PUT /api/admin/users/:id` - Update user. Calls `loadUsers()` after save
- `DELETE /api/admin/users/:id` - Delete user. Calls `loadUsers()` after deletion
- `POST /api/admin/users/:id/reset-password` - Reset password. Calls `loadUsers()` after save to refresh cache
- `POST /api/admin/users/:id/toggle-status` - Activate/deactivate user. Calls `loadUsers()` after save

**Admin Categories (routes/adminCategories.js):**
- `GET /api/admin/categories` - List all categories (including inactive)
- `POST /api/admin/categories` - Create category
- `PUT /api/admin/categories/:id` - Update category
- `DELETE /api/admin/categories/:id` - Delete category
- `PUT /api/admin/categories/:id/toggle-status` - Activate/deactivate category

**Admin Templates (routes/adminTemplates.js):**
- `POST /api/template/stores/upload` - Bulk upload stores from Excel (supports both store list and MCP visit plan formats)
- `POST /api/template/categories/upload` - Bulk upload categories from Excel
- `POST /api/template/users/upload` - Bulk upload users from Excel
- `GET /api/template/*/download` - Download template Excel files

**Admin Export (routes/adminExport.js):**
- `GET /api/admin/export` - Excel export with 3 sheets:
  1. Summary: daily visit counts per user (columns 1-31 for each day)
  2. Following MCP compliance: breakdown for compliant visits
  3. Submissions: detailed data with MCP compliance status
- `GET /api/admin/export-pptx` - PowerPoint export with:
  - Store info slide (light blue background) per store with MCP compliance, unfixed items
  - Before/After comparison slides with 2x2 image grids, notes, dates

## MongoDB Models

**User:**
- `username` (actual name like "Lê Văn Trí"), `userId` (login ID like "elux00812@eluxvn"), `password` (bcrypt hashed), `role` (Admin/TDL/TDS), `tdsName`, `status` (active/inactive)
- **Login uses `userId` with case-insensitive matching** (e.g., "admin", "Admin", "ADMIN" all work)
- `username` field is used for store filtering (matched against store's TDL/TDS name fields)

**Store:**
- Many fields: `stt`, `tdlName`, `tdsName`, `storeName`, `storeCode`, `dealerCode`, `address`, `typeShop`, `province`, `city`, `district`, `region`, etc.
- Store identification can be via `storeCode`, `STT`, or `Store code (Fieldcheck)`

**Category:**
- `id`, `name`, `description`, `order`, `isActive`
- Sorted by `order` then `name`

**Submission:**
- `username`, `userId`, `tdsName`, `storeId`, `storeName`, `categoryId`, `categoryName`
- `note`, `fixed` (Boolean, only for "after"), `expectedResolutionDate` (Date, only if not fixed)
- `images[]` (S3 URLs), `submissionType` (before/after), `sessionId`, `submittedAt`

## Environment Variables (.env)

Required:
- `MONGODB_URI` - MongoDB connection string
- `SESSION_SECRET` - Express session secret
- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `AWS_REGION` - AWS region
- `AWS_S3_BUCKET_NAME` - S3 bucket name
- `PORT` - Server port (default: 3000)

## Working with This Codebase

### Adding New API Endpoints
1. Create route handler in appropriate file under `routes/`
2. Use `requireAuth` or `requireAdmin` middleware for protected routes
3. Import models, services, and S3 config as needed
4. Mount route in `server.js` if adding a new route file

### Modifying Data Loading
- Edit `services/dataLoader.js` for changes to in-memory caching logic
- After bulk uploads/deletions, refresh cache with `setUsersData()` / `setStoresData()` / `setCategoriesData()`
- CSV files (`users.csv`, `storelist.csv`, `category.csv`) are fallback data sources

### Template Upload Format
**Stores:** Excel columns must match Store model field names (e.g., "TDL name", "TDS name", "Store name", "Store code (Fieldcheck)")
**Categories:** Columns: "ID", "Category", "Description", "Order"
**Users:** Columns: "Username", "User ID", "Role", "Password", "TDS name"
**MCP Visit Plan:** Must have `username`, `storeCode`, and a date field (`Date`, `date`, or `visitDate`)

### Excel/PowerPoint Export Customization
- Excel Summary sheet: daily visit counts (1-31 columns), target vs actual MCP, total vs actual stores
- MCP compliance breakdown uses `checkMCPCompliance()` for each submission
- PowerPoint: 2x2 image grids (always 4 images, uses placeholder if <4), store info slide with unfixed categories

### S3 Image Management
- All image uploads go through `uploadBufferToS3()` in `config/s3Config.js`
- Deletion via `deleteFromS3()` extracts key from URL and calls S3 deleteObject
- ACL removed from config (many buckets don't support public-read ACL)

## Common Issues & Solutions

**"No stores found" for TDL/TDS:**
- Check `TDL name` / `TDS name` fields in Store documents match user's `username` field (NOT `userId`)
- **TDL users:** Stores filtered by `TDL name` field only
- **TDS users:** Stores filtered by `TDS name` field only
- Matching supports exact match and Vietnamese accent normalization
- Fallback to partial matching if no exact match found

**Session not persisting:**
- Verify `SESSION_SECRET` is set in .env
- Check session middleware is mounted before routes in server.js

**MCP compliance always "No":**
- Verify `plan_visit` collection exists in `project_display_app` database
- Check username/storeCode/date formatting matches between Submission and plan_visit
- Use debug logs in `mcpCompliance.js` to troubleshoot

**S3 upload failures:**
- Verify AWS credentials and bucket name in .env
- Check bucket permissions allow PutObject/DeleteObject
- Base64 format must be: `data:image/[type];base64,[data]`

**Before categories not loading in step 2:**
- Ensure `sessionId` is passed as query parameter
- Check `userId` or `username` in session matches Submission records
- Route tries userId first, then username, then no user filter (backward compatibility)

**Password change not working / "User not found" after password change:**
- Ensure `loadUsers()` is called after password updates in both `routes/auth.js` and `routes/adminUsers.js`
- This refreshes the in-memory cache so login uses the new password immediately
- All admin user operations (create, update, delete, toggle status, reset password) should call `loadUsers()` after MongoDB save

## Vietnamese Language Support

- All UI text, category names, and data fields support Vietnamese
- Excel/PowerPoint exports preserve Vietnamese characters (UTF-8 encoding)
- Date formatting in exports: DD-MM-YYYY for Vietnamese locale
- Fixed status labels: "Đã fix" (fixed), "Chưa fix" (not fixed), "Chưa trả lời" (not answered)
