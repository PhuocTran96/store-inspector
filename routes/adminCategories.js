/**
 * Admin category management routes
 * Handles all category CRUD operations and migration from CSV to MongoDB
 */
const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { requireAdmin } = require('../middleware/auth');
const { migrateCategoriesFromCSVToMongoDB, getData } = require('../services/dataLoader');

/**
 * POST /api/admin/categories/migrate
 * Migrate categories from CSV to MongoDB
 * This is typically used during initial setup or when updating from CSV source
 */
router.post('/categories/migrate', requireAdmin, async (req, res) => {
  try {
    await migrateCategoriesFromCSVToMongoDB();
    res.json({ success: true, message: 'Categories migrated successfully' });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed' });
  }
});

/**
 * GET /api/admin/categories
 * Get all categories from MongoDB
 * Returns categories sorted by order and name
 */
router.get('/categories', requireAdmin, async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ order: 1, name: 1 });
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

/**
 * POST /api/admin/categories
 * Create a new category
 * Body: { id, name, description, order }
 */
router.post('/categories', requireAdmin, async (req, res) => {
  try {
    const { id, name, description, order } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const newCategory = new Category({
      id: id || `cat_${Date.now()}`,
      name,
      description: description || '',
      order: order || 0,
      isActive: true
    });

    await newCategory.save();

    // Reload categories data in memory
    const { loadCategoriesFromMongoDB } = require('../services/dataLoader');
    await loadCategoriesFromMongoDB();

    res.json({ success: true, category: newCategory });
  } catch (error) {
    console.error('Create category error:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A category with this ID already exists' });
    }

    res.status(500).json({ error: 'Failed to create category' });
  }
});

/**
 * PUT /api/admin/categories/:id
 * Update an existing category
 * Params: id - category ID
 * Body: { name, description, order, isActive }
 */
router.put('/categories/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, order, isActive } = req.body;

    const category = await Category.findOne({ id });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Update fields if provided
    if (name !== undefined) category.name = name;
    if (description !== undefined) category.description = description;
    if (order !== undefined) category.order = order;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();

    // Reload categories data in memory
    const { loadCategoriesFromMongoDB } = require('../services/dataLoader');
    await loadCategoriesFromMongoDB();

    res.json({ success: true, category });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

/**
 * DELETE /api/admin/categories/:id
 * Delete a category
 * Params: id - category ID
 */
router.delete('/categories/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findOneAndDelete({ id });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Reload categories data in memory
    const { loadCategoriesFromMongoDB } = require('../services/dataLoader');
    await loadCategoriesFromMongoDB();

    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
