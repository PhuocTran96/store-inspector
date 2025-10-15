const express = require('express');
const router = express.Router();
const Submission = require('../models/Submission');

// Get user submission history (paginated)
router.get('/', async (req, res) => {
  // Authentication check
  if (!req.session.user) {
    return res.status(401).json({ error: 'User not logged in' });
  }

  try {
    const userId = req.session.user.id || req.session.user.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Find all submissions for this user
    const allSubs = await Submission.find({ userId }).sort({ submittedAt: -1 }).lean();

    // Group by sessionId + storeId
    const sessionMap = {};
    for (const sub of allSubs) {
      const key = `${sub.sessionId}|${sub.storeId}`;
      if (!sessionMap[key]) {
        sessionMap[key] = {
          storeId: sub.storeId,
          storeName: sub.storeName,
          sessionId: sub.sessionId,
          submittedAt: sub.submittedAt,
          before: [],
          after: []
        };
      }
      if (sub.submissionType === 'before') sessionMap[key].before.push(sub);
      if (sub.submissionType === 'after') sessionMap[key].after.push(sub);
    }

    // Convert to array and paginate
    const sessions = Object.values(sessionMap).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const paged = sessions.slice(skip, skip + limit);

    // Format response to match client expectations
    const totalPages = Math.ceil(sessions.length / limit);
    res.json({
      history: paged,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        total: sessions.length,
        limit: limit
      }
    });
  } catch (error) {
    console.error('Error loading user history:', error);
    res.status(500).json({ error: 'Failed to load user history' });
  }
});

module.exports = router;
