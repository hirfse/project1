const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Address = require('../models/address.model');
const Cart = require('../models/cart.model');
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const Wallet = require('../models/wallet.model');
const ReferralOffer = require('../models/referralOffer.model');
const mongoose = require('mongoose');
const { processWalletRefund } = require('../controllers/user/wallet.controller');
const logger = require('../config/logger');

// Order ID generator
const generateOrderID = () => {
    const prefix = 'ORD';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${timestamp}-${random}`;
};

// Start Helper: Process Razorpay Refund
// Note: This needs global.razorpayInstance which is set in index.js
async function processRazorpayRefund(order, amount) {
    try {
        if (!order.razorpayPaymentId) {
            logger.error('No Razorpay payment ID found for order:', { orderId: order._id });
            return { success: false, message: 'No payment reference found for refund' };
        }
        const amountInPaise = Math.round(amount * 100);
        const refund = await global.razorpayInstance.payments.refund(
            order.razorpayPaymentId,
            { amount: amountInPaise }
        );
        logger.info('Razorpay refund successful:', { refundId: refund.id });
        return { success: true, message: 'Refund processed successfully', refundId: refund.id };
    } catch (error) {
        logger.error('Error processing Razorpay refund:', { error: error.message });
        return { success: false, message: error.description || 'Failed to process Razorpay refund', error: error.error };
    }
}
// End Helper

exports.cancelOrderService = async (orderId, userId, cancelReason) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            throw new Error('Invalid order ID');
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            throw new Error('Order not found');
        }

        if (order.status !== 'Pending' && order.status !== 'Confirmed') {
            throw new Error('Order cannot be canceled');
        }

        // Restore stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { quantity: item.quantity },
                $set: { status: 'Available' } // Simplification, ideally check quantity > 0
            });
        }

        let refundMessage = 'Order canceled successfully';
        if (order.paymentMethod === 'razorpay' && order.razorpayPaymentId) {
            const refundResult = await processRazorpayRefund(order, order.total);
            if (refundResult.success) {
                refundMessage += `. Refund ID: ${refundResult.refundId}`;
            } else {
                await processWalletRefund(userId, order.total, `Refund for canceled order #${order.orderID} (Razorpay failed)`);
                refundMessage += `. Refunded to wallet.`;
            }
        } else if (['wallet', 'cod', 'razorpay'].includes(order.paymentMethod)) {
            // For COD, only refund if status was not pending/failed? COD usually means not paid yet unless delivered.
            // Wait, if COD and canceled before delivery, no refund needed.
            if (order.paymentMethod !== 'cod') {
                await processWalletRefund(userId, order.total, `Refund for canceled order #${order.orderID}`);
                refundMessage += `. Refunded to wallet.`;
            }
        }

        order.status = 'Canceled';
        order.cancelReason = cancelReason || 'No reason provided';
        order.updatedAt = new Date();
        await order.save();

        return { success: true, message: refundMessage };

    } catch (error) {
        throw error;
    }
};

exports.returnOrderService = async (orderId, userId, returnReason) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            throw new Error('Invalid order ID');
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            throw new Error('Order not found');
        }

        if (order.status !== 'Delivered') {
            throw new Error('Only delivered orders can be returned');
        }

        order.status = 'Return Requested';
        order.returnReason = returnReason;
        order.updatedAt = new Date();
        await order.save();

        return { success: true, message: 'Return request submitted successfully' };
    } catch (error) {
        throw error;
    }
};

exports.cancelOrderItemService = async (orderId, itemId, userId, cancelReason) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
            throw new Error('Invalid order or item ID');
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) throw new Error('Order not found');

        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) throw new Error('Item not found in order');

        const item = order.items[itemIndex];

        // Restore stock
        await Product.findByIdAndUpdate(item.productId, {
            $inc: { quantity: item.quantity },
            $set: { status: 'Available' }
        });

        const itemRefundAmount = item.price * item.quantity;

        // Update totals
        order.subtotal -= itemRefundAmount;
        order.tax = order.subtotal * 0.05;
        order.total = order.subtotal + order.tax + order.shipping - (order.discount || 0);

        let refundMessage = 'Order item canceled successfully';

        if (order.paymentMethod === 'razorpay' && order.razorpayPaymentId) {
            const refundResult = await processRazorpayRefund(order, itemRefundAmount);
            if (refundResult.success) {
                refundMessage += `. Refund ID: ${refundResult.refundId}`;
            } else {
                await processWalletRefund(userId, itemRefundAmount, `Refund for canceled item #${itemId} (Razorpay failed)`);
                refundMessage += `. Refunded to wallet.`;
            }
        } else if (order.paymentMethod !== 'cod') {
            await processWalletRefund(userId, itemRefundAmount, `Refund for canceled item #${itemId} from order #${order.orderID}`);
            refundMessage += `. Refunded to wallet.`;
        }

        item.status = 'Canceled';
        item.cancelReason = cancelReason || 'No reason provided';
        order.items[itemIndex] = item;

        const allCanceled = order.items.every(i => i.status === 'Canceled');
        if (allCanceled) order.status = 'Canceled';

        order.updatedAt = new Date();
        await order.save();

        return { success: true, message: refundMessage };

    } catch (error) {
        throw error;
    }
};

exports.returnOrderItemService = async (orderId, itemId, userId, returnReason) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
            throw new Error('Invalid order or item ID');
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) throw new Error('Order not found');

        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) throw new Error('Item not found');

        const item = order.items[itemIndex];
        if (item.status !== 'Delivered') {
            throw new Error('Only delivered items can be returned');
        }

        item.status = 'Return Requested';
        item.returnReason = returnReason;
        order.items[itemIndex] = item;
        order.updatedAt = new Date();
        await order.save();

        return { success: true, message: 'Return request submitted successfully' };
    } catch (error) {
        throw error;
    }
};
