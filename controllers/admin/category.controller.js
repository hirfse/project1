const HTTP_STATUS = require("../../constants/httpStatus");
const MESSAGES = require("../../constants/messages");
const Category = require("../../models/category.model");
const Subcategory = require("../../models/subcategory.model");
const Product = require("../../models/product.model");
const mongoose = require("mongoose");

exports.getCategoryManagementPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const search = req.query.search || "";

    const query = search ? { name: { $regex: search, $options: "i" } } : {};
    const categories = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalCategories = await Category.countDocuments(query);

    res.render("admin/category", {
      cat: categories || [],
      currentPage: page,
      totalPages: Math.ceil(totalCategories / limit),
      totalCategories,
      search: search,
    });
  } catch (error) {
    console.error(error);
    res.redirect("/admin/pageerror");
  }
};

exports.categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const search = req.query.search || "";

    const query = search ? { name: { $regex: search, $options: "i" } } : {};
    const categories = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    
    const totalCategories = await Category.countDocuments(query);

    res.render("admin/category", {
      cat: categories,
      currentPage: page,
      totalPages: Math.ceil(totalCategories / limit),
      totalCategories,
      search, 
    });
  } catch (error) {
    console.error(error);
    res.redirect("/admin/pageerror");
  }
};

exports.addCategory = async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: MESSAGES.VALIDATION.REQUIRED_FIELD });
  }

  try {
    // Convert input to lowercase for case-insensitive comparison
    const normalizedName = name.toLowerCase().trim();
    
    // Check if category exists (case-insensitive)
    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${normalizedName}$`, 'i') } 
    });

    if (existingCategory) {
      return res.status(HTTP_STATUS.CONFLICT).json({ error: "Category already exists" });
    }
    
    const newCategory = new Category({
      name: name.trim(), // Store original name but trimmed
      description: description ? description.trim() : undefined,      
    });
    
    await newCategory.save();
    return res.status(HTTP_STATUS.CREATED).json({ 
      message: "Category added successfully",
      category: newCategory 
    });
  } catch (error) {
    console.error("Error in addCategory:", error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: MESSAGES.SERVER.INTERNAL_ERROR });
  }
};

exports.getListCategory = async (req, res) => {
    try {
        const categoryId = req.query.id;
        console.log('getListCategory: Attempting to list categoryId=', categoryId, 'Session:', req.session);

        // Validate categoryId
        if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
            console.warn('Invalid or missing categoryId:', categoryId);
            return res.status(HTTP_STATUS.BAD_REQUEST).redirect('/admin/category?error=Invalid category ID');
        }

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            console.warn('Category not found for categoryId:', categoryId);
            return res.status(HTTP_STATUS.NOT_FOUND).redirect('/admin/category?error=Category not found');
        }
        console.log('Category found:', category);

        // Check current isListed status
        if (category.isListed === true) {
            console.warn('Category already listed: categoryId=', categoryId);
            return res.status(HTTP_STATUS.BAD_REQUEST).redirect('/admin/category?error=Category already listed');
        }

        // Update isListed to true
        const result = await Category.updateOne(
            { _id: categoryId, isListed: false },
            { isListed: true }
        );

        console.log('Update result:', result);
        if (result.matchedCount === 0 || result.modifiedCount === 0) {
            console.warn('Failed to update categoryId:', categoryId, 'Result:', result);
            return res.status(HTTP_STATUS.BAD_REQUEST).redirect('/admin/category?error=Failed to update category status');
        }

        console.log('Category listed successfully: categoryId=', categoryId);
        res.redirect('/admin/category?success=Category listed successfully');
    } catch (error) {
        console.error('Error in getListCategory:', {
            message: error.message,
            stack: error.stack,
            categoryId: req.query.id
        });
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).redirect('/admin/category?error=Failed to list category: ' + error.message);
    }
};

exports.getUnlistCategory = async (req, res) => {
    try {
        const categoryId = req.query.id;
        console.log('getUnlistCategory: Attempting to unlist categoryId=', categoryId);

        // Validate categoryId
        if (!categoryId) {
            console.warn('Missing categoryId in query');
            return res.status(HTTP_STATUS.BAD_REQUEST).redirect('/admin/category?error=Missing category ID');
        }
        if (!mongoose.isValidObjectId(categoryId)) {
            console.warn('Invalid categoryId:', categoryId);
            return res.status(HTTP_STATUS.BAD_REQUEST).redirect('/admin/category?error=Invalid category ID');
        }

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            console.warn('Category not found for categoryId:', categoryId);
            return res.status(HTTP_STATUS.NOT_FOUND).redirect('/admin/category?error=Category not found');
        }

        // Check current isListed status
        if (category.isListed === false) {
            console.warn('Category already unlisted: categoryId=', categoryId);
            return res.status(HTTP_STATUS.BAD_REQUEST).redirect('/admin/category?error=Category already unlisted');
        }

        // Update isListed to false
        const result = await Category.updateOne(
            { _id: categoryId, isListed: true }, // Ensure only listed categories are updated
            { isListed: false }
        );

        if (result.matchedCount === 0) {
            console.warn('No matching category found or already unlisted: categoryId=', categoryId);
            return res.status(HTTP_STATUS.BAD_REQUEST).redirect('/admin/category?error=Category not found or already unlisted');
        }
        if (result.modifiedCount === 0) {
            console.warn('No changes made to categoryId:', categoryId);
            return res.status(HTTP_STATUS.BAD_REQUEST).redirect('/admin/category?error=Failed to update category status');
        }

        console.log('Category unlisted successfully: categoryId=', categoryId);
        res.redirect('/admin/category?success=Category unlisted successfully');
    } catch (error) {
        console.error('Error in getUnlistCategory:', {
            message: error.message,
            stack: error.stack,
            categoryId: req.query.id
        });
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).redirect('/admin/category?error=Failed to unlist category: ' + error.message);
    }
};

exports.getEditCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.query.id);
    if (!category) {
      return res.status(HTTP_STATUS.NOT_FOUND).redirect('/admin/category?error=Category not found');
    }
    res.render("admin/edit-category", { category });
  } catch (error) {
    console.error("Error in getEditCategory:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).redirect('/admin/category?error=' + MESSAGES.SERVER.INTERNAL_ERROR);
  }
};

exports.editCategory = async (req, res) => {
  try {
    const { categoryName, description } = req.body;
    
    if (!categoryName) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: MESSAGES.VALIDATION.REQUIRED_FIELD });
    }

    // Check if category name already exists (excluding current category)
    const existingCategory = await Category.findOne({ 
      name: categoryName, 
      _id: { $ne: req.params.id } 
    });
    
    if (existingCategory) {
      return res.status(HTTP_STATUS.CONFLICT).json({ error: "Category already exists" });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id, 
      { name: categoryName, description }, 
      { new: true }
    );
    
    if (!updatedCategory) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: "Category not found" });
    }
    
    res.status(HTTP_STATUS.OK).json({ 
      message: "Category updated successfully", 
      category: updatedCategory 
    });
  } catch (error) {
    console.error("Error in editCategory:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: MESSAGES.SERVER.INTERNAL_ERROR });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    // Check if category exists
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: "Category not found" });
    }

    // Delete associated products
    await Product.deleteMany({ category: req.params.id });
    
    // Delete the category
    await Category.findByIdAndDelete(req.params.id);
    
    res.status(HTTP_STATUS.OK).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error in deleteCategory:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: MESSAGES.SERVER.INTERNAL_ERROR });
  }
};

//////////////////////////////////////
// Subcategory Management (JSON API)
//////////////////////////////////////

exports.listSubcategories = async (req, res) => {
  try {
    const filter = {};
    if (req.query.category && mongoose.isValidObjectId(req.query.category)) {
      filter.category = req.query.category;
    }
    const subs = await Subcategory.find(filter).populate('category').sort({ createdAt: -1 });
    res.status(HTTP_STATUS.OK).json({ subcategories: subs });
  } catch (err) {
    console.error('Error listing subcategories:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: MESSAGES.SERVER.INTERNAL_ERROR });
  }
};

exports.addSubcategory = async (req, res) => {
  try {
    const { name, category } = req.body;
    
    if (!name || !category) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: MESSAGES.VALIDATION.REQUIRED_FIELD });
    }

    if (!mongoose.isValidObjectId(category)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid category' });
    }
    
    const catDoc = await Category.findById(category);
    if (!catDoc) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Category not found' });
    }

    const exists = await Subcategory.findOne({ 
      name: new RegExp(`^${name.trim()}$`, 'i'), 
      category 
    });
    
    if (exists) {
      return res.status(HTTP_STATUS.CONFLICT).json({ error: 'Subcategory already exists in this category' });
    }

    const sub = new Subcategory({ 
      name: name.trim(), 
      category, 
      isActive: true 
    });
    
    await sub.save();
    
    res.status(HTTP_STATUS.CREATED).json({ 
      message: 'Subcategory added successfully', 
      subcategory: sub 
    });
  } catch (err) {
    console.error('Error adding subcategory:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: MESSAGES.SERVER.INTERNAL_ERROR });
  }
};

exports.editSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category } = req.body;
    
    if (!mongoose.isValidObjectId(id)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid subcategory id' });
    }
    
    if (!name || !category) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: MESSAGES.VALIDATION.REQUIRED_FIELD });
    }
    
    if (!mongoose.isValidObjectId(category)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid category' });
    }

    const catDoc = await Category.findById(category);
    if (!catDoc) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Category not found' });
    }

    const conflict = await Subcategory.findOne({ 
      _id: { $ne: id }, 
      name: new RegExp(`^${name.trim()}$`, 'i'), 
      category 
    });
    
    if (conflict) {
      return res.status(HTTP_STATUS.CONFLICT).json({ error: 'Another subcategory with this name exists in the category' });
    }

    const updated = await Subcategory.findByIdAndUpdate(
      id, 
      { name: name.trim(), category }, 
      { new: true }
    );
    
    if (!updated) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Subcategory not found' });
    }
    
    res.status(HTTP_STATUS.OK).json({ 
      message: 'Subcategory updated successfully', 
      subcategory: updated 
    });
  } catch (err) {
    console.error('Error editing subcategory:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: MESSAGES.SERVER.INTERNAL_ERROR });
  }
};

exports.toggleSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.isValidObjectId(id)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid subcategory id' });
    }
    
    const sub = await Subcategory.findById(id);
    if (!sub) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Subcategory not found' });
    }
    
    sub.isActive = !sub.isActive;
    await sub.save();
    
    res.status(HTTP_STATUS.OK).json({ 
      message: `Subcategory ${sub.isActive ? 'activated' : 'deactivated'} successfully` 
    });
  } catch (err) {
    console.error('Error toggling subcategory:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: MESSAGES.SERVER.INTERNAL_ERROR });
  }
};

exports.deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.isValidObjectId(id)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid subcategory id' });
    }

    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Subcategory not found' });
    }
    
    await Subcategory.findByIdAndDelete(id);
    
    res.status(HTTP_STATUS.OK).json({ 
      message: 'Subcategory deleted successfully' 
    });
  } catch (err) {
    console.error('Error deleting subcategory:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: MESSAGES.SERVER.INTERNAL_ERROR });
  }
};