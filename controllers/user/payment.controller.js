const HTTP_STATUS = require('../../constants/httpStatus');
const Order = require('../../models/order.model');
const Product = require('../../models/product.model');
const Address = require('../../models/address.model');
const Cart = require('../../models/cart.model');
const User = require('../../models/user.model');
const Coupon = require('../../models/coupon.model');
const crypto = require('crypto');


const generateOrderID = () => {
    const prefix = 'ORD';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${timestamp}-${random}`;
};

exports.createOrder = async (req,res) => {
  try {
    console.log('Create order request received:', req.body);

    if (!req.body.amount) {
      return res.status(400).json({ success: false, message: 'Amount is required' });
    }

    const amount = req.body.amount * 100; // in paise
    console.log('Amount in paise:', amount);

    const options = {
      amount,
      currency: "INR",
      receipt: `receipt_order_${Date.now()}`
    };

    console.log('Razorpay options:', options);
    console.log('Razorpay instance available:', !!global.razorpayInstance);

    if (!global.razorpayInstance) {
      return res.status(500).json({ success: false, message: 'Razorpay not initialized' });
    }

    const order = await global.razorpayInstance.orders.create(options);
    console.log('Razorpay order created:', order);
    res.json({ success: true, order });
  } catch (err) {
    console.error('Razorpay order creation error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const crypto = require('crypto');

    // Create signature for verification
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Payment is verified, now place the order
      const userId = req.session.userId;
      const { selectedAddress, paymentMethod } = req.session.checkoutData || {};

      if (!selectedAddress) {
        return res.status(400).json({
          success: false,
          message: 'Checkout session expired. Please try again.'
        });
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
        return res.status(400).json({
          success: false,
          message: 'No items found for order'
        });
      }

      // Process the order (similar to existing placeOrder logic)
      const result = await processOrderAfterPayment(
        userId, 
        cartItems, 
        selectedAddress, 
        'razorpay', 
        req.session.appliedOffer,
        { razorpayPaymentId: razorpay_payment_id }
      );

      if (result.success) {
        // Clear session data
        if (isBuyNow) {
          delete req.session.buyNowProduct;
        } else {
          const cart = await Cart.findOne({ userId });
          if (cart) {
            cart.items = [];
            await cart.save();
          }
        }
        delete req.session.appliedOffer;
        delete req.session.checkoutData;

        res.json({
          success: true,
          orderId: result.orderId,
          message: 'Payment verified and order placed successfully'
        });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } else {
      res.status(400).json({ success: false, message: 'Payment verification failed' });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Payment success page
exports.paymentSuccess = async (req, res) => {
  try {
    const { orderId } = req.query;
    let order = null;

    if (orderId) {
      order = await Order.findById(orderId).populate('items.productId');
    }

    res.render('user/paymentSuccess', {
      userName: req.session.userName || null,
      order: order
    });
  } catch (error) {
    console.error('Error loading payment success page:', error);
    res.render('user/paymentSuccess', {
      userName: req.session.userName || null,
      order: null
    });
  }
};

// Payment failure page
exports.paymentFailure = async (req, res) => {
  try {
    const { orderId, reason } = req.query;

    res.render('user/paymentFailure', {
      userName: req.session.userName || null,
      orderId: orderId || null,
      reason: reason || 'Payment was not completed'
    });
  } catch (error) {
    console.error('Error loading payment failure page:', error);
    res.render('user/paymentFailure', {
      userName: req.session.userName || null,
      orderId: null,
      reason: 'Payment failed'
    });
  }
};

// Helper function to process order after successful payment
async function processOrderAfterPayment(userId, cartItems, selectedAddress, paymentMethod, appliedOffer, paymentDetails = {}) {
  try {
    // Get address details
    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return { success: false, message: 'Address not found' };
    }

    const selectedAddr = addressDoc.address.find(addr => addr._id.toString() === selectedAddress);
    if (!selectedAddr) {
      return { success: false, message: 'Selected address not found' };
    }

    // Calculate totals and validate stock
    let subtotal = 0;
    let tax = 0;
    let shipping = 50;
    let discount = 0;
    const validItems = [];

    for (const item of cartItems) {
      const product = await Product.findById(item.productId._id).populate('category');
      if (!product) {
        console.warn('Product not found:', item.productId);
        continue;
      }
      if (product.quantity < item.quantity) {
        return { success: false, message: `Insufficient stock for ${product.productName}` };
      }
      if (product.isBlocked || !product.category.isListed || product.status === 'Out of Stock') {
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

      // Apply product or category offer
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

    if (!validItems.length) {
      return { success: false, message: 'No valid items in order' };
    }

    tax = subtotal * 0.05;

    // Apply offer discount if available
    let offerDiscount = 0;
    if (appliedOffer) {
      offerDiscount = appliedOffer.discountAmount || 0;
    }

    const total = subtotal + tax + shipping - discount - offerDiscount;

    // Create order
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
      razorpayPaymentId: paymentMethod === 'razorpay' ? paymentDetails.razorpayPaymentId : null,
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
    try { await applyReferralRewards(order); } catch (e) { console.error('Referral reward error (Razorpay):', e); }

    return { success: true, orderId: order._id, orderNumber: order.orderID };
  } catch (error) {
    console.error('Error processing order:', error);
    return { success: false, message: 'Internal server error' };
  }
}