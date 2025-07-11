require('dotenv').config()
const User = require('../../models/user.model')
const Product = require("../../models/product.model");
const Category = require("../../models/category.model");
const Order = require('../../models/order.model');
const Wallet = require('../../models/wallet.model');
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

      req.session.userId = 'admin';
      req.session.role = 'admin';

      return res.redirect('/admin/adminHome');
  } catch (error) {
      res.render('admin/login', { error: 'Server Error' });
  }
};

exports.getAdminHome = (req, res) => {
  res.render('admin/home', { error: null });
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
      ...(statusFilter && { status: statusFilter }),
    };

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(query)
      .populate('category')
      .sort(sortCriteria)
      .skip((page - 1) * limit)
      .limit(limit);

    const categories = await Category.find({ isListed: true });

    const buildPaginationLink = (page) => {
      const params = new URLSearchParams({
        page,
        search,
        category: selectedCategory,
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
  try {
    const { productName, description, category, regularPrice, salePrice, quantity } = req.body;

    // Validation
    if (!productName || !productName.trim()) {
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

    const images = req.files.map(file => file.filename);

    const product = new Product({
      productName,
      description,
      category: categoryDoc._id,
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

exports.editProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { productName, description, regularPrice, salePrice, quantity, category, status, deleteImages } = req.body;

    // Validation
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    if (!productName || !productName.trim()) {
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
    if (!['Available', 'Out of Stock'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Handle image deletions
    let images = [...product.productImage];
    if (deleteImages) {
      const imagesToDelete = Array.isArray(deleteImages) ? deleteImages : [deleteImages];
      images = images.filter(img => !imagesToDelete.includes(img));
    }

    // Handle new images
    ['image1', 'image2', 'image3', 'image4'].forEach((field, index) => {
      if (req.files[field]) {
        images[index] = req.files[field][0].filename;
      }
    });

    // Update product
    product.productName = productName;
    product.description = description;
    product.regularPrice = parseFloat(regularPrice);
    product.salePrice = parseFloat(salePrice);
    product.quantity = parseInt(quantity);
    product.category = category;
    product.status = status;
    product.productImage = images;

    await product.save();
    res.status(200).json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error editing product:', error);
    res.status(500).json({ error: 'Failed to edit product' });
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

    res.render('admin/orderManagement', {
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

// Change Order Status
exports.changeOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if order status can be changed
    if (order.status === 'Canceled' || order.status === 'Delivered' || order.status === 'Returned') {
      return res.status(400).json({ error: `Cannot change status of ${order.status.toLowerCase()} orders` });
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
      return res.status(400).json({ error: `Cannot change status from ${order.status} to ${status}` });
    }

    order.status = status;
    order.updatedAt = new Date();
    await order.save();

    res.json({ message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
};

// Verify Return Request and Refund to Wallet
exports.verifyReturnRequest = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { action, rejectionReason } = req.body; // 'accept' or 'reject'
    const order = await Order.findById(orderId).populate('userId');
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.status !== 'Return Requested') {
      return res.status(400).json({ error: 'No return request for this order' });
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
      return res.json({ message: 'Return verified and amount refunded to wallet' });
    } else if (action === 'reject') {
      order.status = 'Delivered';
      order.rejectionReason = rejectionReason || 'Return request rejected by admin';
      order.updatedAt = new Date();
      await order.save();
      return res.json({ message: 'Return request rejected' });
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Error verifying return request:', error);
    res.status(500).json({ error: 'Failed to verify return request' });
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

    res.json({
      success: true,
      message: 'Stock updated successfully',
      newQuantity,
      newStatus: status
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