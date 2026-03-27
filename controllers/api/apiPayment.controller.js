const crypto = require('crypto');
const Order = require('../../models/order.model');
const Product = require('../../models/product.model');
const Address = require('../../models/address.model');
const Cart = require('../../models/cart.model');
const Coupon = require('../../models/coupon.model');
const { applyReferralRewards } = require('../../services/referralService');

// Generate Order ID
const generateOrderID = () => {
    const prefix = 'ORD';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${timestamp}-${random}`;
};

// Create Razorpay Order
exports.createRazorpayOrder = async (req, res) => {
    try {
        console.log('=== CREATE RAZORPAY ORDER REQUEST ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        
        const { userId, amount } = req.body;

        if (!userId || !amount) {
            return res.status(400).json({
                success: false,
                message: 'userId and amount are required'
            });
        }

        if (amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be greater than 0'
            });
        }

        const amountInPaise = Math.round(amount * 100);

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `ORD_${Date.now().toString().slice(-6)}`
        };

        if (!global.razorpayInstance) {
            return res.status(500).json({
                success: false,
                message: 'Razorpay not initialized'
            });
        }

        const razorpayOrder = await global.razorpayInstance.orders.create(options);
        console.log('Razorpay order created:', razorpayOrder);

        res.json({
            success: true,
            razorpayOrder
        });

    } catch (error) {
        console.error('Create Razorpay order error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Verify Payment & Create Order
exports.verifyPaymentAndCreateOrder = async (req, res) => {
    try {
        console.log('=== PAYMENT VERIFY REQUEST START ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        
        const {
            userId,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            selectedAddressId,
            isBuyNow,
            items,
            buyNowProduct,
            appliedOffer
        } = req.body;

        console.log('Extracted parameters:', {
            userId: userId ? 'present' : 'missing',
            razorpay_order_id: razorpay_order_id ? 'present' : 'missing',
            razorpay_payment_id: razorpay_payment_id ? 'present' : 'missing',
            razorpay_signature: razorpay_signature ? 'present' : 'missing',
            selectedAddressId: selectedAddressId ? 'present' : 'missing',
            isBuyNow,
            itemsCount: items ? items.length : 'missing',
            buyNowProduct: buyNowProduct ? 'present' : 'missing'
        });

        // Validate required fields
        if (!userId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !selectedAddressId) {
            console.log('VALIDATION FAILED - Missing required fields');
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        if (!isBuyNow && !items) {
            console.log('VALIDATION FAILED - Items required for cart orders');
            return res.status(400).json({
                success: false,
                message: 'Items are required for cart orders'
            });
        }

        if (isBuyNow && !buyNowProduct) {
            console.log('VALIDATION FAILED - Buy now product required');
            return res.status(400).json({
                success: false,
                message: 'Buy now product is required for buy now orders'
            });
        }

        console.log('VALIDATION PASSED');

        // Verify Razorpay signature
        console.log('VERIFYING RAZORPAY SIGNATURE...');
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        console.log('Signature verification:', {
            body,
            expectedSignature: expectedSignature.substring(0, 20) + '...',
            receivedSignature: razorpay_signature.substring(0, 20) + '...',
            signaturesMatch: expectedSignature === razorpay_signature
        });

        if (expectedSignature !== razorpay_signature) {
            console.log('SIGNATURE VERIFICATION FAILED');
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        console.log('SIGNATURE VERIFIED SUCCESSFULLY');

        // Process order creation
        console.log('PROCESSING ORDER CREATION...');
        const result = await processOrderCreation(
            userId,
            selectedAddressId,
            isBuyNow,
            items,
            buyNowProduct,
            appliedOffer,
            { razorpayPaymentId: razorpay_payment_id }
        );

        console.log('ORDER CREATION RESULT:', result);

        if (result.success) {
            console.log('ORDER CREATED SUCCESSFULLY');
            res.json({
                success: true,
                orderId: result.orderId,
                orderNumber: result.orderNumber
            });
        } else {
            console.log("ORDER CREATION FAILED:", result.message);
            res.status(400).json({
                success: false,
                message: result.message
            });
        }

        console.log('=== PAYMENT VERIFY REQUEST END ===');

    } catch (error) {
        console.error('VERIFY PAYMENT ERROR:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Helper function to process order creation
async function processOrderCreation(userId, selectedAddressId, isBuyNow, items, buyNowProduct, appliedOffer, paymentDetails) {
    try {
        // Get address details
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return { success: false, message: 'Address not found' };
        }

        const selectedAddr = addressDoc.address.find(addr => addr._id.toString() === selectedAddressId);
        if (!selectedAddr) {
            return { success: false, message: 'Selected address not found' };
        }

        // Get cart items or buy now product
        let orderItems = [];

        if (isBuyNow) {
            const product = await Product.findById(buyNowProduct.productId).populate('category');
            if (!product) {
                return { success: false, message: 'Product not found' };
            }

            if (product.isBlocked || !product.category.isListed || product.status === 'Out of Stock') {
                return { success: false, message: 'Product is not available' };
            }

            if (product.quantity < buyNowProduct.quantity) {
                return { success: false, message: 'Insufficient stock' };
            }

            orderItems = [{
                productId: product._id,
                productName: product.productName,
                quantity: buyNowProduct.quantity,
                price: product.salePrice
            }];
        } else {
            // Validate and fetch cart items
            for (const item of items) {
                const product = await Product.findById(item.productId).populate('category');
                if (!product) {
                    return { success: false, message: 'Product not found' };
                }

                if (product.isBlocked || !product.category.isListed || product.status === 'Out of Stock') {
                    return { success: false, message: `Product ${product.productName} is not available` };
                }

                if (product.quantity < item.quantity) {
                    return { success: false, message: `Insufficient stock for ${product.productName}` };
                }

                orderItems.push({
                    productId: product._id,
                    productName: product.productName,
                    quantity: item.quantity,
                    price: product.salePrice
                });
            }
        }

        if (!orderItems.length) {
            return { success: false, message: 'No valid items in order' };
        }

        // Calculate totals
        let subtotal = 0;
        let discount = 0;

        for (const item of orderItems) {
            const product = await Product.findById(item.productId).populate('category');
            const itemTotal = item.quantity * product.salePrice;
            subtotal += itemTotal;

            // Apply product or category offer
            const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
            const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
            discount += Math.max(productDiscount, categoryDiscount);
        }

        const tax = subtotal * 0.05;
        const shipping = 50;

        // Apply offer discount if available
        let offerDiscount = 0;
        if (appliedOffer && appliedOffer.discountAmount) {
            offerDiscount = appliedOffer.discountAmount;
        }

        const total = subtotal + tax + shipping - discount - offerDiscount;

        // Update stock for all products
        for (const item of orderItems) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { quantity: -item.quantity }
            });

            // Update product status if out of stock
            const product = await Product.findById(item.productId);
            if (product.quantity <= 0) {
                product.status = 'Out of Stock';
                await product.save();
            }
        }

        // Create order
        const order = new Order({
            userId,
            orderID: generateOrderID(),
            items: orderItems,
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
            paymentMethod: 'razorpay',
            razorpayPaymentId: paymentDetails.razorpayPaymentId,
            subtotal,
            tax,
            shipping,
            discount,
            offerDiscount,
            appliedOffer: appliedOffer ? {
                code: appliedOffer.code,
                discountAmount: offerDiscount
            } : null,
            total,
            status: 'Pending',
            orderDate: new Date()
        });

        await order.save();

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
            } catch (error) {
                console.error('Error tracking coupon usage:', error);
            }
        }

        // Apply referral rewards if eligible
        try {
            await applyReferralRewards(order);
        } catch (error) {
            console.error('Referral reward error:', error);
        }

        // Clear cart if not buy now
        if (!isBuyNow) {
            const cart = await Cart.findOne({ userId });
            if (cart) {
                cart.items = [];
                await cart.save();
            }
        }

        return {
            success: true,
            orderId: order._id,
            orderNumber: order.orderID
        };

    } catch (error) {
        console.error('Error processing order creation:', error);
        return { success: false, message: 'Internal server error' };
    }
}
