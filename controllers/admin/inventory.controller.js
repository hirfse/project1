const Product = require("../../models/product.model");
const Category = require("../../models/category.model");


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
