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
        
        const { userId, isBuyNow, buyNowProduct } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId is required'
            });
        }

        let subtotal = 0;
        let discount = 0;
        let total = 0;

        if (isBuyNow) {
            // Handle buy now - single product
            if (!buyNowProduct || !buyNowProduct.productId || !buyNowProduct.quantity) {
                return res.status(400).json({
                    success: false,
                    message: 'buyNowProduct with productId and quantity is required for buy now orders'
                });
            }

            const product = await Product.findById(buyNowProduct.productId).populate('category');
            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: 'Product not found'
                });
            }

            if (product.isBlocked || !product.category.isListed || product.status === 'Out of Stock') {
                return res.status(400).json({
                    success: false,
                    message: 'Product is not available'
                });
            }

            if (product.quantity < buyNowProduct.quantity) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient stock'
                });
            }

            const itemTotal = buyNowProduct.quantity * product.salePrice;
            subtotal = itemTotal;

            // Apply product or category offer
            const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
            const categoryDiscount = product.category && product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
            discount = Math.max(productDiscount, categoryDiscount);

            const tax = subtotal * 0.05;
            const shipping = 50;
            total = Math.round(subtotal + tax + shipping - discount);

            console.log('Buy Now calculation:', {
                productId: product._id,
                productName: product.productName,
                quantity: buyNowProduct.quantity,
                subtotal,
                tax,
                shipping,
                discount,
                total
            });

        } else {
            // Handle cart-based orders
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (!cart || cart.items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cart is empty'
                });
            }

            // Calculate total amount from cart
            for (const item of cart.items) {
                const product = item.productId;
                const itemTotal = item.quantity * product.salePrice;
                subtotal += itemTotal;

                // Apply product or category offer
                const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
                const categoryDiscount = product.category && product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
                discount += Math.max(productDiscount, categoryDiscount);
            }

            const tax = subtotal * 0.05;
            const shipping = 50;
            total = Math.round(subtotal + tax + shipping - discount);

            console.log('Cart calculation:', {
                itemsCount: cart.items.length,
                subtotal,
                tax,
                shipping,
                discount,
                total
            });
        }

        // Validate calculated amount before calling Razorpay
        if (!Number.isFinite(total) || total <= 0) {
            console.error('Invalid calculated amount:', { total, subtotal, tax, shipping, discount });
            return res.status(400).json({
                success: false,
                message: 'Invalid amount calculation'
            });
        }

        console.log('Final calculated amounts:', {
            subtotal,
            tax,
            shipping,
            discount,
            total
        });

        const amountInPaise = Math.round(total * 100);

        // Additional validation for amountInPaise
        if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
            console.error('Invalid amountInPaise:', { amountInPaise, total });
            return res.status(400).json({
                success: false,
                message: 'Invalid payment amount'
            });
        }

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `ORD_${Date.now().toString().slice(-6)}`
        };

        console.log('Razorpay options:', { amount: amountInPaise, currency: "INR", receipt: options.receipt });

        if (!global.razorpayInstance) {
            return res.status(500).json({
                success: false,
                message: 'Razorpay not initialized'
            });
        }

        const razorpayOrder = await global.razorpayInstance.orders.create(options);
        console.log('Razorpay order created successfully:', razorpayOrder.id);

        res.json({
            success: true,
            razorpayOrder,
            amount: total, // Send calculated amount to frontend for display
            orderType: isBuyNow ? 'buy-now' : 'cart'
        });

    } catch (error) {
        console.error('Create Razorpay order error:', error);
        
        // Handle Razorpay specific errors
        if (error.error && error.error.description) {
            return res.status(400).json({
                success: false,
                message: error.error.description,
                error: error.error
            });
        }
        
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
            buyNowProduct: buyNowProduct ? 'present' : 'missing',
            appliedOffer: appliedOffer ? 'present' : 'missing'
        });

        // Validate required fields
        if (!userId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !selectedAddressId) {
            console.log('VALIDATION FAILED - Missing required fields');
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        if (!isBuyNow && !req.body.items) {
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

        // Process order creation using appropriate data source
        console.log('PROCESSING ORDER CREATION...');
        const result = await processOrderCreation(
            userId,
            selectedAddressId,
            isBuyNow,
            isBuyNow ? null : req.body.items, // Items for cart orders
            isBuyNow ? buyNowProduct : null, // Product for buy now
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

// Helper function to process order creation (supports both cart and buy now)
async function processOrderCreation(userId, selectedAddressId, isBuyNow, items, buyNowProduct, appliedOffer, paymentDetails) {
    try {
        console.log('=== PROCESSING ORDER CREATION ===');
        console.log('Order type:', isBuyNow ? 'Buy Now' : 'Cart');
        
        // Get address details
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return { success: false, message: 'Address not found' };
        }

        const selectedAddr = addressDoc.address.find(addr => addr._id.toString() === selectedAddressId);
        if (!selectedAddr) {
            return { success: false, message: 'Selected address not found' };
        }

        let orderItems = [];
        let subtotal = 0;
        let discount = 0;

        if (isBuyNow) {
            // Handle buy now order
            console.log('Processing buy now order...');
            const product = await Product.findById(buyNowProduct.productId).populate('category');
            if (!product) {
                return { success: false, message: 'Product not found' };
            }

            if (product.isBlocked || !product.category.isListed || product.status === 'Out of Stock') {
                return { success: false, message: `Product ${product.productName} is not available` };
            }

            if (product.quantity < buyNowProduct.quantity) {
                return { success: false, message: `Insufficient stock for ${product.productName}` };
            }

            const itemTotal = buyNowProduct.quantity * product.salePrice;
            subtotal = itemTotal;

            // Apply product or category offer
            const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
            const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
            discount = Math.max(productDiscount, categoryDiscount);

            orderItems = [{
                productId: product._id,
                productName: product.productName,
                quantity: buyNowProduct.quantity,
                price: product.salePrice
            }];

            console.log('Buy now order items:', orderItems);

        } else {
            // Handle cart order
            console.log('Processing cart order...');
            
            // Fetch cart from database
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (!cart || cart.items.length === 0) {
                return { success: false, message: 'Cart is empty' };
            }

            console.log('Cart items found:', cart.items.length);

            // Validate products and create order items
            for (const cartItem of cart.items) {
                const product = await Product.findById(cartItem.productId._id).populate('category');
                if (!product) {
                    return { success: false, message: `Product not found: ${cartItem.productId}` };
                }

                if (product.isBlocked || !product.category.isListed || product.status === 'Out of Stock') {
                    return { success: false, message: `Product ${product.productName} is not available` };
                }

                if (product.quantity < cartItem.quantity) {
                    return { success: false, message: `Insufficient stock for ${product.productName}` };
                }

                const itemTotal = cartItem.quantity * product.salePrice;
                subtotal += itemTotal;

                // Apply product or category offer
                const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
                const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
                discount += Math.max(productDiscount, categoryDiscount);

                orderItems.push({
                    productId: product._id,
                    productName: product.productName,
                    quantity: cartItem.quantity,
                    price: product.salePrice
                });
            }
        }

        if (!orderItems.length) {
            return { success: false, message: 'No valid items in order' };
        }

        const tax = subtotal * 0.05;
        const shipping = 50;

        // Apply offer discount if available
        let offerDiscount = 0;
        if (appliedOffer && appliedOffer.discountAmount) {
            offerDiscount = appliedOffer.discountAmount;
        }

        const total = subtotal + tax + shipping - discount - offerDiscount;

        console.log('Order totals calculated:', {
            subtotal,
            tax,
            shipping,
            discount,
            offerDiscount,
            total
        });

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
        console.log('Order created with ID:', order.orderID);

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

        // Clear cart after successful order (only for cart orders)
        if (!isBuyNow) {
            const cart = await Cart.findOne({ userId });
            if (cart) {
                cart.items = [];
                await cart.save();
                console.log('Cart cleared successfully');
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
