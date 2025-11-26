const Order = require('../models/order.model');
const Wallet = require('../models/wallet.model');

async function listOrders({ page = 1, limit = 8, search = '', status = '', sort = 'desc' }) {
  const query = {};
  if (search) query.orderID = { $regex: search, $options: 'i' };
  if (status) query.status = status;
  const totalOrders = await Order.countDocuments(query);
  const totalPages = Math.ceil(totalOrders / limit);
  const sortOption = sort === 'asc' ? { orderDate: 1 } : { orderDate: -1 };
  const orders = await Order.find(query).populate('userId').sort(sortOption).skip((page - 1) * limit).limit(limit).lean();
  return { orders, totalOrders, totalPages };
}

async function getOrder(orderId) {
  return Order.findById(orderId).populate('userId').lean();
}

function validItemTransitions(status) {
  return {
    'Pending': ['Pending', 'Shipped', 'Canceled'],
    'Shipped': ['Shipped', 'Out for Delivery'],
    'Out for Delivery': ['Out for Delivery', 'Delivered'],
    'Return Requested': ['Return Requested'],
  }[status] || [];
}

async function changeItemStatus(orderId, itemId, status) {
  const order = await Order.findById(orderId);
  if (!order) return { success: false, message: 'Order not found' };
  const item = order.items.id(itemId);
  if (!item) return { success: false, message: 'Item not found in order' };
  if (['Canceled', 'Delivered', 'Returned'].includes(item.status)) {
    return { success: false, message: `Cannot change status of ${item.status.toLowerCase()} items` };
  }
  const allowed = validItemTransitions(item.status);
  if (!allowed.includes(status)) {
    return { success: false, message: `Cannot change status from ${item.status} to ${status}` };
  }
  item.status = status;
  order.updatedAt = new Date();
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
  return { success: true, message: 'Item status updated successfully', orderStatus: order.status };
}

async function verifyItemReturnRequest(orderId, itemId, action, rejectionReason) {
  const order = await Order.findById(orderId).populate('userId');
  if (!order) return { success: false, message: 'Order not found' };
  const item = order.items.id(itemId);
  if (!item) return { success: false, message: 'Item not found in order' };
  if (item.status !== 'Return Requested') return { success: false, message: 'No return request for this item' };

  if (action === 'accept') {
    const itemRefundAmount = item.quantity * item.price;
    item.status = 'Returned';
    order.updatedAt = new Date();
    let wallet = await Wallet.findOne({ userId: order.userId._id });
    if (!wallet) wallet = new Wallet({ userId: order.userId._id, balance: 0, transactions: [] });
    wallet.balance += itemRefundAmount;
    wallet.transactions.push({ type: 'credit', amount: itemRefundAmount, description: `Refund for returned item: ${item.productName} (Order: ${order.orderID})`, date: new Date() });
    await wallet.save();
    await order.save();
    return { success: true, message: `Return accepted successfully. ₹${itemRefundAmount.toFixed(2)} has been refunded to customer's wallet.` };
  } else if (action === 'reject') {
    item.status = 'Delivered';
    item.rejectionReason = rejectionReason || 'Return request rejected by admin';
    order.updatedAt = new Date();
    await order.save();
    return { success: true, message: 'Return request rejected successfully' };
  }
  return { success: false, message: 'Invalid action' };
}

function validOrderTransitions(status) {
  return {
    'Pending': ['Pending', 'Shipped', 'Canceled'],
    'Shipped': ['Shipped', 'Out for Delivery'],
    'Out for Delivery': ['Out for Delivery', 'Delivered'],
    'Return Requested': ['Return Requested']
  }[status] || [];
}

async function changeOrderStatus(orderId, status) {
  const order = await Order.findById(orderId);
  if (!order) return { success: false, message: 'Order not found' };
  if (['Canceled', 'Delivered', 'Returned'].includes(order.status)) {
    return { success: false, message: `Cannot change status of ${order.status.toLowerCase()} orders` };
  }
  const allowed = validOrderTransitions(order.status);
  if (!allowed.includes(status)) return { success: false, message: `Cannot change status from ${order.status} to ${status}` };
  order.status = status;
  order.updatedAt = new Date();
  const terminal = new Set(['Delivered', 'Returned', 'Canceled']);
  const mapStatusToItem = s => ({ 'Pending': 'Pending', 'Shipped': 'Shipped', 'Out for Delivery': 'Out for Delivery', 'Delivered': 'Delivered', 'Canceled': 'Canceled' }[s] || null);
  const targetItemStatus = mapStatusToItem(status);
  if (targetItemStatus) {
    order.items.forEach(it => { if (!terminal.has(it.status)) it.status = targetItemStatus; });
  }
  await order.save();
  return { success: true, message: 'Order status updated successfully' };
}

async function verifyReturnRequest(orderId, action, rejectionReason) {
  const order = await Order.findById(orderId).populate('userId');
  if (!order) return { success: false, message: 'Order not found' };
  if (order.status !== 'Return Requested') return { success: false, message: 'No return request for this order' };
  if (action === 'accept') {
    let wallet = await Wallet.findOne({ userId: order.userId._id });
    if (!wallet) wallet = new Wallet({ userId: order.userId._id, balance: 0, transactions: [] });
    wallet.balance += order.total;
    wallet.transactions.push({ type: 'credit', amount: order.total, description: `Refund for order ${order.orderID}`, date: new Date() });
    await wallet.save();
    order.status = 'Returned';
    order.updatedAt = new Date();
    await order.save();
    return { success: true, message: `Return verified and ₹${order.total.toFixed(2)} refunded to wallet` };
  } else if (action === 'reject') {
    order.status = 'Delivered';
    order.rejectionReason = rejectionReason || 'Return request rejected by admin';
    order.updatedAt = new Date();
    await order.save();
    return { success: true, message: 'Return request rejected successfully' };
  }
  return { success: false, message: 'Invalid action' };
}

module.exports = {
  listOrders,
  getOrder,
  changeItemStatus,
  verifyItemReturnRequest,
  changeOrderStatus,
  verifyReturnRequest,
};
