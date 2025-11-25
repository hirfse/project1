
const HTTP_STATUS = require('../../constants/httpStatus');
const MESSAGES = require('../../constants/messages');
const Order = require('../../models/order.model');
const Product = require('../../models/product.model');
const Address = require('../../models/address.model');
const Cart = require('../../models/cart.model');
const User = require('../../models/user.model');
const Category = require('../../models/category.model');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Offer = require('../../models/offer.model');
const AdminCouponController = require('../admin/coupon.controller');
const MAX_QUANTITY_PER_PRODUCT = 10;
const Wishlist = require('../../models/wishlist.model'); 


const ReferralOffer = require('../../models/referralOffer.model');
const Wallet = require('../../models/wallet.model');
const Coupon = require('../../models/coupon.model');

// Order ID generator
const generateOrderID = () => {
  const prefix = 'ORD';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${timestamp}-${random}`;
};

exports.getCheckout = async (req, res) => {
    try {
        const userId = req.session.userId;
        const addressDoc = await Address.findOne({ userId });
        const categories = await Category.find({ isListed: true });
        const isBuyNow = req.query.buyNow === 'true' || req.session.buyNowProduct;

        // Initialize default values
        let addresses = addressDoc ? addressDoc.address : [];
        let selectedAddress = null;
        let subtotal = 0;
        let tax = 0;
        let shipping = 50; // Flat shipping rate
        let discount = 0;
        let total = 0;
        let checkoutItems = [];

        // Ensure one address is default
        if (addresses.length > 0) {
            selectedAddress = addresses.find(addr => addr.isDefault) || addresses[0];
            if (!selectedAddress.isDefault) {
                selectedAddress.isDefault = true;
                await Address.updateOne(
                    { userId, 'address._id': selectedAddress._id },
                    { $set: { 'address.$.isDefault': true } }
                );
            }
        }

        // Handle Buy Now vs Regular Cart
        if (isBuyNow && req.session.buyNowProduct) {
            // Buy Now: Use only the single product from session
            const buyNowData = req.session.buyNowProduct;
            const product = await Product.findById(buyNowData.productId).populate('category');

            if (product && !product.isBlocked && product.category.isListed &&
                product.quantity >= buyNowData.quantity && product.status !== 'Out of Stock') {

                checkoutItems = [{
                    productId: product,
                    quantity: buyNowData.quantity
                }];

                const itemTotal = buyNowData.quantity * product.salePrice;
                subtotal = itemTotal;

                // Apply product or category offer
                const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
                const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
                discount = Math.max(productDiscount, categoryDiscount);

                tax = subtotal * 0.05; // 5% tax

                // Apply offer discount if available
                let offerDiscount = 0;
                if (req.session.appliedOffer) {
                    offerDiscount = req.session.appliedOffer.discountAmount || 0;
                }

                total = subtotal + tax + shipping - discount - offerDiscount;
            }
        } else {
            // Regular Cart: Use cart items
            const cart = await Cart.findOne({ userId }).populate('items.productId');

            if (cart && cart.items.length > 0) {
                const validItems = [];
                for (const item of cart.items) {
                    const product = await Product.findById(item.productId).populate('category');
                    if (
                        product &&
                        !product.isBlocked &&
                        product.category.isListed &&
                        product.quantity >= item.quantity &&
                        product.status !== 'Out of Stock'
                    ) {
                        validItems.push({
                            ...item._doc,
                            isAvailable: item.quantity <= product.quantity,
                            maxStock: product.quantity
                        });
                        const itemTotal = item.quantity * product.salePrice;
                        subtotal += itemTotal;
                        // Apply product or category offer
                        const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
                        const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
                        discount += Math.max(productDiscount, categoryDiscount);
                    }
                }
                // Update cart if any items were invalid
                if (validItems.length !== cart.items.length) {
                    cart.items = validItems;
                    await cart.save();
                }
                checkoutItems = validItems;
                tax = subtotal * 0.05; // 5% tax

                // Apply offer discount if available
                let offerDiscount = 0;
                if (req.session.appliedOffer) {
                    offerDiscount = req.session.appliedOffer.discountAmount || 0;
                }

                total = subtotal + tax + shipping - discount - offerDiscount;
            }
        }

        // Get available offers for user
        const availableOffers = await getAvailableOffers(userId, checkoutItems);
        // Get available coupons for user
        const availableCoupons = await AdminCouponController.getAvailableCoupons(userId, checkoutItems);

        // Get user details for Razorpay
        const user = await User.findById(userId).select('email phone').lean();
        
        res.render('user/checkout', {
            addresses,
            selectedAddress,
            cart: { items: checkoutItems },
            userName: req.session.userName || null,
            userEmail: user?.email || '',
            userPhone: user?.phone || '',
            error: checkoutItems.length === 0 ? (isBuyNow ? 'Product not available for purchase' : 'Your cart is empty') : null,
            categories,
            subtotal,
            tax,
            shipping,
            discount,
            total,
            isBuyNow: isBuyNow,
            appliedOffer: req.session.appliedOffer || null,
            availableOffers: availableOffers,
            availableCoupons: availableCoupons
        });
    } catch (error) {
        console.error('Error fetching checkout page:', error);
        res.status(500).render('user/checkout', {
            addresses: [],
            selectedAddress: null,
            cart: { items: [] },
            userName: req.session.userName || null,
            error: 'Failed to load checkout page',
            categories: [],
            subtotal: 0,
            tax: 0,
            shipping: 0,
            discount: 0,
            total: 0,
            isBuyNow: false, 
            availableOffers: [], 
            availableCoupons: [] 
        });
    }
};

// Select Default Address
exports.selectAddress = async (req, res) => {
    try {
        const { selectedAddress, paymentMethod = 'razorpay' } = req.body;
        const userId = req.session.userId;

        if (!mongoose.Types.ObjectId.isValid(selectedAddress)) {
            return res.status(400).json({ success: false, message: 'Invalid address ID' });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ success: false, message: 'No addresses found' });
        }

        // Find the selected address
        const selectedAddr = addressDoc.address.id(selectedAddress);
        if (!selectedAddr) {
            return res.status(404).json({ success: false, message: 'Address not found' });
        }

        // Reset all addresses to non-default and set selected as default
        addressDoc.address.forEach(addr => (addr.isDefault = false));
        selectedAddr.isDefault = true;
        await addressDoc.save();

        // Store selected address in session
        req.session.selectedAddressId = selectedAddress;
        
        // Also store in checkoutData for the payment flow
        req.session.checkoutData = req.session.checkoutData || {};
        req.session.checkoutData.selectedAddress = selectedAddress;
        req.session.checkoutData.paymentMethod = paymentMethod;
        
        // Save the session
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.status(200).json({ 
            success: true, 
            message: 'Address selected successfully',
            address: selectedAddr
        });
    } catch (error) {
        console.error('Error selecting address:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to select address',
            error: error.message 
        });
    }
};


// Place Order (Placeholder - Implement as needed)
exports.placeOrder = async (req, res) => {
    try {
        const { selectedAddress, paymentMethod } = req.body;
        const userId = req.session.userId;

        // Store checkout data in session for Razorpay payments
        req.session.checkoutData = {
            selectedAddress,
            paymentMethod
        };

        // If payment method is Razorpay, redirect to payment gateway
        if (paymentMethod === 'razorpay') {
            return res.json({
                success: true,
                redirect: true,
                message: 'Redirecting to payment gateway'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(selectedAddress)) {
            return res.render('user/checkout', {
                addresses: [],
                selectedAddress: null,
                cart: { items: [] },
                userName: req.session.userName || null,
                error: 'Invalid address ID',
                categories: await Category.find({ isListed: true }),
                subtotal: 0,
                tax: 0,
                shipping: 0,
                discount: 0,
                total: 0
            });
        }

        if (paymentMethod !== 'cod') {
            return res.render('user/checkout', {
                addresses: [],
                selectedAddress: null,
                cart: { items: [] },
                userName: req.session.userName || null,
                error: 'Selected payment method is not available',
                categories: await Category.find({ isListed: true }),
                subtotal: 0,
                tax: 0,
                shipping: 0,
                discount: 0,
                total: 0
            });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc || !addressDoc.address.find(addr => addr._id.toString() === selectedAddress)) {
            return res.render('user/checkout', {
                addresses: [],
                selectedAddress: null,
                cart: { items: [] },
                userName: req.session.userName || null,
                error: 'Address not found',
                categories: await Category.find({ isListed: true }),
                subtotal: 0,
                tax: 0,
                shipping: 0,
                discount: 0,
                total: 0
            });
        }

        // Check if this is a buy now order or regular cart order
        const isBuyNow = req.session.buyNowProduct;
        let orderItems = [];

        if (isBuyNow) {
            // Buy Now: Use product from session
            const buyNowData = req.session.buyNowProduct;
            const product = await Product.findById(buyNowData.productId).populate('category');

            if (!product) {
                return res.render('user/checkout', {
                    addresses: [],
                    selectedAddress: null,
                    cart: { items: [] },
                    userName: req.session.userName || null,
                    error: 'Product not found',
                    categories: await Category.find({ isListed: true }),
                    subtotal: 0,
                    tax: 0,
                    shipping: 0,
                    discount: 0,
                    total: 0
                });
            }

            orderItems = [{
                productId: product,
                quantity: buyNowData.quantity
            }];
        } else {
            // Regular Cart: Use cart items
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (!cart || !cart.items.length) {
                return res.render('user/checkout', {
                    addresses: [],
                    selectedAddress: null,
                    cart: { items: [] },
                    userName: req.session.userName || null,
                    error: 'Cart is empty',
                    categories: await Category.find({ isListed: true }),
                    subtotal: 0,
                    tax: 0,
                    shipping: 0,
                    discount: 0,
                    total: 0
                });
            }
            orderItems = cart.items;
        }

        // Calculate totals and validate stock
        let subtotal = 0;
        let tax = 0;
        let shipping = 50;
        let discount = 0;
        const validItems = [];

        for (const item of orderItems) {
            const product = isBuyNow ? item.productId : await Product.findById(item.productId._id).populate('category');
            if (!product) {
                console.warn('Product not found:', item.productId);
                continue;
            }
            if (product.quantity < item.quantity) {
                const categories = await Category.find({ isListed: true });
                const user = await User.findById(userId).select('email phone').lean();
                let availableOffers = [];
                let availableCoupons = [];
                
                // Only fetch offers and coupons if not in buy-now mode
                if (!isBuyNow) {
                    availableOffers = await getAvailableOffers(userId, orderItems);
                    availableCoupons = await AdminCouponController.getAvailableCoupons(userId, orderItems);
                }
                
                return res.render('user/checkout', {
                    addresses: addressDoc ? addressDoc.address : [],
                    selectedAddress: addressDoc ? addressDoc.address.find(addr => addr._id.toString() === selectedAddress) : null,
                    cart: { items: orderItems },
                    isBuyNow: isBuyNow || false,
                    appliedOffer: req.session.appliedOffer || null,
                    availableOffers: availableOffers,
                    availableCoupons: availableCoupons,
                    userName: req.session.userName || null,
                    userEmail: user?.email || '',
                    userPhone: user?.phone || '',
                    error: `Insufficient stock for ${product.productName}`,
                    categories: categories,
                    subtotal: 0,
                    tax: 0,
                    shipping: 0,
                    discount: 0,
                    offerDiscount: req.session.appliedOffer?.discountAmount || 0,
                    total: 0
                });
            }
            if (
                product.isBlocked ||
                !product.category.isListed ||
                product.status === 'Out of Stock'
            ) {
                console.warn('Invalid product:', product.productName);
                continue;
            }
            validItems.push({
                productId: product._id,
                quantity: item.quantity,
                price: product.salePrice,
                productName: product.productName
            });
            const itemTotal = item.quantity * product.salePrice;
            subtotal += itemTotal;
            const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
            const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
            discount += Math.max(productDiscount, categoryDiscount);

            // Update product stock
            product.quantity -= item.quantity;
            if (product.quantity <= 0) {
                product.status = 'Out of Stock';
            }
            await product.save();
        }

        // Update cart only if it's not a buy now order
        if (!isBuyNow) {
            const cart = await Cart.findOne({ userId });
            if (cart && validItems.length !== cart.items.length) {
                cart.items = validItems;
                await cart.save();
            }
        }

        if (!validItems.length) {
            return res.render('user/checkout', {
                addresses: addressDoc.address,
                selectedAddress: addressDoc.address.find(addr => addr._id.toString() === selectedAddress),
                cart: { items: [] },
                userName: req.session.userName || null,
                error: isBuyNow ? 'Product not available' : 'No valid items in cart',
                categories: await Category.find({ isListed: true }),
                subtotal: 0,
                tax: 0,
                shipping: 0,
                discount: 0,
                total: 0
            });
        }

        tax = subtotal * 0.05;

        // Apply offer discount if available
        let offerDiscount = 0;
        let appliedOffer = null;
        if (req.session.appliedOffer) {
            offerDiscount = req.session.appliedOffer.discountAmount || 0;
            appliedOffer = req.session.appliedOffer;
        }

        const total = subtotal + tax + shipping - discount - offerDiscount;

        const selectedAddr = addressDoc.address.find(addr => addr._id.toString() === selectedAddress);

        // Save order to database
        const order = new Order({
            userId,
            orderID: generateOrderID(),
            items: validItems,
            shippingAddress: {
                addressType: selectedAddr.addressType,
                fullName: selectedAddr.fullName,
                phone: selectedAddr.phone,
                secPhone: selectedAddr.secPhone,
                houseName: selectedAddr.houseName,
                city: selectedAddr.city,
                state: selectedAddr.state,
                pincode: selectedAddr.pincode,
                landMark: selectedAddr.landMark
            },
            paymentMethod,
            subtotal,
            tax,  
            shipping,
            discount,  
            offerDiscount: offerDiscount,
            appliedOffer: appliedOffer ? {
                code: appliedOffer.code,
                discountAmount: offerDiscount
            } : null,
            total,
            status: 'Pending',
            orderDate: new Date()
        });
        await order.save();

        // Apply referral rewards if eligible
        try { await applyReferralRewards(order); } catch (e) { console.error('Referral reward error (COD):', e); }

        // Track coupon usage if applied
        if (appliedOffer && appliedOffer.code) {
            try {
                await Coupon.findOneAndUpdate(
                    { code: appliedOffer.code.toUpperCase() },
                    {
                        $push: {
                            usedBy: {
                                userId: userId,
                                orderId: order._id,
                                usedAt: new Date(),
                                discountAmount: offerDiscount
                            }
                        },
                        $set: { updatedAt: new Date() }
                    }
                );
                console.log(`Coupon ${appliedOffer.code} usage tracked for order ${order.orderID}`);
            } catch (error) {
                console.error('Error tracking coupon usage:', error);
                // Don't fail the order if coupon tracking fails
            }
        }

        // Clear cart or buy now session
        if (isBuyNow) {
            // Clear buy now session data
            delete req.session.buyNowProduct;
        } else {
            // Clear regular cart
            const cart = await Cart.findOne({ userId });
            if (cart) {
                cart.items = [];
                await cart.save();
            }
        }

        // Clear applied offer from session
        delete req.session.appliedOffer;

        // Store order details in session for confirmation page
        req.session.orderDetails = {
            orderID: order.orderID,
            address: order.shippingAddress,
            items: order.items,
            subtotal,
            tax,
            shipping,
            discount,
            total,
            paymentMethod,
            orderDate: order.orderDate
        };

        return res.redirect('/order-confirmation');
    } catch (error) {
        console.error('Error placing order:', error);
        return res.render('user/checkout', {
            addresses: [],
            selectedAddress: null,
            cart: { items: [] },
            userName: req.session.userName || null,
            error: 'Failed to place order. Please try again.',
            categories: await Category.find({ isListed: true }),
            subtotal: 0,
            tax: 0,
            shipping: 0,
            discount: 0,
            total: 0
        });
    }
};

exports.getOrderConfirmation = async (req, res) => {
    try {
        const orderDetails = req.session.orderDetails || null;
        const categories = await Category.find({ isListed: true });

        // Clear order details from session after rendering
        req.session.orderDetails = null;

        res.render('user/orderConfirmation', {
            userName: req.session.userName || null,
            message: 'Order placed successfully!',
            orderDetails,
            categories
        });
    } catch (error) {
        console.error('Error rendering order confirmation:', error);
        res.render('user/orderConfirmation', {
            userName: req.session.userName || null,
            message: 'Order placed successfully!',
            orderDetails: null,
            categories: [],
            error: 'Failed to load order confirmation details'
        });
    }
};

// Get Order Listing
exports.getOrderList = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { page = 1, search = '' } = req.query;
        const itemsPerPage = 10;

        // Validate userId - check if it's a valid ObjectId and not an admin session
        if (!userId || !mongoose.Types.ObjectId.isValid(userId) || userId === 'admin' || req.session.role === 'admin') {
            return res.render('user/orderList', {
                orders: [],
                userName: req.session.userName || null,
                error: 'Access denied. Please login as a user to view orders.',
                categories: await Category.find({ isListed: true }),
                currentPage: 1,
                totalPages: 0,
                searchQuery: ''
            });
        }

        const query = { userId };
        if (search) {
            query.orderID = { $regex: search, $options: 'i' };
        }

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / itemsPerPage);

        const orders = await Order.find(query)
            .sort({ orderDate: -1 })
            .skip((page - 1) * itemsPerPage)
            .limit(itemsPerPage)
            .lean();

        const categories = await Category.find({ isListed: true });

        res.render('user/orderList', {
            orders,
            userName: req.session.userName || null,
            error: null,
            categories,
            currentPage: parseInt(page),
            totalPages,
            searchQuery: search
        });
    } catch (error) {
        console.error('Error fetching order list:', error);
        res.render('user/orderList', {
            orders: [],
            userName: req.session.userName || null,
            error: 'Failed to load orders',
            categories: [],
            currentPage: 1,
            totalPages: 0,
            searchQuery: ''
        });
    }
};

// Get Order Details
exports.getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;

        // Validate orderId
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.render('user/orderError', {
                message: 'Invalid order ID',
                userName: req.session.userName || null,
                categories: await Category.find({ isListed: true })
            });
        }

        // Validate userId - check if it's a valid ObjectId and not an admin session
        if (!userId || !mongoose.Types.ObjectId.isValid(userId) || userId === 'admin' || req.session.role === 'admin') {
            return res.render('user/orderError', {
                message: 'Access denied. Please login as a user to view orders.',
                userName: req.session.userName || null,
                categories: await Category.find({ isListed: true })
            });
        }

        const order = await Order.findOne({ _id: orderId, userId }).lean();
        if (!order) {
            return res.render('user/orderError', {
                message: 'Order not found',
                userName: req.session.userName || null,
                categories: await Category.find({ isListed: true })
            });
        }

        const categories = await Category.find({ isListed: true });

        res.render('user/orderDetails', {
            order,
            userName: req.session.userName || null,
            error: null,
            categories
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.render('user/orderError', {
            message: 'Failed to load order details',
            userName: req.session.userName || null,
            categories: await Category.find({ isListed: true })
        });
    }
};

// Cancel Entire Order
exports.cancelOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;
        const { cancelReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Pending' && order.status !== 'Confirmed') {
            return res.status(400).json({ success: false, message: 'Order cannot be canceled' });
        }

        // Restore stock for each item
        for (const item of order.items) {
            const product = await Product.findById(item.productId);
            if (product) {
                product.quantity += item.quantity;
                product.status = product.quantity > 0 ? 'Available' : 'Out of Stock';
                await product.save();
            }
        }

        // Process refund if payment was made
        let refundMessage = 'Order canceled successfully';
        console.log(`Order cancellation - Payment Method: ${order.paymentMethod}, Order Total: ₹${order.total}`);

        try {
            if (order.paymentMethod === 'razorpay' && order.razorpayPaymentId) {
                // First try Razorpay refund
                const refundResult = await processRazorpayRefund(order, order.total);
                if (refundResult.success) {
                    refundMessage = `Order canceled successfully. ₹${order.total.toFixed(2)} has been refunded to your original payment method. Refund ID: ${refundResult.refundId}`;
                } else {
                    // Fall back to wallet refund if Razorpay refund fails
                    await processWalletRefund(
                        userId, 
                        order.total, 
                        `Refund for canceled order #${order.orderId || order._id} (Razorpay refund failed)`
                    );
                    refundMessage = `Order canceled successfully. ₹${order.total.toFixed(2)} has been refunded to your wallet.`;
                }
            } else if (order.paymentMethod === 'wallet' || order.paymentMethod === 'cod' || order.paymentMethod === 'razorpay') {
                // For wallet payments, COD, or if Razorpay payment ID is missing, refund to wallet
                await processWalletRefund(
                    userId,
                    order.total,
                    `Refund for canceled order #${order.orderId || order._id}`
                );
                refundMessage = `Order canceled successfully. ₹${order.total.toFixed(2)} has been refunded to your wallet.`;
            }
        } catch (error) {
            console.error('Error processing refund:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to process refund',
                error: error.message
            });
        }

        // Update order status
        order.status = 'Canceled';
        order.cancelReason = cancelReason || 'No reason provided';
        order.updatedAt = new Date();
        await order.save();
        
        return res.status(200).json({ success: true, message: refundMessage });
    } catch (error) {
        console.error('Error canceling order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to cancel order', 
            error: error.message 
        });
    }
};

// Cancel Specific Order Item
exports.cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const userId = req.session.userId;
        const { cancelReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({ success: false, message: 'Invalid order or item ID' });
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        const item = order.items[itemIndex];
        
        // Restore product stock
        const product = await Product.findById(item.productId);
        if (product) {
            product.quantity += item.quantity;
            product.status = product.quantity > 0 ? 'Available' : 'Out of Stock';
            await product.save();
        }

        // Calculate refund amount for this item (same as return logic)
        const itemRefundAmount = item.price * item.quantity;

        // Update order totals
        order.subtotal -= itemRefundAmount;
        order.tax = order.subtotal * 0.05;
        order.total = order.subtotal + order.tax + order.shipping - (order.discount || 0);

        // Process refund if payment was made
        let refundMessage = 'Order item canceled successfully';

        try {
            if (order.paymentMethod === 'razorpay' && order.razorpayPaymentId) {
                // First try Razorpay refund
                const refundResult = await processRazorpayRefund(order, itemRefundAmount);
                if (refundResult.success) {
                    refundMessage = `Order item canceled successfully. ₹${itemRefundAmount.toFixed(2)} has been refunded to your original payment method. Refund ID: ${refundResult.refundId}`;
                } else {
                    // Fall back to wallet refund if Razorpay refund fails
                    await processWalletRefund(
                        userId, 
                        itemRefundAmount, 
                        `Refund for canceled item from order #${order.orderId || order._id} (Razorpay refund failed)`
                    );
                    refundMessage = `Order item canceled successfully. ₹${itemRefundAmount.toFixed(2)} has been refunded to your wallet.`;
                }
            } else if (order.paymentMethod === 'wallet' || order.paymentMethod === 'cod' || order.paymentMethod === 'razorpay') {
                // For wallet payments, COD, or if Razorpay payment ID is missing, refund to wallet
                await processWalletRefund(
                    userId,
                    itemRefundAmount,
                    `Refund for canceled item from order #${order.orderId || order._id}`
                );
                refundMessage = `Order item canceled successfully. ₹${itemRefundAmount.toFixed(2)} has been refunded to your wallet.`;
            }
        } catch (error) {
            console.error('Error processing refund:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to process refund',
                error: error.message
            });
        }

        // Update item status
        item.status = 'Canceled';
        item.cancelReason = cancelReason || 'No reason provided';
        order.items[itemIndex] = item;

        // Check if all items are canceled
        const allCanceled = order.items.every(i => i.status === 'Canceled');
        if (allCanceled) {
            order.status = 'Canceled';
        }

        order.updatedAt = new Date();
        await order.save();
        
        return res.status(200).json({ success: true, message: refundMessage });
    } catch (error) {
        console.error('Error canceling order item:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to cancel order item',
            error: error.message 
        });
    }
};

// Return Specific Order Item
exports.returnOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const userId = req.session.userId;
        const { returnReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({ success: false, message: 'Invalid order or item ID' });
        }

        if (!returnReason) {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        const item = order.items[itemIndex];

        // ✅ FIX: Check item.status instead of order.status
        if (item.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Only delivered items can be returned' });
        }

        item.status = 'Return Requested';
        item.returnReason = returnReason;
        order.items[itemIndex] = item;
        order.updatedAt = new Date();
        await order.save();

        res.status(200).json({ success: true, message: 'Return request submitted successfully' });
    }
    catch (error) {
        console.error('Error requesting return:', error);
        res.status(500).json({ success: false, message: 'Failed to submit return request' });
    }
};

// Return Order
exports.returnOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;
        const { returnReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        if (!returnReason) {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
        }

        order.status = 'Return Requested';
        order.returnReason = returnReason;
        order.updatedAt = new Date();
        await order.save();

        res.status(200).json({ success: true, message: 'Return request submitted successfully' });
    } catch (error) {
        console.error('Error requesting return:', error);
        res.status(500).json({ success: false, message: 'Failed to submit return request' });
    }
};



exports.downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        const order = await Order.findOne({ _id: orderId, userId }).populate('items.productId');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const user = await User.findById(userId);

        // Create PDF document with larger right margin for totals
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4'
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=U-Craft_Invoice_${order.orderID}.pdf`);

        // Pipe PDF to response
        doc.pipe(res);

        // Add logo (replace with your actual logo path)
        // doc.image('public/images/logo.png', 50, 45, { width: 100 });

        // Add content to PDF
        generateInvoicePDF(doc, order, user);
        
        // Finalize PDF
        doc.end();
        
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).json({ success: false, message: 'Failed to generate invoice' });
    }
};

function generateInvoicePDF(doc, order, user) {
    // Constants for layout
    const leftColumn = 50;
    const rightColumn = 350;
    const pageWidth = 595;
    const pageCenter = pageWidth / 2;

    // Header Section
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text('U-CRAFT', { align: 'center' });
    
    doc.fontSize(14)
       .font('Helvetica')
       .text('INVOICE', { align: 'center' });
    
    // Horizontal line
    doc.moveTo(leftColumn, 100)
       .lineTo(pageWidth - leftColumn, 100)
       .lineWidth(1)
       .stroke();

    // Invoice Info (right aligned)
    doc.fontSize(10)
       .text(`Invoice #: ${order.orderID}`, rightColumn, 120, { width: 200, align: 'right' })
       .text(`Date: ${new Date(order.orderDate).toLocaleDateString()}`, rightColumn, 135, { width: 200, align: 'right' })
       .moveDown(1);

    // Customer Information
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('BILL TO:', leftColumn, 170);
    
    doc.font('Helvetica')
       .text(user.fullName, leftColumn, 190)
       .text(user.email, leftColumn, 205);
    
    if (user.phone) {
        doc.text(`Phone: ${user.phone}`, leftColumn, 220);
    }

    // Shipping Address
    doc.font('Helvetica-Bold')
       .text('SHIPPING ADDRESS:', leftColumn, 250);
    
    doc.font('Helvetica')
       .text(order.shippingAddress.fullName, leftColumn, 270)
       .text(order.shippingAddress.houseName, leftColumn, 285)
       .text(`${order.shippingAddress.city}, ${order.shippingAddress.state}`, leftColumn, 300)
       .text(`Pincode: ${order.shippingAddress.pincode}`, leftColumn, 315);
    
    if (order.shippingAddress.landMark) {
        doc.text(`Landmark: ${order.shippingAddress.landMark}`, leftColumn, 330);
    }

    // Order Items Table Header
    doc.font('Helvetica-Bold')
       .fontSize(12)
       .text('PRODUCT', leftColumn, 380)
       .text('QTY', 250, 380)
       .text('PRICE', 320, 380, { width: 90, align: 'right' })
       .text('TOTAL', 420, 380, { width: 90, align: 'right' })
    
    // Table line
    doc.moveTo(leftColumn, 395)
       .lineTo(pageWidth - leftColumn, 395)
       .lineWidth(1)
       .stroke();

    // Order Items
    let yPosition = 410;
    order.items.forEach(item => {
        const itemTotal = (item.quantity * item.price).toFixed(2);
        
        doc.font('Helvetica')
           .fontSize(10)
           .text(item.productName, leftColumn, yPosition, { width: 180 })
           .text(item.quantity.toString(), 250, yPosition)
           .text(`₹${item.price.toFixed(2)}`, 320, yPosition, { width: 90, align: 'right' })
           .text(`₹${itemTotal}`, 420, yPosition, { width: 90, align: 'right' })
           .text(item.status || 'N/A', 520, yPosition, { align: 'right' });
        
        yPosition += 20;
    });

    // Summary Section
    doc.moveTo(leftColumn, yPosition + 20)
       .lineTo(pageWidth - leftColumn, yPosition + 20)
       .lineWidth(1)
       .stroke();

    doc.font('Helvetica-Bold')
       .fontSize(12)
       .text('SUBTOTAL:', rightColumn, yPosition + 30, { width: 90, align: 'right' })
       .text(`₹${order.subtotal.toFixed(2)}`, 420, yPosition + 30, { width: 90, align: 'right' });

    doc.text('TAX (5%):', rightColumn, yPosition + 50, { width: 90, align: 'right' })
       .text(`₹${order.tax.toFixed(2)}`, 420, yPosition + 50, { width: 90, align: 'right' });

    doc.text('SHIPPING:', rightColumn, yPosition + 70, { width: 90, align: 'right' })
       .text(`₹${order.shipping.toFixed(2)}`, 420, yPosition + 70, { width: 90, align: 'right' });

    let currentYOffset = 90;

    // Product/Category Discount
    if (order.discount && order.discount > 0) {
        doc.text('PRODUCT DISCOUNT:', rightColumn, yPosition + currentYOffset, { width: 90, align: 'right' })
           .text(`-₹${order.discount.toFixed(2)}`, 420, yPosition + currentYOffset, { width: 90, align: 'right' });
        currentYOffset += 20;
    }

    // Offer Discount
    if (order.offerDiscount && order.offerDiscount > 0) {
        const offerText = order.appliedOffer && order.appliedOffer.code ?
            `OFFER (${order.appliedOffer.code}):` : 'OFFER DISCOUNT:';
        doc.text(offerText, rightColumn, yPosition + currentYOffset, { width: 90, align: 'right' })
           .text(`-₹${order.offerDiscount.toFixed(2)}`, 420, yPosition + currentYOffset, { width: 90, align: 'right' });
        currentYOffset += 20;
    }

    doc.moveTo(leftColumn, yPosition + currentYOffset + 20)
       .lineTo(pageWidth - leftColumn, yPosition + currentYOffset + 20)
       .lineWidth(1)
       .stroke();

    doc.fontSize(14)
       .text('TOTAL:', rightColumn, yPosition + currentYOffset + 30, { width: 90, align: 'right' })
       .text(`₹${order.total.toFixed(2)}`, 420, yPosition + currentYOffset + 30, { width: 90, align: 'right', underline: true });
    
    // Payment Method
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('PAYMENT METHOD:', leftColumn, yPosition + currentYOffset + 60)
       .font('Helvetica')
       .text(order.paymentMethod.toUpperCase(), leftColumn + 120, yPosition + currentYOffset + 60);
    
    // Footer
    doc.fontSize(10)
       .text('Thank you for shopping with U-Craft!', pageCenter, 750, { align: 'center' })
       .text('For any inquiries, please contact support@u-craft.com', pageCenter, 765, { align: 'center' });
}

exports.buyNow = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.userId;
        // Default quantity to 1 if not provided
        let quantity = req.body.quantity;
        if (!quantity || isNaN(quantity) || quantity < 1) {
            quantity = 1;
        } else {
            quantity = parseInt(quantity, 10);
        }

        console.log('buyNow called with:', { productId, userId, quantity });

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.warn('Invalid product ID:', productId);
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        // Check if product exists and is not blocked/unlisted and category is listed
        const product = await Product.findById(productId).populate('category');
        console.log('Product data:', {
            exists: !!product,
            isBlocked: product?.isBlocked,
            categoryListed: product?.category?.isListed,
            categoryBlocked: product?.category?.isBlocked,
            quantity: product?.quantity,
            status: product?.status
        });

        if (!product) {
            console.warn('Product not found:', productId);
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        // Check if product or its category is blocked or unlisted
        if (
            product.isBlocked ||
            !product.category ||
            product.category.isBlocked ||
            !product.category.isListed
        ) {
            console.warn('Product or category is blocked/unlisted:', productId);
            return res.status(400).json({ success: false, message: 'Product or its category is blocked or unlisted' });
        }
        if (product.quantity === 0 || product.status === 'Out of Stock') {
            console.warn('Product out of stock:', productId);
            return res.status(400).json({ success: false, message: 'Product is out of stock' });
        }

        // Validate quantity
        if (quantity > product.quantity) {
            console.warn('Requested quantity exceeds stock:', { requested: quantity, available: product.quantity });
            return res.status(400).json({ success: false, message: 'Insufficient stock' });
        }
        if (quantity > MAX_QUANTITY_PER_PRODUCT) {
            console.warn('Requested quantity exceeds max limit:', { requested: quantity, max: MAX_QUANTITY_PER_PRODUCT });
            return res.status(400).json({ success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` });
        }

        // Store buy now product in session for direct checkout
        req.session.buyNowProduct = {
            productId: productId,
            quantity: quantity,
            product: {
                _id: product._id,
                productName: product.productName,
                salePrice: product.salePrice,
                productImage: product.productImage,
                description: product.description
            }
        };

        console.log('Buy now product stored in session:', req.session.buyNowProduct);

        // Remove from wishlist if exists (optional - user preference)
        await Wishlist.updateOne(
            { userId },
            { $pull: { products: productId } }
        );
        console.log('Wishlist updated: Removed product if present');

        // Redirect to checkout page with buy now flag
        res.redirect('/checkout?buyNow=true');
    } catch (error) {
        console.error('Error in buyNow:', error.message, error.stack);
        res.status(500).render('user/productError', { 
            message: 'Failed to process buy now', 
            userName: req.session.userName || null 
        });
    }
};

exports.applyOffer = async (req, res) => {
    try {
        const { offerCode } = req.body;
        const userId = req.session.userId;

        console.log('Apply offer request:', { offerCode, userId });

        if (!offerCode) {
            return res.status(400).json({ success: false, message: 'Please enter an offer code' });
        }

        // Get cart items or buy now product
        let cartItems = [];
        const isBuyNow = req.session.buyNowProduct;

        if (isBuyNow) {
            const buyNowData = req.session.buyNowProduct;
            const product = await Product.findById(buyNowData.productId).populate('category');
            if (product) {
                cartItems = [{
                    productId: product,
                    quantity: buyNowData.quantity
                }];
            }
        } else {
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (cart && cart.items.length > 0) {
                cartItems = cart.items.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity
                }));
            }
        }

        if (!cartItems.length) {
            return res.status(400).json({ success: false, message: 'No items in cart to apply offer' });
        }

        // Validate and apply offer using admin controller function
        const result = await validateAndApplyOffer(offerCode, userId, cartItems);

        if (result.success) {
            // Store applied offer in session
            req.session.appliedOffer = {
                code: result.offer.code,
                discountAmount: result.discountAmount,
                eligibleTotal: result.eligibleTotal,
                eligibleItems: result.eligibleItems.map(item => item.productId._id.toString())
            };

            res.status(200).json({
                success: true,
                message: result.message,
                discountAmount: result.discountAmount,
                eligibleTotal: result.eligibleTotal
            });
        } else {
            res.status(400).json(result);
        }

    } catch (error) {
        console.error('Error applying offer:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Remove applied offer
exports.removeOffer = async (req, res) => {
    try {
        delete req.session.appliedOffer;
        res.status(200).json({ success: true, message: 'Offer removed successfully' });
    } catch (error) {
        console.error('Error removing offer:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Helper function to validate and apply offer
async function validateAndApplyOffer(offerCode, userId, cartItems) {
    try {
        // Find the coupon
        const offer = await Coupon.findOne({
            code: offerCode.toUpperCase(),
            isActive: true,
            isBlocked: false
        }).populate('applicableProducts applicableCategories');

        if (!offer) {
            return { success: false, message: 'Invalid offer code' };
        }

        // Check if offer is within date range
        const now = new Date();
        if (now < offer.startDate) {
            return { success: false, message: 'Offer is not yet active' };
        }
        if (now > offer.endDate) {
            return { success: false, message: 'Offer has expired' };
        }

        // Check global usage limit
        if (offer.usedBy.length >= offer.usageLimit) {
            return { success: false, message: 'Offer usage limit exceeded' };
        }

        // Check per-user usage limit
        const userUses = offer.usedBy.filter(usage => usage.userId && usage.userId.toString() === userId.toString()).length;
        if (typeof offer.perUserUse === 'number' && offer.perUserUse > 0 && userUses >= offer.perUserUse) {
            return { success: false, message: 'You have reached the usage limit for this offer' };
        }

        // Calculate eligible items and discount
        const eligibleItems = [];
        let eligibleTotal = 0;

        for (const item of cartItems) {
            const product = item.productId;
            let isEligible = false;

            if (offer.applicableType === 'all') {
                isEligible = true;
            } else if (offer.applicableType === 'products') {
                isEligible = offer.applicableProducts.some(p => p._id.toString() === product._id.toString());
            } else if (offer.applicableType === 'categories') {
                isEligible = offer.applicableCategories.some(c => c._id.toString() === product.category.toString());
            }

            if (isEligible) {
                const itemTotal = item.quantity * product.salePrice;
                eligibleItems.push({
                    ...item,
                    itemTotal
                });
                eligibleTotal += itemTotal;
            }
        }

        // Check minimum purchase requirement
        if (eligibleTotal < offer.minPurchase) {
            return {
                success: false,
                message: `Minimum purchase of ₹${offer.minPurchase} required for eligible items. Current eligible total: ₹${eligibleTotal}`
            };
        }

        // Calculate discount
        let discountAmount = 0;
        if (offer.discountType === 'percentage') {
            discountAmount = (eligibleTotal * offer.discountNumber) / 100;
        } else {
            discountAmount = offer.discountNumber;
        }

        // Apply maximum discount limit
        if (discountAmount > offer.maxDiscount) {
            discountAmount = offer.maxDiscount;
        }

        // Ensure discount doesn't exceed eligible total
        if (discountAmount > eligibleTotal) {
            discountAmount = eligibleTotal;
        }

        return {
            success: true,
            offer: offer,
            eligibleItems: eligibleItems,
            eligibleTotal: eligibleTotal,
            discountAmount: discountAmount,
            message: `Offer applied successfully! You saved ₹${discountAmount.toFixed(2)}`
        };

    } catch (error) {
        console.error('Error validating offer:', error);
        return { success: false, message: 'Failed to validate offer' };
    }
}


// Get available offers for user
async function getAvailableOffers(userId, cartItems) {
    try {
        const now = new Date();
        console.log('Getting available offers for user:', userId, 'at time:', now);

        // Find all active offers that are not expired and not blocked
        const offers = await Offer.find({
            isActive: true,
            isBlocked: false,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).populate('applicableProducts applicableCategories').lean();

        console.log('Found offers from database:', offers.length);
        offers.forEach(offer => {
            console.log(`Offer ${offer.code}: start=${offer.startDate}, end=${offer.endDate}, active=${offer.isActive}, blocked=${offer.isBlocked}`);
        });

        const availableOffers = [];

        for (const offer of offers) {
            // Check if user has already used this offer
            const userUsage = offer.usedBy.find(usage =>
                usage.userId && usage.userId.toString() === userId.toString()
            );

            if (userUsage) {
                continue; // Skip if user already used this offer
            }

            // Check if offer usage limit is reached
            if (offer.usedBy.length >= offer.usageLimit) {
                continue; // Skip if usage limit reached
            }

            // Check if user has eligible items for this offer
            let hasEligibleItems = false;
            let eligibleTotal = 0;

            for (const item of cartItems) {
                const product = item.productId;
                let isEligible = false;

                if (offer.applicableType === 'all') {
                    isEligible = true;
                } else if (offer.applicableType === 'products') {
                    isEligible = offer.applicableProducts.some(p =>
                        p._id.toString() === product._id.toString()
                    );
                } else if (offer.applicableType === 'categories') {
                    isEligible = offer.applicableCategories.some(c =>
                        c._id.toString() === product.category.toString()
                    );
                }

                if (isEligible) {
                    hasEligibleItems = true;
                    eligibleTotal += item.quantity * product.salePrice;
                }
            }

            if (hasEligibleItems) {
                // Calculate potential discount
                let potentialDiscount = 0;
                if (offer.discountType === 'percentage') {
                    potentialDiscount = (eligibleTotal * offer.discountNumber) / 100;
                } else {
                    potentialDiscount = offer.discountNumber;
                }

                // Apply maximum discount limit
                potentialDiscount = Math.min(potentialDiscount, offer.maxDiscount, eligibleTotal);

                // Check if minimum purchase requirement is met
                const meetsMinimum = eligibleTotal >= offer.minPurchase;

                availableOffers.push({
                    code: offer.code,
                    discountType: offer.discountType,
                    discountNumber: offer.discountNumber,
                    maxDiscount: offer.maxDiscount,
                    minPurchase: offer.minPurchase,
                    endDate: offer.endDate,
                    eligibleTotal: eligibleTotal,
                    potentialDiscount: potentialDiscount,
                    meetsMinimum: meetsMinimum,
                    applicableType: offer.applicableType,
                    usageRemaining: offer.usageLimit - offer.usedBy.length
                });
            }
        }

        return availableOffers;
    } catch (error) {
        console.error('Error getting available offers:', error);
        return [];
    }
}

// Apply referral rewards for the referee's first eligible order
async function applyReferralRewards(order) {
    try {
        if (!order || !order.userId) return;
        const user = await User.findById(order.userId);
        if (!user || !user.referredBy) return; // No referral associated

        // Ensure there is an active referral offer
        const now = new Date();
        const offer = await ReferralOffer.findOne({
            isActive: true,
            isBlocked: false,
            startDate: { $lte: now },
            endDate: { $gte: now }
        });
        if (!offer) return;

        // Check min purchase amount
        const orderTotal = order.total || 0;
        if (orderTotal < (offer.minPurchaseAmount || 0)) return;

        // Ensure this is the first eligible order for the referee
        const priorOrders = await Order.countDocuments({ userId: order.userId, _id: { $ne: order._id } });
        if (priorOrders > 0) return;

        // Check referrer limit
        const referrer = await User.findById(user.referredBy);
        if (!referrer) return;
        if (typeof offer.maxReferralsPerUser === 'number' && offer.maxReferralsPerUser >= 0) {
            if ((referrer.referralCount || 0) >= offer.maxReferralsPerUser) return;
        }

        // Helper to compute reward amount/points
        const computeReward = (type, value, maxCap, base) => {
            if (type === 'percentage') {
                const amt = (base * value) / 100;
                return Math.min(amt, maxCap || amt);
            } else if (type === 'amount') {
                return value;
            } else if (type === 'points') {
                return Math.max(0, Math.floor(value));
            }
            return 0;
        };

        // Calculate rewards
        const referrerType = offer.referrerRewardType;
        const referrerValue = offer.referrerRewardValue;
        const referrerMax = offer.referrerRewardType === 'percentage' ? offer.referrerMaxReward : undefined;
        const refereeType = offer.refereeRewardType;
        const refereeValue = offer.refereeRewardValue;
        const refereeMax = offer.refereeRewardType === 'percentage' ? offer.refereeMaxReward : undefined;

        const referrerReward = computeReward(referrerType, referrerValue, referrerMax, orderTotal);
        const refereeReward = computeReward(refereeType, refereeValue, refereeMax, orderTotal);

        // Credit referrer
        if (referrerType === 'points') {
            referrer.points = (referrer.points || 0) + referrerReward;
        } else {
            let refWallet = await Wallet.findOne({ userId: referrer._id });
            if (!refWallet) refWallet = new Wallet({ userId: referrer._id, balance: 0, transactions: [] });
            refWallet.balance += referrerReward;
            refWallet.transactions.push({
                type: 'credit',
                amount: referrerReward,
                description: `Referral reward (referrer) for order ${order.orderID}`,
                orderId: order._id
            });
            await refWallet.save();
        }

        // Credit referee
        if (refereeType === 'points') {
            user.points = (user.points || 0) + refereeReward;
        } else {
            let refWallet2 = await Wallet.findOne({ userId: user._id });
            if (!refWallet2) refWallet2 = new Wallet({ userId: user._id, balance: 0, transactions: [] });
            refWallet2.balance += refereeReward;
            refWallet2.transactions.push({
                type: 'credit',
                amount: refereeReward,
                description: `Referral reward (referee) for order ${order.orderID}`,
                orderId: order._id
            });
            await refWallet2.save();
        }

        // Update counts and tracking
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        await referrer.save();
        await user.save();

        offer.totalReferrals = (offer.totalReferrals || 0) + 1;
        const paid = (referrerType === 'points' ? 0 : referrerReward) + (refereeType === 'points' ? 0 : refereeReward);
        offer.totalRewardsPaid = (offer.totalRewardsPaid || 0) + paid;
        offer.updatedAt = new Date();
        await offer.save();

    } catch (err) {
        console.error('applyReferralRewards error:', err);
    }
}

async function processRazorpayRefund(order, amount) {
    try {
        if (!order.razorpayPaymentId) {
            console.error('No Razorpay payment ID found for order:', order._id);
            return { success: false, message: 'No payment reference found for refund' };
        }

        // Convert amount to paise (Razorpay's smallest currency unit)
        const amountInPaise = Math.round(amount * 100);
        
        // Create refund using Razorpay API
        const refund = await global.razorpayInstance.payments.refund(
            order.razorpayPaymentId,
            { amount: amountInPaise }
        );

        console.log('Razorpay refund successful:', refund);
        return { 
            success: true, 
            message: 'Refund processed successfully',
            refundId: refund.id
        };
    } catch (error) {
        console.error('Error processing Razorpay refund:', error);
        return { 
            success: false, 
            message: error.description || 'Failed to process Razorpay refund',
            error: error.error
        };
    }
}

exports.processWalletRefund = async function(userId, amount, description) {
    try {
        console.log(`Processing wallet refund: User ${userId}, Amount: ₹${amount}, Description: ${description}`);

        // Find or create wallet for user
        let wallet = await Wallet.findOne({ userId });
        console.log(`Existing wallet found:`, wallet ? `Balance: ₹${wallet.balance}, Transactions: ${wallet.transactions.length}` : 'No wallet found');

        if (!wallet) {
            console.log('Creating new wallet for user');
            wallet = new Wallet({
                userId: userId,
                balance: 0,
                transactions: []
            });
        }

        // Store old balance for logging
        const oldBalance = wallet.balance;

        // Add refund amount to wallet balance
        wallet.balance += amount;

        // Add transaction record
        const transaction = {
            type: 'credit',
            amount: amount,
            description: description,
            date: new Date()
        };

        wallet.transactions.push(transaction);
        console.log(`Transaction added:`, transaction);
        console.log(`Balance updated: ₹${oldBalance} → ₹${wallet.balance}`);

        // Save wallet
        const savedWallet = await wallet.save();
        console.log(`Wallet saved successfully. New balance: ₹${savedWallet.balance}, Total transactions: ${savedWallet.transactions.length}`);

        console.log(`Wallet refund successful: ₹${amount} added to user ${userId} wallet`);
        return { success: true, newBalance: wallet.balance };
    } catch (error) {
        console.error('Error processing wallet refund:', error);
        throw error;
    }
};