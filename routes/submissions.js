/**
 * Submission Routes
 * Handles all submission-related operations including:
 * - Creating new submissions (before/after)
 * - Retrieving before categories for step 2
 * - Admin submission management (view, delete, bulk delete)
 */

const express = require('express');
const router = express.Router();

// Models
const Submission = require('../models/Submission');

// Middleware
const { requireAdmin, requireAuth } = require('../middleware/auth');

// Services
const { getData } = require('../services/dataLoader');
const { checkMCPCompliance } = require('../services/mcpCompliance');
const { sendUnfixedIssueNotification } = require('../services/telegramNotifier');

// S3 Configuration
const { upload, uploadBufferToS3, deleteFromS3 } = require('../config/s3Config');

/**
 * POST /api/submit
 * Create a new submission (before or after)
 * Uploads images to S3 and saves submission data to MongoDB
 */
router.post('/submit', async (req, res) => {
  try {
    console.log('📥 Received submission request');
    console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

    const { storeId, categories, step, sessionId, userId, username, storeName } = req.body;

    if (!req.session.user) {
      return res.status(401).json({ error: 'User not logged in' });
    }

    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'Categories data is required' });
    }

    console.log(`📋 Processing ${categories.length} category submissions for step: ${step}`);

    // Debug: Log the structure of categories to see note data
    categories.forEach((category, index) => {
      console.log(`📝 Category ${index + 1}:`, {
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        note: category.note,
        fixed: category.fixed, // Log the fixed status
        imageCount: category.images ? category.images.length : 0
      });
    });

    // Get stores data
    const { storesData } = getData();

    // Find store information
    const store = storesData.find(s =>
      s.storeCode === storeId ||
      s['Store code (Fieldcheck)'] === storeId ||
      s.STT === storeId
    );

    if (!store) {
      return res.status(400).json({ error: 'Store not found' });
    }

    // Process images and upload to S3
    let totalUploadedImages = 0;

    if (categories && categories.length > 0) {
      for (const category of categories) {
        console.log(`📤 Uploading ${category.images?.length || 0} images for category ${category.categoryName}...`);

        const processedImages = [];

        if (category.images && category.images.length > 0) {
          for (let i = 0; i < category.images.length; i++) {
            try {
              const base64Data = category.images[i];
              const matches = base64Data.match(/^data:image\/([a-zA-Z]*);base64,(.+)$/);

              if (!matches) {
                console.warn(`⚠️ Invalid base64 image format for category ${category.categoryId}, image ${i}`);
                continue;
              }

              const imageType = matches[1];
              const imageBuffer = Buffer.from(matches[2], 'base64');
              const filename = `${step}-${sessionId}-${category.categoryId}-${i + 1}.${imageType}`;

              const imageUrl = await uploadBufferToS3(imageBuffer, filename, `image/${imageType}`);
              processedImages.push(imageUrl);
              totalUploadedImages++;
              console.log(`✅ Image ${i + 1} uploaded successfully for category ${category.categoryName}`);

            } catch (uploadError) {
              console.error(`❌ Error uploading image ${i + 1} for category ${category.categoryName}:`, uploadError);
            }
          }
        }

        // Update the category with processed image URLs
        category.processedImages = processedImages;
      }
    }

    console.log(`📸 Successfully uploaded ${totalUploadedImages} images across ${categories.length} categories`);

    // Create submission documents for each category
    for (const category of categories) {
      try {
        const newSubmission = new Submission({
          username: req.session.user.username,
          userId: req.session.user.id || req.session.user.userId,
          tdsName: (store.tdsName || store['TDS name'] || '').trim(),
          storeId: storeId,
          storeName: store['Store name'] || store.storeName || store.name || 'Unknown Store',
          storeAddress: store.Address || store.address || '',
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          note: category.note || '',
          fixed: category.fixed, // Save the yes/no answer separately
          expectedResolutionDate: category.fixed === false ? category.expectedResolutionDate : undefined,
          images: category.processedImages || [],
          submissionType: step,
          sessionId: sessionId,
          submittedAt: new Date()
        });

        await newSubmission.save();
        console.log(`✅ Saved submission for category: ${category.categoryName} with ${category.processedImages?.length || 0} images`);

        // Send Telegram notification if this is an "after" submission with unfixed issue
        if (step === 'after' && category.fixed === false) {
          console.log(`📨 Triggering Telegram notification for unfixed issue in category: ${category.categoryName}`);

          // Find corresponding "before" submission to get images
          Submission.findOne({
            storeId: storeId,
            categoryId: category.categoryId,
            sessionId: sessionId,
            submissionType: 'before'
          })
            .then(beforeSubmission => {
              // Send notification (async, non-blocking)
              sendUnfixedIssueNotification({
                userId: req.session.user.id || req.session.user.userId,
                username: req.session.user.username,
                tdsName: (store.tdsName || store['TDS name'] || '').trim(),
                storeName: store['Store name'] || store.storeName || store.name || 'Unknown Store',
                categoryName: category.categoryName,
                note: category.note || '',
                expectedResolutionDate: category.expectedResolutionDate,
                submittedAt: newSubmission.submittedAt
              }, beforeSubmission).catch(err => {
                console.error('❌ Telegram notification failed:', err.message);
                // Don't fail the API request
              });
            })
            .catch(err => {
              console.error('❌ Error finding before submission for Telegram notification:', err);
            });
        }

      } catch (saveError) {
        console.error('❌ Error saving submission:', saveError);
      }
    }

    console.log(`🎉 Submission completed successfully`);
    res.json({
      success: true,
      message: 'Submission saved successfully',
      imageCount: totalUploadedImages
    });

  } catch (error) {
    console.error('❌ Submission error:', error);
    res.status(500).json({ error: 'Failed to process submission' });
  }
});

/**
 * GET /api/before-categories/:storeId
 * Get categories that were submitted in the "before" step
 * Used in step 2 to show which categories need "after" photos
 */
router.get('/before-categories/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params;
    const { sessionId } = req.query;

    if (!req.session.user) {
      return res.status(401).json({ error: 'User not logged in' });
    }

    console.log(`📋 Loading before categories for store: ${storeId}, sessionId: ${sessionId}`);

    // Build query dynamically to handle cases where userId might be undefined
    const baseQuery = {
      storeId: storeId,
      sessionId: sessionId,
      submissionType: 'before'
    };

    const currentUserId = req.session.user.id || req.session.user.userId;
    const currentUsername = req.session.user.username;

    console.log(`📋 Base query filters:`, baseQuery);
    console.log(`📋 Current user - ID: ${currentUserId}, Username: ${currentUsername}`);

    // Try to find submissions with userId first
    let beforeSubmissions = [];

    if (currentUserId) {
      const userIdQuery = { ...baseQuery, userId: currentUserId };
      console.log(`📋 Trying userId query:`, userIdQuery);
      beforeSubmissions = await Submission.find(userIdQuery).select('categoryId categoryName').lean();
      console.log(`📋 Found ${beforeSubmissions.length} submissions with userId`);
    }

    // If no results with userId, try with username
    if (beforeSubmissions.length === 0 && currentUsername) {
      const usernameQuery = { ...baseQuery, username: currentUsername };
      console.log(`📋 Trying username query:`, usernameQuery);
      beforeSubmissions = await Submission.find(usernameQuery).select('categoryId categoryName').lean();
      console.log(`📋 Found ${beforeSubmissions.length} submissions with username`);
    }

    // If still no results, try without user filtering (for backward compatibility)
    if (beforeSubmissions.length === 0) {
      console.log(`📋 Trying base query without user filtering:`, baseQuery);
      beforeSubmissions = await Submission.find(baseQuery).select('categoryId categoryName').lean();
      console.log(`📋 Found ${beforeSubmissions.length} submissions without user filtering`);
    }

    console.log(`📋 Found ${beforeSubmissions.length} before submissions`);

    // Extract unique categories with imageCount
    const beforeCategories = beforeSubmissions.reduce((acc, submission) => {
      let existing = acc.find(cat => cat.categoryId === submission.categoryId);
      if (!existing) {
        existing = {
          categoryId: submission.categoryId,
          categoryName: submission.categoryName,
          imageCount: 1
        };
        acc.push(existing);
      } else {
        existing.imageCount = (existing.imageCount || 1) + 1;
      }
      return acc;
    }, []);

    console.log(`📋 Before categories:`, beforeCategories);
    res.json(beforeCategories);

  } catch (error) {
    console.error('❌ Error loading before categories:', error);
    res.status(500).json({ error: 'Failed to load before categories' });
  }
});

/**
 * GET /api/admin/submissions
 * Get all submissions with optional filters (Admin only)
 * Supports filtering by username, TDS name, store, category, and date range
 */
router.get('/admin/submissions', requireAdmin, async (req, res) => {
  try {
    const { username, tdsName, store, category, startDate, endDate } = req.query;

    // Build filter object
    const filter = {};

    if (username && username.trim() !== '') {
      filter.username = { $regex: username.trim(), $options: 'i' };
    }

    if (tdsName && tdsName.trim() !== '') {
      filter.tdsName = { $regex: tdsName.trim(), $options: 'i' };
    }

    if (store && store.trim() !== '') {
      filter.storeName = { $regex: store.trim(), $options: 'i' };
    }

    if (category && category.trim() !== '') {
      filter.categoryName = { $regex: category.trim(), $options: 'i' };
    }

    if (startDate || endDate) {
      filter.submittedAt = {};
      if (startDate) {
        filter.submittedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999); // End of day
        filter.submittedAt.$lte = endDateTime;
      }
    }

    console.log('Admin submissions filter:', filter);

    const submissions = await Submission.find(filter)
      .sort({ submittedAt: -1 })
      .lean();

    console.log(`Found ${submissions.length} submissions for admin`);
    res.json(submissions);

  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

/**
 * DELETE /api/admin/submissions/bulk-delete
 * Bulk delete multiple submissions (Admin only)
 * Also deletes associated images from S3
 */
router.delete('/admin/submissions/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Valid submission IDs array is required' });
    }

    // Find all submissions to get their image URLs
    const submissions = await Submission.find({ _id: { $in: ids } });

    if (submissions.length === 0) {
      return res.status(404).json({ error: 'No submissions found' });
    }

    // Delete images from S3
    let deletedImagesCount = 0;
    for (const submission of submissions) {
      if (submission.images && submission.images.length > 0) {
        for (const imageUrl of submission.images) {
          try {
            await deleteFromS3(imageUrl);
            deletedImagesCount++;
          } catch (s3Error) {
            console.error('Error deleting image from S3:', s3Error);
            // Continue with deletion even if some images fail to delete
          }
        }
      }
    }

    // Delete all submissions from MongoDB
    const deleteResult = await Submission.deleteMany({ _id: { $in: ids } });

    console.log(`Bulk delete completed: ${deleteResult.deletedCount} submissions deleted, ${deletedImagesCount} images removed from S3`);

    res.json({
      success: true,
      deletedCount: deleteResult.deletedCount,
      deletedImagesCount: deletedImagesCount
    });

  } catch (error) {
    console.error('Bulk delete submissions error:', error);
    res.status(500).json({ error: 'Failed to delete submissions' });
  }
});

/**
 * DELETE /api/admin/submissions/:id
 * Delete a single submission (Admin only)
 * Also deletes associated images from S3
 */
router.delete('/admin/submissions/:id', requireAdmin, async (req, res) => {
  try {
    const submissionId = req.params.id;

    // Find the submission to get the image URLs
    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Delete images from S3 if needed
    if (submission.images && submission.images.length > 0) {
      for (const imageUrl of submission.images) {
        try {
          await deleteFromS3(imageUrl);
        } catch (s3Error) {
          console.error('Error deleting image from S3:', s3Error);
          // Continue with deletion even if some images fail to delete
        }
      }
    }

    // Delete the submission from MongoDB
    await Submission.findByIdAndDelete(submissionId);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete submission error:', error);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

module.exports = router;
