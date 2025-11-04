require('dotenv').config();
const HTTP_STATUS = require('../../constants/httpStatus');
const User = require('../../models/user.model')
const Product = require("../../models/product.model");
const Category = require("../../models/category.model");
const Subcategory = require("../../models/subcategory.model");
const Order = require('../../models/order.model');
const Wallet = require('../../models/wallet.model');
const Offer = require('../../models/offer.model');
const Coupon = require('../../models/coupon.model');
const { validateAndApplyCoupon } = require('./coupon.controller');
const fs = require("fs");
const path = require("path");
const mongoose = require('mongoose'); // Add this line

const EventEmitter = require('events');
const category = require('../../models/category.model');
EventEmitter.defaultMaxListeners = 20; 

exports.getAdminLogin = (req, res) => {
  if (req.session.userId && req.session.role == 'admin') {
    return res.redirect('/admin/adminHome');
  }
  res.render('admin/login', { error: null });
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
    res.json({ subcategories: subs });
  } catch (err) {
    console.error('Error listing subcategories:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to load subcategories' });
  }
};

exports.addSubcategory = async (req, res) => {
  try {
    const { name,  category } = req.body;
    if (!name || !category) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Name and category are required' });
    }

    if (!mongoose.isValidObjectId(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    const catDoc = await Category.findById(category);
    if (!catDoc) return res.status(400).json({ error: 'Category not found' });

    const exists = await Subcategory.findOne({ name: new RegExp(`^${name.trim()}$`, 'i'), category });
    if (exists) return res.status(400).json({ error: 'Subcategory already exists in this category' });

    const sub = new Subcategory({ name: name.trim(), category, isActive: true });
    await sub.save();
    res.status(201).json({ message: 'Subcategory added successfully', subcategory: sub });
  } catch (err) {
    console.error('Error adding subcategory:', err);
    res.status(500).json({ error: 'Failed to add subcategory' });
  }
};

exports.editSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category } = req.body;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid subcategory id' });
    if (!name || !category) return res.status(400).json({ error: 'Name and category are required' });
    if (!mongoose.isValidObjectId(category)) return res.status(400).json({ error: 'Invalid category' });

    const catDoc = await Category.findById(category);
    if (!catDoc) return res.status(400).json({ error: 'Category not found' });

    const conflict = await Subcategory.findOne({ _id: { $ne: id }, name: new RegExp(`^${name.trim()}$`, 'i'), category });
    if (conflict) return res.status(400).json({ error: 'Another subcategory with this name exists in the category' });

    const updated = await Subcategory.findByIdAndUpdate(id, { name: name.trim(), category }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Subcategory not found' });
    res.json({ message: 'Subcategory updated successfully', subcategory: updated });
  } catch (err) {
    console.error('Error editing subcategory:', err);
    res.status(500).json({ error: 'Failed to edit subcategory' });
  }
};

exports.toggleSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid subcategory id' });
    const sub = await Subcategory.findById(id);
    if (!sub) return res.status(404).json({ error: 'Subcategory not found' });
    sub.isActive = !sub.isActive;
    await sub.save();
    res.json({ message: `Subcategory ${sub.isActive ? 'activated' : 'deactivated'} successfully` });
  } catch (err) {
    console.error('Error toggling subcategory:', err);
    res.status(500).json({ error: 'Failed to toggle subcategory' });
  }
};

exports.deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid subcategory id' });
    await Subcategory.findByIdAndDelete(id);
    res.json({ message: 'Subcategory deleted successfully' });
  } catch (err) {
    console.error('Error deleting subcategory:', err);
    res.status(500).json({ error: 'Failed to delete subcategory' });
  }
};

exports.handleAdminLogin = async (req, res) => {
  try {
      const { email, password } = req.body;
      const adminEmail = process.env.EMAIL;
      const adminPass = process.env.PASSWORD;

      if (adminEmail !== email) {
          return res.render('admin/login', { error: 'User Not found' });
      }

      if (adminPass !== password) {
          return res.render('admin/login', { error: 'Invalid credentials' });
      }

      // Clear any existing user session data
      req.session.userEmail = undefined;
      req.session.userRole = undefined;
      req.session.userName = undefined;

      // Set admin session data
      req.session.userId = 'admin';
      req.session.role = 'admin';

      return res.redirect('/admin/adminHome');
  } catch (error) {
      res.render('admin/login', { error: 'Server Error' });
  }
};



// Helper function to get date range based on period
const getDateRange = (period) => {
  const now = new Date();
  const start = new Date();
  
  switch(period) {
    case 'year':
      start.setFullYear(now.getFullYear() - 1);
      break;
    case 'month':
      start.setMonth(now.getMonth() - 1);
      break;
    case 'week':
      start.setDate(now.getDate() - 7);
      break;
    default: // 30 days
      start.setDate(now.getDate() - 30);
  }
  
  return { start, end: now };
};

// Get filtered sales data for charts
exports.getSalesData = async (req, res) => {
  try {
    const { period, year } = req.query;
    const now = new Date();
    let startDate, endDate, groupBy, format;

    // Set date range and grouping based on period
    switch(period) {
      case 'year':
        // Last 5 years
        startDate = new Date(now.getFullYear() - 4, 0, 1);
        endDate = new Date(now.getFullYear() + 1, 0, 1);
        groupBy = { $year: '$orderDate' };
        format = 'YYYY';
        break;
      case 'month':
        // Last 12 months
        startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        groupBy = { 
          year: { $year: '$orderDate' },
          month: { $month: '$orderDate' }
        };
        format = 'MMM YYYY';
        break;
      case 'week':
        // Last 12 weeks
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 84); // 12 weeks * 7 days
        endDate = new Date();
        groupBy = { 
          year: { $isoWeekYear: '$orderDate' },
          week: { $isoWeek: '$orderDate' }
        };
        format = 'MMM D, YYYY';
        break;
      default:
        // Default to monthly view of current year
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear() + 1, 0, 1);
        groupBy = { $month: '$orderDate' };
        format = 'MMM';
    }

    // Get sales data
    const salesData = await Order.aggregate([
      {
        $match: {
          status: 'Delivered',
          orderDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: groupBy,
          totalSales: { $sum: '$total' },
          orderCount: { $sum: 1 },
          date: { $first: '$orderDate' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Format the data for the chart
    let labels = [];
    const sales = [];
    const orders = [];

    salesData.forEach(item => {
      let label;
      if (period === 'year') {
        label = item._id.toString();
      } else if (period === 'month') {
        label = new Date(item._id.year, item._id.month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      } else if (period === 'week') {
        const date = new Date();
        date.setFullYear(item._id.year, 0, 1);
        date.setDate((item._id.week - 1) * 7);
        label = `Week ${item._id.week}, ${item._id.year}`;
      }
      
      labels.push(label);
      sales.push(item.totalSales);
      orders.push(item.orderCount);
    });

    res.json({
      success: true,
      data: {
        labels,
        sales,
        orders
      }
    });
  } catch (error) {
    console.error('Error fetching sales data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales data'
    });
  }
};

exports.getAdminHome = async(req, res) => {
  try {
    // Basic stats
    const totalOrders = await Order.countDocuments({});
    const revenueResult = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $group: { _id: null, totalRevenue: { $sum: '$total' } } }
    ]);
    
    const recentOrders = await Order.find({})
      .sort({ orderDate: -1 })
      .limit(5)
      .populate('userId')
      .lean();
      
    const newUsers = await User.find({ 
      createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) } 
    }).countDocuments();

    // Sales data for charts
    const { start: thirtyDaysAgo } = getDateRange('30days');
    
    // Monthly sales data for the current year
    const currentYear = new Date().getFullYear();
    const monthlySales = await Order.aggregate([
      {
        $match: {
          status: 'Delivered',
          orderDate: {
            $gte: new Date(`${currentYear}-01-01`),
            $lt: new Date(`${currentYear + 1}-01-01`)
          }
        }
      },
      {
        $group: {
          _id: { $month: '$orderDate' },
          totalSales: { $sum: '$total' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Top 10 best-selling products
    const bestSellingProducts = await Order.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.productName' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    // Best selling categories
    const bestSellingCategories = await Order.aggregate([
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: {
            categoryId: '$category._id',
            categoryName: '$category.name'
          },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 }
    ]);

    // Prepare data for charts
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const salesData = Array(12).fill(0);
    const orderCountData = Array(12).fill(0);
    
    monthlySales.forEach(sale => {
      salesData[sale._id - 1] = sale.totalSales;
      orderCountData[sale._id - 1] = sale.orderCount;
    });

    res.render('admin/home', { 
      totalOrders, 
      revenues: revenueResult[0] ? revenueResult[0].totalRevenue : 0, 
      recentOrders, 
      newUsers,
      monthlySales: {
        labels: months,
        sales: salesData,
        orders: orderCountData
      },
      bestSellingProducts,
      bestSellingCategories,
      currentYear,
      error: null 
    });
  } catch(error) {
    console.error('Error loading admin home:', error);
    res.render('admin/home', { 
      totalOrders: 0, 
      revenues: 0, 
      recentOrders: [], 
      monthlySales: { labels: [], sales: [], orders: [] },
      bestSellingProducts: [],
      bestSellingCategories: [],
      currentYear: new Date().getFullYear(),
      error: 'Failed to load dashboard data' 
    });
  }
};

/////////
///user management
/////////


exports.getAdminUserManagement = async (req, res) => {
  try {
      const page = parseInt(req.query.page) || 1;
      const limit = 4;
      const skip = (page - 1) * limit;

      const totalUsers = await User.countDocuments();
      const users = await User.find({}).skip(skip).limit(limit);

      const totalPages = Math.ceil(totalUsers / limit);

      res.render('admin/userManagement', {
          users,
          currentPage: page,
          totalPages
      });
  } catch (error) {
      console.error(error);
      res.redirect('/admin/adminHome');
  }
};

exports.blockUser = async (req, res) => {
  try {
      const userId = req.params.id;
      const user = await User.findById(userId);

      if (!user) {
          return res.redirect('/admin/userManagement?error=User not found');
      }

      user.status = 'blocked';
      await user.save();

      res.redirect('/admin/userManagement?success=User blocked successfully');
  } catch (error) {
      console.error(error);
      res.redirect('/admin/userManagement?error=Failed to block user');
  }
};

exports.unblockUser = async (req, res) => {
  try {
      const userId = req.params.id;
      const user = await User.findByIdAndUpdate(userId, { status: 'active' });

      if (!user) {
          return res.status(404).send('User not found');
      }

      res.redirect('/admin/userManagement');
  } catch (error) {
      console.error(error);
      res.status(500).send('Error unblocking user');
  }
};

exports.toggleBlockUser = async (req, res) => {
  try {
      const userId = req.params.id;
      const user = await User.findById(userId);

      if (!user) {
          return res.status(404).send('User not found');
      }

      user.status = user.status === 'blocked' ? 'active' : 'blocked';
      await user.save();

      // If the user is blocked, destroy their session
      if (user.status === 'blocked' && req.sessionStore) {
          const destroySession = () => {
              return new Promise((resolve, reject) => {
                  req.sessionStore.all((err, sessions) => {
                      if (err) {
                          console.error('Error fetching sessions:', err);
                          return reject(err);
                      }
                      const sessionPromises = [];
                      Object.keys(sessions).forEach(sessionId => {
                          const session = sessions[sessionId];
                          if (session && session.userId === userId.toString()) {
                              sessionPromises.push(new Promise((res, rej) => {
                                  req.sessionStore.destroy(sessionId, err => {
                                      if (err) {
                                          console.error('Error destroying session:', err);
                                          rej(err);
                                      } else {
                                          res();
                                      }
                                  });
                              }));
                          }
                      });
                      Promise.all(sessionPromises)
                          .then(() => resolve())
                          .catch(reject);
                  });
              });
          };

          await destroySession();
      }

      res.redirect('/admin/userManagement?success=User status updated successfully');
  } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).send('Error updating user status');
  }
};




/////////////////////
//productcontroler
///////


//edit and add to same page functionality


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

exports.getCustomProductList  = (req,res) => {
  res.render('admin/custom-products')
}

//////////////////////////////////////
// Category Management
//////////////////////////////////////
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
    return res.status(400).json({ error: "Category name is required" });
  }

  try {
    // Convert input to lowercase for case-insensitive comparison
    const normalizedName = name.toLowerCase().trim();
    
    // Check if category exists (case-insensitive)
    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${normalizedName}$`, 'i') } 
    });

    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }
    
    const newCategory = new Category({
      name: name.trim(), // Store original name but trimmed
      description: description ? description.trim() : undefined,      
    });
    
    await newCategory.save();
    return res.status(201).json({ 
      message: "Category added successfully",
      category: newCategory 
    });
  } catch (error) {
    console.error("Error in addCategory:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getListCategory = async (req, res) => {
    try {
        const categoryId = req.query.id;
        console.log('getListCategory: Attempting to list categoryId=', categoryId, 'Session:', req.session);

        // Validate categoryId
        if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
            console.warn('Invalid or missing categoryId:', categoryId);
            return res.status(400).redirect('/admin/category?error=Invalid category ID');
        }

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            console.warn('Category not found for categoryId:', categoryId);
            return res.status(404).redirect('/admin/category?error=Category not found');
        }
        console.log('Category found:', category);

        // Check current isListed status
        if (category.isListed === true) {
            console.warn('Category already listed: categoryId=', categoryId);
            return res.status(400).redirect('/admin/category?error=Category already listed');
        }

        // Update isListed to true
        const result = await Category.updateOne(
            { _id: categoryId, isListed: false },
            { isListed: true }
        );

        console.log('Update result:', result);
        if (result.matchedCount === 0 || result.modifiedCount === 0) {
            console.warn('Failed to update categoryId:', categoryId, 'Result:', result);
            return res.status(400).redirect('/admin/category?error=Failed to update category status');
        }

        console.log('Category listed successfully: categoryId=', categoryId);
        res.redirect('/admin/category?success=Category listed successfully');
    } catch (error) {
        console.error('Error in getListCategory:', {
            message: error.message,
            stack: error.stack,
            categoryId: req.query.id
        });
        res.status(500).redirect('/admin/category?error=Failed to list category: ' + error.message);
    }
};

exports.getUnlistCategory = async (req, res) => {
    try {
        const categoryId = req.query.id;
        console.log('getUnlistCategory: Attempting to unlist categoryId=', categoryId);

        // Validate categoryId
        if (!categoryId) {
            console.warn('Missing categoryId in query');
            return res.status(400).redirect('/admin/category?error=Missing category ID');
        }
        if (!mongoose.isValidObjectId(categoryId)) {
            console.warn('Invalid categoryId:', categoryId);
            return res.status(400).redirect('/admin/category?error=Invalid category ID');
        }

        // Check if category exists
        const category = await Category.findById(categoryId);
        if (!category) {
            console.warn('Category not found for categoryId:', categoryId);
            return res.status(404).redirect('/admin/category?error=Category not found');
        }

        // Check current isListed status
        if (category.isListed === false) {
            console.warn('Category already unlisted: categoryId=', categoryId);
            return res.status(400).redirect('/admin/category?error=Category already unlisted');
        }

        // Update isListed to false
        const result = await Category.updateOne(
            { _id: categoryId, isListed: true }, // Ensure only listed categories are updated
            { isListed: false }
        );

        if (result.matchedCount === 0) {
            console.warn('No matching category found or already unlisted: categoryId=', categoryId);
            return res.status(400).redirect('/admin/category?error=Category not found or already unlisted');
        }
        if (result.modifiedCount === 0) {
            console.warn('No changes made to categoryId:', categoryId);
            return res.status(400).redirect('/admin/category?error=Failed to update category status');
        }

        console.log('Category unlisted successfully: categoryId=', categoryId);
        res.redirect('/admin/category?success=Category unlisted successfully');
    } catch (error) {
        console.error('Error in getUnlistCategory:', {
            message: error.message,
            stack: error.stack,
            categoryId: req.query.id
        });
        res.status(500).redirect('/admin/category?error=Failed to unlist category: ' + error.message);
    }
};

exports.getEditCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.query.id);
    res.render("admin/edit-category", { category });
  } catch (error) {
    res.redirect(("/admin/add-products?error=invalid+category+name"));
  }
};

exports.editCategory = async (req, res) => {
  try {
    const { categoryName, description } = req.body;
    if (await Category.findOne({ name: categoryName, _id: { $ne: req.params.id } })) {
      return res.status(400).json({ error: "Category already exists" });
    }

    const updatedCategory = await Category.findByIdAndUpdate(req.params.id, { name: categoryName, description }, { new: true });
    res.json({ message: "Category updated successfully", category: updatedCategory });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    await Product.deleteMany({ category: req.params.id });
    await Category.findByIdAndDelete(req.params.id);
    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};
  



/////////////////////
// Order Management
/////////////////////

// List Orders with search, sort, filter, pagination
exports.getOrderManagement = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const sort = req.query.sort || 'desc';

    const query = {};
    if (search) {
      query.orderID = { $regex: search, $options: 'i' };
    }
    if (status) {
      query.status = status;
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    const sortOption = sort === 'asc'
      ? { orderDate: 1 }
      : { orderDate: -1 };

    const orders = await Order.find(query)
      .populate('userId')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.render('admin/order', {
      orders,
      currentPage: page,
      totalPages,
      search,
      status,
      sort,
      limit,
      totalOrders,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).render('admin/orderManagement', {
      orders: [],
      currentPage: 1,
      totalPages: 0,
      search: '',
      status: '',
      sort: 'desc',
      limit: 8,
      totalOrders: 0,
      error: 'Failed to load orders'
    });
  }
};

// View Order Details
exports.getOrderDetail = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId)
      .populate('userId')
      .lean();
    if (!order) {
      return res.status(404).render('admin/orderDetail', { error: 'Order not found', order: null });
    }
    res.render('admin/orderDetail', { order, error: null });
  } catch (error) {
    console.error('Error fetching order detail:', error);
    res.status(500).render('admin/orderDetail', { order: null, error: 'Failed to load order detail' });
  }
};

// Change Item Status
exports.changeItemStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const itemId = req.params.itemId;
    const { status } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }

    // Check if item status can be changed
    if (item.status === 'Canceled' || item.status === 'Delivered' || item.status === 'Returned') {
      return res.status(400).json({ success: false, message: `Cannot change status of ${item.status.toLowerCase()} items` });
    }

    // Define valid status transitions
    const validTransitions = {
      'Pending': ['Pending', 'Shipped', 'Canceled'],
      'Shipped': ['Shipped', 'Out for Delivery'],
      'Out for Delivery': ['Out for Delivery', 'Delivered'],
      'Return Requested': ['Return Requested'] // Can only be changed through return verification
    };

    const allowedStatuses = validTransitions[item.status] || [];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Cannot change status from ${item.status} to ${status}` });
    }

    item.status = status;
    order.updatedAt = new Date();

    // Recompute order.status based on items' statuses
    const items = order.items;
    const allCanceled = items.every(i => i.status === 'Canceled');
    const allDelivered = items.every(i => i.status === 'Delivered');
    const anyReturnRequested = items.some(i => i.status === 'Return Requested');
    const anyOutForDelivery = items.some(i => i.status === 'Out for Delivery');
    const anyShipped = items.some(i => i.status === 'Shipped');
    const anyPending = items.some(i => i.status === 'Pending');

    if (anyReturnRequested) order.status = 'Return Requested';
    else if (allDelivered) order.status = 'Delivered';
    else if (allCanceled) order.status = 'Canceled';
    else if (anyOutForDelivery) order.status = 'Out for Delivery';
    else if (anyShipped) order.status = 'Shipped';
    else if (anyPending) order.status = 'Pending';

    await order.save();

    res.json({ success: true, message: 'Item status updated successfully', orderStatus: order.status });
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ success: false, message: 'Failed to update item status' });
  }
};

// Verify Item Return Request
exports.verifyItemReturnRequest = async (req, res) => {
  try {
    const orderId = req.params.id;
    const itemId = req.params.itemId;
    const { action, rejectionReason } = req.body; // 'accept' or 'reject'

    const order = await Order.findById(orderId).populate('userId');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }

    if (item.status !== 'Return Requested') {
      return res.status(400).json({ success: false, message: 'No return request for this item' });
    }

    if (action === 'accept') {
      // Calculate refund amount for this specific item
      const itemRefundAmount = item.quantity * item.price;

      // Update item status
      item.status = 'Returned';
      order.updatedAt = new Date();

      // Process wallet refund
      const Wallet = require('../../models/wallet.model');
      let wallet = await Wallet.findOne({ userId: order.userId._id });

      if (!wallet) {
        wallet = new Wallet({
          userId: order.userId._id,
          balance: 0,
          transactions: []
        });
      }

      // Add refund to wallet
      wallet.balance += itemRefundAmount;
      wallet.transactions.push({
        type: 'credit',
        amount: itemRefundAmount,
        description: `Refund for returned item: ${item.productName} (Order: ${order.orderID})`,
        date: new Date()
      });

      await wallet.save();
      await order.save();

      return res.json({
        success: true,
        message: `Return accepted successfully. ₹${itemRefundAmount.toFixed(2)} has been refunded to customer's wallet.`
      });

    } else if (action === 'reject') {
      item.status = 'Delivered';
      item.rejectionReason = rejectionReason || 'Return request rejected by admin';
      order.updatedAt = new Date();
      await order.save();

      return res.json({
        success: true,
        message: 'Return request rejected successfully'
      });

    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Error verifying item return request:', error);
    res.status(500).json({ success: false, message: 'Failed to verify item return request' });
  }
};

// Change Order Status
exports.changeOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check if order status can be changed
    if (order.status === 'Canceled' || order.status === 'Delivered' || order.status === 'Returned') {
      return res.status(400).json({ success: false, message: `Cannot change status of ${order.status.toLowerCase()} orders` });
    }

    // Define valid status transitions
    const validTransitions = {
      'Pending': ['Pending', 'Shipped', 'Canceled'],
      'Shipped': ['Shipped', 'Out for Delivery'],
      'Out for Delivery': ['Out for Delivery', 'Delivered'],
      'Return Requested': ['Return Requested'] // Can only be changed through return verification
    };

    const allowedStatuses = validTransitions[order.status] || [];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Cannot change status from ${order.status} to ${status}` });
    }

    order.status = status;
    order.updatedAt = new Date();

    // Cascade order status to items where appropriate
    const terminal = new Set(['Delivered', 'Returned', 'Canceled']);
    const mapStatusToItem = s => {
      switch (s) {
        case 'Pending': return 'Pending';
        case 'Shipped': return 'Shipped';
        case 'Out for Delivery': return 'Out for Delivery';
        case 'Delivered': return 'Delivered';
        case 'Canceled': return 'Canceled';
        default: return null;
      }
    };

    const targetItemStatus = mapStatusToItem(status);
    if (targetItemStatus) {
      order.items.forEach(it => {
        if (!terminal.has(it.status)) {
          it.status = targetItemStatus;
        }
      });
    }

    await order.save();

    res.json({ success: true, message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
};

// Verify Return Request and Refund to Wallet
exports.verifyReturnRequest = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { action, rejectionReason } = req.body; // 'accept' or 'reject'
    const order = await Order.findById(orderId).populate('userId');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.status !== 'Return Requested') {
      return res.status(400).json({ success: false, message: 'No return request for this order' });
    }
    if (action === 'accept') {
      // Refund to wallet
      let wallet = await Wallet.findOne({ userId: order.userId._id });
      if (!wallet) {
        wallet = new Wallet({ userId: order.userId._id, balance: 0, transactions: [] });
      }
      wallet.balance += order.total;
      wallet.transactions.push({
        type: 'credit',
        amount: order.total,
        description: `Refund for order ${order.orderID}`,
        date: new Date()
      });
      await wallet.save();
      order.status = 'Returned';
      order.updatedAt = new Date();
      await order.save();
      return res.json({ success: true, message: `Return verified and ₹${order.total.toFixed(2)} refunded to wallet` });
    } else if (action === 'reject') {
      order.status = 'Delivered';
      order.rejectionReason = rejectionReason || 'Return request rejected by admin';
      order.updatedAt = new Date();
      await order.save();
      return res.json({ success: true, message: 'Return request rejected successfully' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Error verifying return request:', error);
    res.status(500).json({ success: false, message: 'Failed to verify return request' });
  }
};


exports.handleLogout = (req,res) =>{
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.redirect('/admin/adminHome');
    }
    res.clearCookie('connect.sid');
    res.redirect('/admin/adminLogin');
  });
}

// Inventory Management
exports.getInventoryManagement = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const status = req.query.status || '';
    const stockLevel = req.query.stockLevel || '';

    // Build query
    const query = {};
    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }
    if (category) {
      query.category = category;
    }
    if (status) {
      query.status = status;
    }
    if (stockLevel) {
      if (stockLevel === 'low') {
        query.quantity = { $lte: 10 };
      } else if (stockLevel === 'out') {
        query.quantity = 0;
      } else if (stockLevel === 'high') {
        query.quantity = { $gte: 50 };
      }
    }

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(query)
      .populate('category')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Get categories for filter
    const categories = await Category.find({ isListed: true });

    // Calculate inventory statistics
    const inventoryStats = await Product.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalStock: { $sum: '$quantity' },
          lowStockCount: {
            $sum: { $cond: [{ $lte: ['$quantity', 10] }, 1, 0] }
          },
          outOfStockCount: {
            $sum: { $cond: [{ $eq: ['$quantity', 0] }, 1, 0] }
          },
          totalValue: { $sum: { $multiply: ['$quantity', '$salePrice'] } }
        }
      }
    ]);

    const stats = inventoryStats[0] || {
      totalProducts: 0,
      totalStock: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      totalValue: 0
    };

    res.render('admin/inventory', {
      products,
      categories,
      currentPage: page,
      totalPages,
      totalProducts,
      search,
      category,
      status,
      stockLevel,
      stats
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.redirect('/admin/adminHome');
  }
};

// Update Stock Quantity
exports.updateStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, action } = req.body; // action: 'set', 'add', 'subtract'

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let newQuantity;
    switch (action) {
      case 'set':
        newQuantity = parseInt(quantity);
        break;
      case 'add':
        newQuantity = product.quantity + parseInt(quantity);
        break;
      case 'subtract':
        newQuantity = Math.max(0, product.quantity - parseInt(quantity));
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    // Update product status based on quantity
    let status = product.status;
    if (newQuantity === 0) {
      status = 'Out of Stock';
    } else if (newQuantity > 0 && product.status === 'Out of Stock') {
      status = 'Available';
    }

    product.quantity = newQuantity;
    product.status = status;
    product.updatedAt = new Date();
    await product.save();

    // Log stock update for monitoring
    console.log(`Stock updated for product ${product.productName}: ${newQuantity} units, status: ${status}`);

    res.json({
      success: true,
      message: 'Stock updated successfully',
      newQuantity,
      newStatus: status,
      productId: product._id,
      productName: product.productName
    });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
};

// Bulk Stock Update
exports.bulkUpdateStock = async (req, res) => {
  try {
    const { updates } = req.body; // Array of {productId, quantity, action}

    const results = [];
    for (const update of updates) {
      try {
        const product = await Product.findById(update.productId);
        if (!product) {
          results.push({ productId: update.productId, success: false, error: 'Product not found' });
          continue;
        }

        let newQuantity;
        switch (update.action) {
          case 'set':
            newQuantity = parseInt(update.quantity);
            break;
          case 'add':
            newQuantity = product.quantity + parseInt(update.quantity);
            break;
          case 'subtract':
            newQuantity = Math.max(0, product.quantity - parseInt(update.quantity));
            break;
          default:
            results.push({ productId: update.productId, success: false, error: 'Invalid action' });
            continue;
        }

        // Update product status based on quantity
        let status = product.status;
        if (newQuantity === 0) {
          status = 'Out of Stock';
        } else if (newQuantity > 0 && product.status === 'Out of Stock') {
          status = 'Available';
        }

        product.quantity = newQuantity;
        product.status = status;
        product.updatedAt = new Date();
        await product.save();

        results.push({
          productId: update.productId,
          success: true,
          newQuantity,
          newStatus: status
        });
      } catch (error) {
        results.push({ productId: update.productId, success: false, error: error.message });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error bulk updating stock:', error);
    res.status(500).json({ error: 'Failed to bulk update stock' });
  }
};

exports.getOfferManagement = async (req, res) => {
  try {
    const offers = await Offer.find({})
      .populate('applicableProducts', 'productName')
      .populate('applicableCategories', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const categories = await Category.find({ isListed: true }).select('name').lean();
    const products = await Product.find({ isBlocked: false }).select('productName').lean();

    res.render('admin/offer', { offers, categories, products });
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.redirect('/admin/adminHome');
  }
};

// Add new offer
exports.addOffer = async (req, res) => {
  try {
    const {
      code, discountType, discountNumber, maxDiscount, minPurchase,
      startDate, endDate, usageLimit, isActive, applicableType,
      applicableProducts, applicableCategories
    } = req.body;

    // Validate required fields
    if (!code || !discountType || !discountNumber || !maxDiscount || !minPurchase || !startDate || !endDate || !usageLimit) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check if offer code already exists
    const existingOffer = await Offer.findOne({ code: code.toUpperCase() });
    if (existingOffer) {
      return res.status(400).json({ success: false, message: 'Offer code already exists' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (start >= end) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    if (end <= now) {
      return res.status(400).json({ success: false, message: 'End date must be in the future' });
    }

    // Validate discount values
    if (discountType === 'percentage' && (discountNumber <= 0 || discountNumber > 100)) {
      return res.status(400).json({ success: false, message: 'Percentage discount must be between 1 and 100' });
    }

    if (discountType === 'amount' && discountNumber <= 0) {
      return res.status(400).json({ success: false, message: 'Amount discount must be greater than 0' });
    }

    if (maxDiscount <= 0 || minPurchase < 0 || usageLimit <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid values for max discount, min purchase, or usage limit' });
    }

    // Process applicable items based on type
    let processedProducts = [];
    let processedCategories = [];

    if (applicableType === 'products' && applicableProducts) {
      processedProducts = Array.isArray(applicableProducts) ? applicableProducts : [applicableProducts];
    } else if (applicableType === 'categories' && applicableCategories) {
      processedCategories = Array.isArray(applicableCategories) ? applicableCategories : [applicableCategories];
    }

    // Create new offer
    const newOffer = new Offer({
      code: code.toUpperCase(),
      discountType,
      discountNumber: parseFloat(discountNumber),
      maxDiscount: parseFloat(maxDiscount),
      minPurchase: parseFloat(minPurchase),
      startDate: start,
      endDate: end,
      usageLimit: parseInt(usageLimit),
      isActive: isActive === 'on' || isActive === true,
      isBlocked: false,
      applicableType: applicableType || 'all',
      applicableProducts: processedProducts,
      applicableCategories: processedCategories,
      usedBy: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newOffer.save();
    res.status(200).json({ success: true, message: 'Offer added successfully' });

  } catch (error) {
    console.error('Error adding offer:', error);
    res.status(500).json({ success: false, message: 'Failed to add offer' });
  }
};

// Get offer details for editing
exports.getOfferDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const offer = await Offer.findById(id);

    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    res.status(200).json({ success: true, offer });
  } catch (error) {
    console.error('Error fetching offer details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch offer details' });
  }
};

// Update offer
exports.updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, discountType, discountNumber, maxDiscount, minPurchase, startDate, endDate, usageLimit, isActive } = req.body;

    // Find the offer
    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    // Validate required fields
    if (!code || !discountType || !discountNumber || !maxDiscount || !minPurchase || !startDate || !endDate || !usageLimit) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check if offer code already exists (excluding current offer)
    const existingOffer = await Offer.findOne({ code: code.toUpperCase(), _id: { $ne: id } });
    if (existingOffer) {
      return res.status(400).json({ success: false, message: 'Offer code already exists' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    // Validate discount values
    if (discountType === 'percentage' && (discountNumber <= 0 || discountNumber > 100)) {
      return res.status(400).json({ success: false, message: 'Percentage discount must be between 1 and 100' });
    }

    if (discountType === 'amount' && discountNumber <= 0) {
      return res.status(400).json({ success: false, message: 'Amount discount must be greater than 0' });
    }

    if (maxDiscount <= 0 || minPurchase < 0 || usageLimit <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid values for max discount, min purchase, or usage limit' });
    }

    // Update offer
    offer.code = code.toUpperCase();
    offer.discountType = discountType;
    offer.discountNumber = parseFloat(discountNumber);
    offer.maxDiscount = parseFloat(maxDiscount);
    offer.minPurchase = parseFloat(minPurchase);
    offer.startDate = start;
    offer.endDate = end;
    offer.usageLimit = parseInt(usageLimit);
    offer.isActive = isActive === 'on' || isActive === true;
    offer.updatedAt = new Date();

    await offer.save();
    res.status(200).json({ success: true, message: 'Offer updated successfully' });

  } catch (error) {
    console.error('Error updating offer:', error);
    res.status(500).json({ success: false, message: 'Failed to update offer' });
  }
};

// Delete offer
exports.deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    // Check if offer has been used
    if (offer.usedBy && offer.usedBy.length > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete offer that has been used by customers' });
    }

    await Offer.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Offer deleted successfully' });

  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({ success: false, message: 'Failed to delete offer' });
  }
};

// Toggle offer status (block/unblock)
exports.toggleOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    offer.isBlocked = !offer.isBlocked;
    offer.updatedAt = new Date();
    await offer.save();

    const status = offer.isBlocked ? 'blocked' : 'unblocked';
    res.status(200).json({ success: true, message: `Offer ${status} successfully` });

  } catch (error) {
    console.error('Error toggling offer status:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle offer status' });
  }
};

// Validate and apply offer (for checkout) - Updated to use coupon system
exports.validateAndApplyOffer = async (offerCode, userId, cartItems) => {
  try {
    // Use the new coupon validation system
    return await validateAndApplyCoupon(offerCode, userId, cartItems);
  } catch (error) {
    console.error('Error validating offer:', error);
    return { success: false, message: 'Failed to validate offer' };
  }
};



exports.sampleView = async (req,res) =>{
  res.render('sample')
}