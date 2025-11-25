const Product = require("../../models/product.model");
const Category = require("../../models/category.model");
const Subcategory = require("../../models/subcategory.model");
const fs = require("fs");
const path = require("path");
const mongoose = require('mongoose'); 
exports.getProductList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const search = req.query.search || '';
    const selectedCategory = req.query.category || '';
    const selectedSubCategory = req.query.subCategory || '';
    const statusFilter = req.query.status || '';
    const sortOption = req.query.sort || '';

    const sortCriteria = {
      price_asc: { salePrice: 1 },
      price_desc: { salePrice: -1 },
      name_asc: { productName: 1 },
      name_desc: { productName: -1 },
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
    }[sortOption] || { createdAt: -1 };

    const query = {
      isDeleted: { $ne: true },
      ...(search && { productName: { $regex: search, $options: 'i' } }),
      ...(selectedCategory && { category: selectedCategory }),
      ...(selectedSubCategory && { subCategory: selectedSubCategory }),
      ...(statusFilter && { status: statusFilter }),
    };

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(query)
      .collation({ locale: 'en', strength: 2 })
      .populate('category')
      .populate('subCategory')
      .sort(sortCriteria)
      .skip((page - 1) * limit)
      .limit(limit);

    const categories = await Category.find({ isListed: true });

    const buildPaginationLink = (page) => {
      const params = new URLSearchParams({
        page,
        search,
        category: selectedCategory,
        subCategory: selectedSubCategory,
        status: statusFilter,
        sort: sortOption,
      });
      return `/admin/products?${params.toString()}`;
    };

    res.render('admin/products', {
      products,
      currentPage: page,
      totalPages,
      totalProducts,
      limit,
      searchQuery: search,
      selectedCategory,
      selectedSubCategory,
      statusFilter,
      sortOption,
      categories,
      buildPaginationLink,
    });
  } catch (error) {
    console.error('Error fetching product list:', error.message);
    res.status(500).json({ error: 'Failed to load products' });
  }
};

exports.addProducts = async (req, res) => {
  console.log("Session:", req.session);

  try {
    console.log('Add product request received');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    const { productName, description, category, subCategory, regularPrice, salePrice, quantity } = req.body;

    // Validation
    if (!productName || !productName.trim()) {
      console.log('Validation failed: Product name is required');
      return res.status(400).json({ error: 'Product name is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }
    if (!category || !mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ error: 'Valid category is required' });
    }
    if (!regularPrice || isNaN(regularPrice) || regularPrice < 0) {
      return res.status(400).json({ error: 'Valid regular price is required' });
    }
    if (!salePrice || isNaN(salePrice) || salePrice < 0) {
      return res.status(400).json({ error: 'Valid sale price is required' });
    }
    if (!quantity || isNaN(quantity) || !Number.isInteger(Number(quantity)) || quantity < 0) {
      return res.status(400).json({ error: 'Valid non-negative whole number for quantity is required' });
    }
    if (!req.files || req.files.length < 3) {
      return res.status(400).json({ error: 'At least 3 images are required' });
    }

    const productExists = await Product.findOne({ productName });
    if (productExists) {
      return res.status(400).json({ error: 'Product already exists' });
    }

    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    let subCategoryId = null;
    if (subCategory && mongoose.Types.ObjectId.isValid(subCategory)) {
      const subcatDoc = await Subcategory.findById(subCategory);
      if (!subcatDoc) {
        return res.status(400).json({ error: 'Invalid subcategory' });
      }
      if (String(subcatDoc.category) !== String(categoryDoc._id)) {
        return res.status(400).json({ error: 'Subcategory does not belong to selected category' });
      }
      subCategoryId = subcatDoc._id;
    }

    const images = req.files.map(file => file.filename);

    const product = new Product({
      productName,
      description,
      category: categoryDoc._id,
      subCategory: subCategoryId,
      regularPrice: parseFloat(regularPrice),
      salePrice: parseFloat(salePrice),
      quantity: parseInt(quantity),
      productImage: images,
      status: 'Available',
      createdOn: new Date(),
    });

    await product.save();
    res.status(200).json({ message: 'Product added successfully' });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Product addition failed' });
  }
};

// Configure multer for file uploads
const multer = require('multer');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../public/images/products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, webp)'));
  }
};

// Initialize multer with configuration
exports.upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).array('images', 4); // 'images' is the field name, max 4 files

exports.editProduct = async (req, res) => {
  console.log("Edit product request received");
  
  try {
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    
    const productId = req.params.id;
    const { productName, description, category, subCategory, regularPrice, salePrice, quantity, deleteImages } = req.body;

    // Validation
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!productName || !productName.trim()) {
      console.log('Validation failed: Product name is required');
      return res.status(400).json({ error: 'Product name is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }
    if (!category || !mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ error: 'Valid category is required' });
    }
    if (!regularPrice || isNaN(regularPrice) || regularPrice < 0) {
      return res.status(400).json({ error: 'Valid regular price is required' });
    }
    if (!salePrice || isNaN(salePrice) || salePrice < 0) {
      return res.status(400).json({ error: 'Valid sale price is required' });
    }
    if (!quantity || isNaN(quantity) || !Number.isInteger(Number(quantity)) || quantity < 0) {
      return res.status(400).json({ error: 'Valid non-negative whole number for quantity is required' });
    }

    // Check if product name is being changed to an existing name
    if (productName !== product.productName) {
      const productExists = await Product.findOne({ productName, _id: { $ne: productId } });
      if (productExists) {
        return res.status(400).json({ error: 'Product with this name already exists' });
      }
    }

    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    let subCategoryId = null;
    if (subCategory && mongoose.Types.ObjectId.isValid(subCategory)) {
      const subcatDoc = await Subcategory.findById(subCategory);
      if (!subcatDoc) {
        return res.status(400).json({ error: 'Invalid subcategory' });
      }
      if (String(subcatDoc.category) !== String(categoryDoc._id)) {
        return res.status(400).json({ error: 'Subcategory does not belong to selected category' });
      }
      subCategoryId = subcatDoc._id;
    }

    // Handle image removal - deleteImages can be a string or array
    let imagesToDelete = [];
    if (deleteImages) {
      imagesToDelete = Array.isArray(deleteImages) ? deleteImages : [deleteImages];
    }

    // Start with existing images, removing the ones marked for deletion
    let images = product.productImage.filter(img => !imagesToDelete.includes(img));

    // Add new uploaded images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => file.filename);
      images = [...images, ...newImages];
    }

    // Limit to 4 images total
    if (images.length > 4) {
      images = images.slice(0, 4);
    }

    // Ensure at least 3 images
    if (images.length < 3) {
      return res.status(400).json({ error: 'At least 3 images are required. Please upload more images or uncheck some deletions.' });
    }

    // Delete the actual image files that were marked for deletion
    const uploadPath = path.join(__dirname, '../../public/uploads/product-images/');
    imagesToDelete.forEach(img => {
      const imagePath = path.join(uploadPath, img);
      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
          console.log(`Deleted image: ${img}`);
        } catch (err) {
          console.error(`Error deleting image ${img}:`, err);
        }
      }
    });

    // Update product fields
    product.productName = productName;
    product.description = description;
    product.category = categoryDoc._id;
    product.subCategory = subCategoryId;
    product.regularPrice = parseFloat(regularPrice);
    product.salePrice = parseFloat(salePrice);
    product.quantity = parseInt(quantity);
    product.productImage = images;
    product.status = parseInt(quantity) > 0 ? 'Available' : 'Out of Stock';

    await product.save();
    res.status(200).json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Product update failed' });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const product = await Product.findByIdAndDelete(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
};

exports.toggleBlockProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.isBlocked = !product.isBlocked;
    await product.save();

    res.status(200).json({ message: `Product ${product.isBlocked ? 'blocked' : 'unblocked'} successfully` });
  } catch (error) {
    console.error('Error toggling product block:', error);
    res.status(500).json({ error: 'Failed to toggle product block status' });
  }
};