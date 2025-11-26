const Order = require('../../models/order.model');
const Wallet = require('../../models/wallet.model');
const adminOrderService = require('../../services/adminOrderService');

// List Orders with search, sort, filter, pagination
exports.getOrderManagement = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const sort = req.query.sort || 'desc';

    const { orders, totalOrders, totalPages } = await adminOrderService.listOrders({ page, limit, search, status, sort });

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
    const order = await adminOrderService.getOrder(orderId);
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
    const result = await adminOrderService.changeItemStatus(orderId, itemId, status);
    if (!result.success) return res.status(400).json(result.message ? result : { success: false, message: 'Failed to update item status' });
    res.json(result);
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
    const result = await adminOrderService.verifyItemReturnRequest(orderId, itemId, action, rejectionReason);
    const status = result.success ? 200 : (result.message === 'Order not found' || result.message === 'Item not found in order' ? 404 : 400);
    return res.status(status).json(result);
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
    const result = await adminOrderService.changeOrderStatus(orderId, status);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
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
    const result = await adminOrderService.verifyReturnRequest(orderId, action, rejectionReason);
    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('Error verifying return request:', error);
    res.status(500).json({ success: false, message: 'Failed to verify return request' });
  }
};