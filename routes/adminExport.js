/**
 * Admin Export routes
 * Handles data export operations including Excel and PowerPoint exports
 * with MCP compliance tracking and store information
 */
const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
const axios = require('axios');
const mongoose = require('mongoose');

// Import models
const Submission = require('../models/Submission');
const Store = require('../models/Store');
const User = require('../models/User');

// Import middleware
const { requireAdmin } = require('../middleware/auth');

// Plan Visit Model for MCP compliance checking
const planVisitSchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'plan_visit'
});

// Connect to the project_display_app database for plan visits
const planVisitConnection = mongoose.createConnection(process.env.MONGODB_URI?.replace(/\/[^\/]*$/, '/project_display_app') || 'mongodb://localhost:27017/project_display_app', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const PlanVisit = planVisitConnection.model('plan_visit', planVisitSchema);

// Function to check MCP visit plan compliance
async function checkMCPCompliance(username, storeCode, submissionDate) {
  try {
    // Format the submission date to match plan date format
    const submissionDateStr = submissionDate.toISOString().split('T')[0];

    console.log(`🔍 Checking MCP compliance for:`, {
      username,
      storeCode,
      submissionDate: submissionDateStr
    });

    // Look for a plan visit record for this user, store, and date
    const planVisit = await PlanVisit.findOne({
      username: { $regex: new RegExp(`^${username}$`, 'i') }, // Case-insensitive match
      $and: [
        {
          $or: [
            { storeCode: { $regex: new RegExp(`^${storeCode}$`, 'i') } }, // String match
            { storeCode: parseInt(storeCode) }, // Number match
            { storeCode: storeCode } // Exact match
          ]
        },
        {
          $or: [
            { Date: { $gte: new Date(submissionDateStr), $lt: new Date(submissionDateStr + 'T23:59:59.999Z') } },
            { date: { $gte: new Date(submissionDateStr), $lt: new Date(submissionDateStr + 'T23:59:59.999Z') } },
            { visitDate: { $gte: new Date(submissionDateStr), $lt: new Date(submissionDateStr + 'T23:59:59.999Z') } }
          ]
        }
      ]
    }).lean();

    console.log(`📋 Plan visit found:`, planVisit ? 'YES' : 'NO');
    if (planVisit) {
      console.log(`✅ Plan visit details:`, JSON.stringify(planVisit, null, 2));
    } else {
      // Debug: Check if user exists at all
      const userExists = await PlanVisit.findOne({
        username: { $regex: new RegExp(`^${username}$`, 'i') }
      }).lean();
      console.log(`👤 User '${username}' has any plans:`, userExists ? 'YES' : 'NO');

      // Debug: Check if store exists at all
      const storeExists = await PlanVisit.findOne({
        $or: [
          { storeCode: { $regex: new RegExp(`^${storeCode}$`, 'i') } },
          { storeCode: parseInt(storeCode) },
          { storeCode: storeCode }
        ]
      }).lean();
      console.log(`🏪 Store '${storeCode}' has any plans:`, storeExists ? 'YES' : 'NO');

      // Debug: Check if user + store combo exists for any date
      const userStoreExists = await PlanVisit.findOne({
        username: { $regex: new RegExp(`^${username}$`, 'i') },
        $or: [
          { storeCode: { $regex: new RegExp(`^${storeCode}$`, 'i') } },
          { storeCode: parseInt(storeCode) },
          { storeCode: storeCode }
        ]
      }).lean();
      console.log(`🎯 User + Store combo exists:`, userStoreExists ? 'YES' : 'NO');
      if (userStoreExists) {
        console.log(`📅 Planned date:`, userStoreExists.Date || userStoreExists.date);
      }
    }

    return planVisit !== null;
  } catch (error) {
    console.warn(`Warning: Error checking MCP compliance for ${username}:`, error.message);
    return false; // Default to non-compliant if there's an error
  }
}

// Function to get overall MCP compliance for a user
async function getUserMCPCompliance(username, submissions) {
  try {
    let compliantVisits = 0;
    let totalVisits = 0;

    // Check each submission
    for (const submission of submissions) {
      totalVisits++;
      const isCompliant = await checkMCPCompliance(username, submission.storeId, submission.submittedAt);
      if (isCompliant) {
        compliantVisits++;
      }
    }

    // If all visits are compliant, return "Yes", otherwise "No"
    return totalVisits > 0 && compliantVisits === totalVisits ? 'Yes' : 'No';
  } catch (error) {
    console.warn(`Warning: Error getting MCP compliance for ${username}:`, error.message);
    return 'No'; // Default to non-compliant if there's an error
  }
}

/**
 * GET /api/admin/export
 * Export submissions as Excel with summary and MCP compliance sheets
 * Includes:
 * - Summary sheet with daily visit counts per user
 * - MCP compliance breakdown (following vs not following)
 * - Detailed submissions with all metadata
 *
 * Query params: username, tdsName, store, category, startDate, endDate
 */
router.get('/export', requireAdmin, async (req, res) => {
  try {
    // Build filter from query params (use same logic as submissions API)
    const filter = {};
    if (req.query.username && req.query.username.trim() !== '') {
      filter.username = { $regex: req.query.username.trim(), $options: 'i' };
    }
    if (req.query.tdsName && req.query.tdsName.trim() !== '') {
      filter.tdsName = { $regex: req.query.tdsName.trim(), $options: 'i' };
    }
    if (req.query.store && req.query.store.trim() !== '') {
      filter.storeName = { $regex: req.query.store.trim(), $options: 'i' };
    }
    if (req.query.category && req.query.category.trim() !== '') {
      filter.categoryName = { $regex: req.query.category.trim(), $options: 'i' };
    }
    if (req.query.startDate || req.query.endDate) {
      filter.submittedAt = {};
      if (req.query.startDate) {
        filter.submittedAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        const endDateTime = new Date(req.query.endDate);
        endDateTime.setHours(23, 59, 59, 999); // End of day
        filter.submittedAt.$lte = endDateTime;
      }
    }

    console.log('Export filter:', filter);
    const submissions = await Submission.find(filter).sort({ submittedAt: -1 }).lean();
    console.log(`Found ${submissions.length} submissions for Excel export`);

    // Group submissions by username and storeId for MCP compliance checking
    console.log('Calculating MCP compliance for submissions...');
    const submissionGroups = {};
    submissions.forEach(sub => {
      const key = `${sub.username}|${sub.storeId}`;
      if (!submissionGroups[key]) {
        submissionGroups[key] = {
          username: sub.username,
          storeId: sub.storeId,
          submissions: []
        };
      }
      submissionGroups[key].submissions.push(sub);
    });

    // Calculate MCP compliance for each group
    const complianceMap = {};
    for (const [key, group] of Object.entries(submissionGroups)) {
      try {
        const isCompliant = await checkMCPCompliance(group.username, group.storeId, group.submissions[0].submittedAt);
        complianceMap[key] = isCompliant ? 'Yes' : 'No';
        console.log(`MCP Compliance for ${group.username} at store ${group.storeId}: ${complianceMap[key]}`);
      } catch (error) {
        console.error(`Error calculating MCP compliance for ${key}:`, error);
        complianceMap[key] = 'N/A';
      }
    }

    // Debug: Log some sample submission dates if any exist
    if (submissions.length > 0) {
      console.log('Sample submission dates:');
      submissions.slice(0, 3).forEach((sub, idx) => {
        console.log(`  ${idx + 1}. ${sub.submittedAt} (${sub.storeName}) - Note: "${sub.note}" - Fixed: ${sub.fixed} - Type: ${sub.submissionType}`);
      });
    } else {
      console.log('No submissions found matching the filter criteria');
    }

    // Initialize workbook before adding any worksheet
    const workbook = new ExcelJS.Workbook();

    // --- BEGIN: Add Summary Sheet ---
    // Determine the month to process (from filter, or current month)
    let month, year;
    if (req.query.startDate) {
      const d = new Date(req.query.startDate);
      month = d.getMonth(); // 0-based
      year = d.getFullYear();
    } else {
      const now = new Date();
      month = now.getMonth();
      year = now.getFullYear();
    }
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 1. Get all users (excluding Admins)
    let userFilter = { role: { $ne: 'Admin' } };
    if (filter.username) userFilter.username = filter.username;
    if (filter.tdsName) userFilter.tdsName = filter.tdsName;
    const allUsers = await User.find(userFilter).lean();

    // 2. For each user, calculate all summary fields
    const summaryRows = [];
    for (const user of allUsers) {
      // Only consider submissions matching the filter for this user
      const submissionFilter = { username: user.username };
      if (filter.storeName) submissionFilter.storeName = filter.storeName;
      if (filter.categoryName) submissionFilter.categoryName = filter.categoryName;
      if (filter.submittedAt) submissionFilter.submittedAt = filter.submittedAt;

      let userSubs = [];
      try {
        userSubs = await Submission.find(submissionFilter).lean();
      } catch (e) {
        userSubs = [];
      }

      // Target MCP: sum of 'Value' in plan_visit for this user (case-sensitive)
      let targetMcp = 0;
      let totalStores = 0;
      try {
        const planVisits = await PlanVisit.find({ username: user.username });
        targetMcp = planVisits.reduce((sum, pv) => sum + (typeof pv.Value === 'number' ? pv.Value : 0), 0);
        // Total stores: unique storeCode in planVisits
        const storeSet = new Set(planVisits.map(pv => pv.storeCode?.toString()));
        storeSet.delete(undefined); storeSet.delete(null);
        totalStores = storeSet.size;
      } catch (e) {
        console.warn(`Error getting plan_visit for user ${user.username}:`, e.message);
      }

      // Actual MCP: count unique (storeId, date) pairs in filtered Submission for this user
      let actualMcp = 0;
      let actualStores = 0;
      let dayStoreMap = {};
      try {
        // Only consider submissions in the filtered month and matching filter
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month, daysInMonth, 23, 59, 59, 999);
        const submissions = userSubs.filter(sub => {
          const d = new Date(sub.submittedAt);
          return d >= monthStart && d <= monthEnd;
        });

        // Actual MCP: unique (storeId, date) pairs
        const mcpSet = new Set();
        // Actual stores: unique storeId
        const storeSet = new Set();
        // Day store map: day (1-31) -> Set of storeIds
        for (const sub of submissions) {
          const d = new Date(sub.submittedAt);
          const day = d.getDate();
          const storeId = sub.storeId?.toString();
          if (storeId) {
            mcpSet.add(`${storeId}|${d.toISOString().slice(0,10)}`);
            storeSet.add(storeId);
            if (!dayStoreMap[day]) dayStoreMap[day] = new Set();
            dayStoreMap[day].add(storeId);
          }
        }
        actualMcp = mcpSet.size;
        actualStores = storeSet.size;
      } catch (e) {
        console.warn(`Error getting actual MCP/stores for user ${user.username}:`, e.message);
      }

      // Build row
      const row = {
        username: user.username,
        role: user.role,
        target_mcp: targetMcp,
        actual_mcp: actualMcp,
        total_stores: totalStores,
        actual_stores: actualStores
      };
      // Add columns 1-31
      for (let day = 1; day <= daysInMonth; ++day) {
        row[day] = dayStoreMap[day] ? dayStoreMap[day].size : 0;
      }
      summaryRows.push(row);
    }

    // Add the summary worksheet
    const summarySheet = workbook.addWorksheet('Summary');
    // Build columns
    const summaryColumns = [
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Role', key: 'role', width: 10 },
      { header: 'Target MCP', key: 'target_mcp', width: 12 },
      { header: 'Actual MCP', key: 'actual_mcp', width: 12 },
      { header: 'Total stores', key: 'total_stores', width: 12 },
      { header: 'Actual stores', key: 'actual_stores', width: 12 }
    ];
    for (let day = 1; day <= daysInMonth; ++day) {
      summaryColumns.push({ header: day.toString(), key: day.toString(), width: 4 });
    }
    summarySheet.columns = summaryColumns;
    summaryRows.forEach(row => summarySheet.addRow(row));
    // --- END: Add Summary Sheet ---

    // --- BEGIN: Add MCP Compliance Tables ---
    // Helper to build a summary row for a user given a set of submissions
    function buildSummaryRow(user, planVisits, submissions, daysInMonth, year, month) {
      // Target MCP and total stores from planVisits
      const targetMcp = planVisits.reduce((sum, pv) => sum + (typeof pv.Value === 'number' ? pv.Value : 0), 0);
      const planStoreSet = new Set(planVisits.map(pv => pv.storeCode?.toString()));
      planStoreSet.delete(undefined); planStoreSet.delete(null);
      const totalStores = planStoreSet.size;

      // Actual MCP: unique (storeId, date) pairs
      const mcpSet = new Set();
      // Actual stores: unique storeId
      const storeSet = new Set();
      // Day store map: day (1-31) -> Set of storeIds
      const dayStoreMap = {};
      for (const sub of submissions) {
        const d = new Date(sub.submittedAt);
        const day = d.getDate();
        const storeId = sub.storeId?.toString();
        if (storeId) {
          mcpSet.add(`${storeId}|${d.toISOString().slice(0,10)}`);
          storeSet.add(storeId);
          if (!dayStoreMap[day]) dayStoreMap[day] = new Set();
          dayStoreMap[day].add(storeId);
        }
      }
      const row = {
        username: user.username,
        role: user.role,
        target_mcp: targetMcp,
        actual_mcp: mcpSet.size,
        total_stores: totalStores,
        actual_stores: storeSet.size
      };
      for (let day = 1; day <= daysInMonth; ++day) {
        row[day] = dayStoreMap[day] ? dayStoreMap[day].size : 0;
      }
      return row;
    }

    // Get all planVisits for all users (to avoid repeated queries)
    const allPlanVisits = await PlanVisit.find({ username: { $in: allUsers.map(u => u.username) } }).lean();
    // Get all submissions for the filtered month for all users
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month, daysInMonth, 23, 59, 59, 999);
    const allMonthSubs = await Submission.find({
      username: { $in: allUsers.map(u => u.username) },
      submittedAt: { $gte: monthStart, $lte: monthEnd }
    }).lean();

    // Build a map of compliance for each submission
    const complianceMapMCP = {};
    for (const sub of allMonthSubs) {
      const key = `${sub.username}|${sub.storeId}|${sub.submittedAt.toISOString().slice(0,10)}`;
      // Use your checkMCPCompliance function for each submission
      complianceMapMCP[key] = await checkMCPCompliance(sub.username, sub.storeId, sub.submittedAt) ? 'Yes' : 'No';
    }

    // Group submissions by user and compliance
    const userSubsMap = {};
    for (const user of allUsers) {
      userSubsMap[user.username] = {
        all: [],
        yes: [],
        no: []
      };
    }
    for (const sub of allMonthSubs) {
      const user = sub.username;
      userSubsMap[user].all.push(sub);
      const key = `${sub.username}|${sub.storeId}|${sub.submittedAt.toISOString().slice(0,10)}`;
      if (complianceMapMCP[key] === 'Yes') userSubsMap[user].yes.push(sub);
      if (complianceMapMCP[key] === 'No') userSubsMap[user].no.push(sub);
    }

    // Group planVisits by user
    const userPlanMap = {};
    for (const user of allUsers) {
      userPlanMap[user.username] = allPlanVisits.filter(pv => pv.username === user.username);
    }

    // Build rows for each block
    // 1. All users (already done: summaryRows)
    // 2. Following MCP compliance
    const followingRows = [];
    for (const user of allUsers) {
      if (userSubsMap[user.username].yes.length > 0) {
        followingRows.push(buildSummaryRow(user, userPlanMap[user.username], userSubsMap[user.username].yes, daysInMonth, year, month));
      }
    }

    // 3. Not following MCP compliance
    const notFollowingRows = [];
    for (const user of allUsers) {
      if (userSubsMap[user.username].no.length > 0) {
        notFollowingRows.push(buildSummaryRow(user, userPlanMap[user.username], userSubsMap[user.username].no, daysInMonth, year, month));
      }
    }

    // Write to the same worksheet, one block after another
    let rowOffset = summaryRows.length + 3; // leave a blank row
    // Write header for block 2
    summarySheet.getRow(rowOffset).values = ['Following MCP compliance'];
    rowOffset++;
    summarySheet.getRow(rowOffset).values = summarySheet.columns.map(col => col.header);
    rowOffset++;
    followingRows.forEach(row => {
      summarySheet.insertRow(rowOffset, summarySheet.columns.map(col => row[col.key]));
      rowOffset++;
    });
    rowOffset++; // blank row

    // Write header for block 3
    summarySheet.getRow(rowOffset).values = ['Not following MCP compliance'];
    rowOffset++;
    summarySheet.getRow(rowOffset).values = summarySheet.columns.map(col => col.header);
    rowOffset++;
    notFollowingRows.forEach(row => {
      summarySheet.insertRow(rowOffset, summarySheet.columns.map(col => row[col.key]));
      rowOffset++;
    });
    // --- END: Add MCP Compliance Tables ---

    const worksheet = workbook.addWorksheet('Submissions');
    worksheet.columns = [
      { header: 'Username', key: 'username', width: 15 },
      { header: 'TDS Name', key: 'tdsName', width: 20 },
      { header: 'Store Name', key: 'storeName', width: 30 },
      { header: 'Category', key: 'categoryName', width: 25 },
      { header: 'Step (Before/After)', key: 'submissionType', width: 15 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Fixed Status', key: 'fixedStatus', width: 15 },
      { header: 'Expected Resolution Date', key: 'expectedResolutionDate', width: 18 },
      { header: 'Images', key: 'images', width: 50 },
      { header: 'Date', key: 'submittedAt', width: 20 },
      { header: 'MCP Compliance', key: 'mcpCompliance', width: 15 }
    ];

    submissions.forEach(sub => {
      // Format the fixed status for display
      let fixedStatus = '';
      if (sub.submissionType === 'after') {
        if (sub.fixed === true) {
          fixedStatus = 'Đã fix';
        } else if (sub.fixed === false) {
          fixedStatus = 'Chưa fix';
        } else {
          fixedStatus = 'Chưa trả lời';
        }
      } else {
        fixedStatus = '0';
      }

      // Get MCP compliance for this submission's user-store combination
      const complianceKey = `${sub.username}|${sub.storeId}`;
      const mcpCompliance = complianceMap[complianceKey];

      worksheet.addRow({
        username: sub.username || '',
        tdsName: sub.tdsName || '',
        storeName: sub.storeName || '',
        categoryName: sub.categoryName || '',
        submissionType: sub.submissionType || '',
        note: sub.note || '',
        fixedStatus: fixedStatus,
        expectedResolutionDate: sub.expectedResolutionDate ? new Date(sub.expectedResolutionDate).toLocaleDateString('vi-VN') : '',
        images: (sub.images || []).join(', '),
        submittedAt: sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('vi-VN') : '',
        mcpCompliance: mcpCompliance || 'N/A'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export Excel error:', error);
    res.status(500).json({ error: 'Failed to export Excel' });
  }
});

/**
 * GET /api/admin/export-pptx
 * Export submissions as PowerPoint presentation
 * Includes:
 * - Store information slide with MCP compliance status
 * - Before/After comparison slides with 2x2 image grids
 * - Category and fix status information
 * - Expected resolution dates for unfixed items
 *
 * Query params: username, tdsName, store, category, startDate, endDate
 */
router.get('/export-pptx', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.username && req.query.username.trim() !== '') {
      filter.username = { $regex: req.query.username.trim(), $options: 'i' };
    }
    if (req.query.tdsName && req.query.tdsName.trim() !== '') {
      filter.tdsName = { $regex: req.query.tdsName.trim(), $options: 'i' };
    }
    if (req.query.store && req.query.store.trim() !== '') {
      filter.storeName = { $regex: req.query.store.trim(), $options: 'i' };
    }
    if (req.query.category && req.query.category.trim() !== '') {
      filter.categoryName = { $regex: req.query.category.trim(), $options: 'i' };
    }
    if (req.query.startDate || req.query.endDate) {
      filter.submittedAt = {};
      if (req.query.startDate) {
        filter.submittedAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        const endDateTime = new Date(req.query.endDate);
        endDateTime.setHours(23, 59, 59, 999); // End of day
        filter.submittedAt.$lte = endDateTime;
      }
    }

    console.log('Export PPTX filter:', filter);
    const submissions = await Submission.find(filter).sort({ submittedAt: -1 }).lean();
    console.log(`Found ${submissions.length} submissions for PPTX export`);

    // Group by sessionId + storeId + categoryId
    const sessionMap = {};
    for (const sub of submissions) {
      const key = `${sub.sessionId}|${sub.storeId}|${sub.categoryId}`;
      if (!sessionMap[key]) {
        sessionMap[key] = { before: [], after: [], meta: sub };
      }
      if (sub.submissionType === 'before') sessionMap[key].before.push(sub);
      if (sub.submissionType === 'after') sessionMap[key].after.push(sub);
    }

    // Group sessions by store for creating store info slides
    const storeMap = {};
    const storeIds = [...new Set(Object.values(sessionMap).map(session => session.meta.storeId))];

    // Fetch full store information for all unique stores
    // Note: storeId in submissions is actually the store code, not MongoDB _id
    const stores = await Store.find({
      $or: [
        { storeCode: { $in: storeIds } },
        { 'Store code (Fieldcheck)': { $in: storeIds } },
        { STT: { $in: storeIds } }
      ]
    }).lean();

    const storeInfoMap = {};
    stores.forEach(store => {
      // Map by the actual storeId value used in submissions
      const storeKey = store.storeCode || store['Store code (Fieldcheck)'] || store.STT;
      if (storeKey) {
        storeInfoMap[storeKey] = store;
      }
    });

    Object.values(sessionMap).forEach((session) => {
      const storeKey = session.meta.storeId;
      if (!storeMap[storeKey]) {
        storeMap[storeKey] = {
          storeMeta: session.meta,
          storeInfo: storeInfoMap[storeKey] || {}, // Full store information
          sessions: []
        };
      }
      storeMap[storeKey].sessions.push(session);
    });

    const pptx = new PptxGenJS();
    const placeholderPath = 'public/no-image-placeholder.svg';

    pptx.defineSlideMaster({
      title: 'CLEAN_LAYOUT',
      background: { fill: 'FFFFFF' },
      objects: [
        { shape: 'rect', x: 0, y: 0, w: 10, h: 0.6, fill: { color: 'F2F2F2' } },
        { shape: 'line', x: 5, y: 0.6, w: 0, h: 5.5, line: { color: 'C0C0C0', width: 2 } }
      ]
    });

    // Define store info slide master with light blue background
    pptx.defineSlideMaster({
      title: 'STORE_INFO_LAYOUT',
      background: { fill: 'E6F2FF' }, // Light blue background
      objects: []
    });

    // Create slides for each store
    for (const { storeMeta, storeInfo, sessions } of Object.values(storeMap)) {
      // Create store information slide first
      const storeInfoSlide = pptx.addSlide({ masterName: 'STORE_INFO_LAYOUT' });

      // Check MCP compliance for this store
      let mcpCompliance = 'N/A';
      try {
        // Get all submissions for this store to check compliance
        const allSubmissionsForStore = [];
        sessions.forEach(({ before, after }) => {
          allSubmissionsForStore.push(...before, ...after);
        });

        if (allSubmissionsForStore.length > 0) {
          // Use the username from the first submission
          const username = allSubmissionsForStore[0].username;
          mcpCompliance = await getUserMCPCompliance(username, allSubmissionsForStore);
        }
      } catch (error) {
        console.warn('Error checking MCP compliance:', error.message);
        mcpCompliance = 'N/A';
      }

      // Store information in two columns
      const startY = 0.3; // Starting Y position
      const rowHeight = 0.8; // Height between rows

      // First column properties
      const col1Props = {
        x: 0.4, // X position for left column
        w: 4.5, // Width of text box for first column
        h: 0.6, // Height of each text box
        fontSize: 18,
        bold: true,
        color: '1F4E79', // Dark blue color for better contrast on light blue background
        align: 'left'
      };

      // Second column properties
      const col2Props = {
        x: 5.2, // X position for right column
        w: 4.5, // Width of text box for second column
        h: 0.6, // Height of each text box
        fontSize: 18,
        bold: true,
        color: '1F4E79', // Dark blue color for better contrast on light blue background
        align: 'left'
      };

      // Count "Chưa fix" (not fixed) responses and collect category names for this store
      let unfixedCount = 0;
      const unfixedCategories = [];
      sessions.forEach(({ after }) => {
        after.forEach(submission => {
          if (submission.fixed === false) {
            unfixedCount++;
            // Add category name to the list if not already present
            if (!unfixedCategories.includes(submission.categoryName)) {
              unfixedCategories.push(submission.categoryName);
            }
          }
        });
      });

      // COLUMN 1 - Left side
      // Row 1: Store Name
      storeInfoSlide.addText(`Store: ${storeInfo.storeName || storeMeta.storeName || 'N/A'}`, {
        ...col1Props,
        y: startY
      });

      // Row 2: TDL Name
      storeInfoSlide.addText(`TDL: ${storeInfo.tdlName || 'N/A'}`, {
        ...col1Props,
        y: startY + rowHeight
      });

      // Row 3: TDS Name
      storeInfoSlide.addText(`TDS: ${storeInfo.tdsName || storeMeta.tdsName || 'N/A'}`, {
        ...col1Props,
        y: startY + (rowHeight * 2)
      });

      // Row 4: Type Shop
      storeInfoSlide.addText(`Type: ${storeInfo.typeShop || 'N/A'}`, {
        ...col1Props,
        y: startY + (rowHeight * 3)
      });

      // Row 5: Province
      storeInfoSlide.addText(`Province: ${storeInfo.province || 'N/A'}`, {
        ...col1Props,
        y: startY + (rowHeight * 4)
      });

      // Format date as DD-MM-YYYY for store info slide
      const formatDateForStore = (date) => {
        if (!date) return 'N/A';
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
      };

      // Row 6: Submitted At
      storeInfoSlide.addText(`Submitted: ${formatDateForStore(storeMeta.submittedAt)}`, {
        ...col1Props,
        y: startY + (rowHeight * 5)
      });

      // COLUMN 2 - Right side
      // Row 1 of Column 2: Unfixed POSM/Shelves count
      storeInfoSlide.addText(`Có lỗi POSM/Quầy kệ không: ${unfixedCount}`, {
        ...col2Props,
        y: startY
      });

      // If there are unfixed categories, list them below the count
      if (unfixedCategories.length > 0) {
        // Build a list of unfixed categories with their expectedResolutionDate
        const unfixedDetails = [];
        sessions.forEach(({ after }) => {
          after.forEach(submission => {
            if (submission.fixed === false) {
              let detail = `• ${submission.categoryName}`;
              if (submission.expectedResolutionDate) {
                const d = new Date(submission.expectedResolutionDate);
                const dateStr = `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getFullYear()}`;
                detail += ` (Dự kiến sửa: ${dateStr})`;
              }
              if (!unfixedDetails.includes(detail)) {
                unfixedDetails.push(detail);
              }
            }
          });
        });
        const categoryText = unfixedDetails.join('\n');
        storeInfoSlide.addText(`Danh mục chưa fix:\n${categoryText}`, {
          ...col2Props,
          y: startY + rowHeight, // Position below the count
          h: rowHeight * 3, // Reduce height to make room for MCP compliance
          fontSize: 14, // Smaller font size for the list
          bold: false, // Make it not bold to differentiate from the main text
          valign: 'top' // Align text to top of the text box
        });
      }

      // Add MCP compliance status at the bottom of column 2
      const mcpComplianceY = unfixedCategories.length > 0 ? startY + (rowHeight * 4.5) : startY + rowHeight;
      storeInfoSlide.addText(`Có đi đúng MCP không? ${mcpCompliance}`, {
        ...col2Props,
        y: mcpComplianceY,
        h: 0.6,
        fontSize: 16,
        bold: true,
        color: mcpCompliance === 'Yes' ? '00B050' : 'FF0000' // Green for Yes, Red for No/N/A
      });

      // Now create submission slides for this store
      sessions.forEach(({ before, after, meta }) => {
        const slide = pptx.addSlide({ masterName: 'CLEAN_LAYOUT' });

        // Format date as DD-MM-YYYY
        const formatDate = (date) => {
          if (!date) return '';
          const d = new Date(date);
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}-${month}-${year}`;
        };

        // First row: storeName | tdsName | Date
        const title1 = `${meta.storeName || ''} | ${meta.tdsName || ''} | ${formatDate(meta.submittedAt)}`;
        slide.addText(title1, {
          x: 0.3, y: 0.16, w: 9, h: 0.5, fontSize: 16, bold: true, align: 'left', color: '333333'
        });

        // Second row: category | userName
        const title2 = `${meta.categoryName || ''} | ${meta.username || ''}`;
        slide.addText(title2, {
          x: 0.3, y: 0.53, w: 9, h: 0.4, fontSize: 12, align: 'left', color: '666666'
        });

        // Section labels
        slide.addText('Before', { x: 0.3, y: 0.95, w: 4, h: 0.4, fontSize: 13, bold: true, color: '0070C0' });
        slide.addText('After', { x: 5.2, y: 0.95, w: 4, h: 0.4, fontSize: 13, bold: true, color: '00B050' });
        slide.addShape(pptx.ShapeType.line, { x: 5.05, y: 1.1, w: 0, h: 4.4, line: { color: 'C0C0C0', width: 2 } });

        // Notes (grey, not bold, separated)
        let beforeNote = '';
        if (before.length > 0 && before[0].note) beforeNote = before[0].note;
        if (beforeNote) {
          slide.addText(beforeNote, { x: 0.3, y: 1.2, w: 4.5, h: 0.4, fontSize: 9, color: '888888', bold: false });
        }

        let afterNote = '';
        if (after.length > 0 && after[0].note) afterNote = after[0].note;
        if (afterNote) {
          slide.addText(afterNote, { x: 5.2, y: 1.2, w: 4.5, h: 0.4, fontSize: 9, color: '888888', bold: false });
        }

        const imgW = 2.23, imgH = 1.68, gapX = 0.2, gapY = 0.2;
        const leftStartX = 0.2, leftStartY = 1.6;
        const rightStartX = 5.2, rightStartY = 1.6;

        // Always 4 images for before grid
        let beforeImgs = before.flatMap(sub => sub.images || []);
        while (beforeImgs.length < 4) beforeImgs.push(placeholderPath);
        beforeImgs = beforeImgs.slice(0, 4);
        beforeImgs.forEach((img, idx) => {
          const row = Math.floor(idx / 2);
          const col = idx % 2;
          slide.addImage({
            path: img,
            x: leftStartX + col * (imgW + gapX),
            y: leftStartY + row * (imgH + gapY),
            w: imgW,
            h: imgH
          });
        });

        // Always 4 images for after grid
        let afterImgs = after.flatMap(sub => sub.images || []);
        while (afterImgs.length < 4) afterImgs.push(placeholderPath);
        afterImgs = afterImgs.slice(0, 4);
        afterImgs.forEach((img, idx) => {
          const row = Math.floor(idx / 2);
          const col = idx % 2;
          slide.addImage({
            path: img,
            x: rightStartX + col * (imgW + gapX),
            y: rightStartY + row * (imgH + gapY),
            w: imgW,
            h: imgH
          });
        });
      }); // Close sessions.forEach
    } // Close for...of Object.values(storeMap)

    const buf = await pptx.write('nodebuffer');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions.pptx"');
    res.end(buf);
  } catch (error) {
    console.error('Export PPTX error:', error);
    res.status(500).json({ error: 'Failed to export PowerPoint' });
  }
});

module.exports = router;
