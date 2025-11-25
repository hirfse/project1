const Order = require('../../models/order.model');

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