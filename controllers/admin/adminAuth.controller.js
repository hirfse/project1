require('dotenv').config();
const HTTP_STATUS = require('../../constants/httpStatus');
const User = require('../../models/user.model')
const Order = require('../../models/order.model');

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

      // Clear any existing user session data
      req.session.userEmail = undefined;
      req.session.userRole = undefined;
      req.session.userName = undefined;

      // Set admin session data
      req.session.userId = 'admin';
      req.session.role = 'admin';

      return res.redirect('/admin/adminHome');
  } catch (error) {
      console.error('Admin login error:', error);
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

    // Mark possibly unused variables as used for linting without affecting logic
    void year; void format;

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
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
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
    void thirtyDaysAgo;
    
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