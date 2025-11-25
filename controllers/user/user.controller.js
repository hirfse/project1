// user.controller.js
const HTTP_STATUS = require('../../constants/httpStatus');
const MESSAGES = require('../../constants/messages');
const User = require('../../models/user.model');
const Product = require('../../models/product.model');
const Review = require('../../models/review.model');
const bcrypt = require('bcrypt');
const Category = require('../../models/category.model');
const Subcategory = require('../../models/subcategory.model');
const Order = require('../../models/order.model');
const OfferService = require('../../services/offerService');
const mongoose = require('mongoose');
const ReferralOffer = require('../../models/referralOffer.model');


///////to genertate order id
//////////

 

////// landing page controller
/////////////////


//////////////////
/////profile controller
/////////////////




//productLitsing



const Cart = require('../../models/cart.model');
const Wishlist = require('../../models/wishlist.model'); // Assuming a wishlist model exists
const Offer = require('../../models/offer.model');
const Coupon = require('../../models/coupon.model');
const AdminCouponController = require('../admin/coupon.controller');
const MAX_QUANTITY_PER_PRODUCT = 10; // Define maximum quantity per product

// Add to Cart
// user.controller.js
exports.getProductDetailsJson = async (req, res) => {
    try {
        const productId = req.params.id;
        console.log('getProductDetailsJson called with productId:', productId);

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.warn('Invalid product ID:', productId);
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const product = await Product.findById(productId)
            .populate({ path: 'reviews', strictPopulate: false })
            .populate('category');

        if (!product) {
            console.warn('Product not found:', productId);
            return res.status(404).json({ success: false, message: 'Product not found' });
        }



        const response = {
            success: true,
            quantity: product.quantity,
            isBlocked: product.isBlocked,
            category: {
                isListed: product.category.isListed
            }
        };
        console.log('Sending response:', response);
        res.status(200).json(response);
    } catch (error) {
        console.error('Error fetching product details for JSON:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'An unexpected error occurred' });
    }
};



// Add to Cart from Product Listing (Enhanced with all requirements)
exports.addToCartFromListing = async (req, res) => {
    try {
        const { productId, quantity = 1 } = req.body;
        const userId = req.session.userId;

        console.log('addToCartFromListing called with:', { productId, userId, quantity });

        // Authentication check
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Please login to add items to cart',
                requiresLogin: true
            });
        }

        // Validate product ID
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid product ID'
            });
        }

        // Validate quantity
        const qty = parseInt(quantity);
        if (isNaN(qty) || qty < 1) {
            return res.status(400).json({
                success: false,
                error: 'Invalid quantity'
            });
        }

        // Check if product exists and is available
        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Check if product is blocked
        if (product.isBlocked) {
            return res.status(400).json({
                success: false,
                error: 'This product is currently unavailable'
            });
        }

        // Check if category is listed
        if (!product.category || !product.category.isListed) {
            return res.status(400).json({
                success: false,
                error: 'This product category is currently unavailable'
            });
        }

        // Stock validation
        if (product.quantity === 0 || product.status === 'Out of Stock') {
            return res.status(400).json({
                success: false,
                error: 'This product is currently out of stock'
            });
        }

        if (qty > product.quantity) {
            return res.status(400).json({
                success: false,
                error: `Only ${product.quantity} item${product.quantity === 1 ? '' : 's'} available`
            });
        }

        const MAX_QUANTITY_PER_PRODUCT = 10;
        if (qty > MAX_QUANTITY_PER_PRODUCT) {
            return res.status(400).json({
                success: false,
                error: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product`
            });
        }

        // Find or create cart
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        // Check if product is already in cart
        const cartItem = cart.items.find(item => item.productId.toString() === productId);
        let newQuantity = qty;

        if (cartItem) {
            // Update quantity if product is already in cart
            newQuantity = cartItem.quantity + qty;

            if (newQuantity > product.quantity) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot add ${qty} more. Only ${product.quantity - cartItem.quantity} items available`
                });
            }

            if (newQuantity > MAX_QUANTITY_PER_PRODUCT) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product`
                });
            }

            cartItem.quantity = newQuantity;
        } else {
            // Add new item to cart
            cart.items.push({ productId, quantity: qty });
        }

        // Remove from wishlist if exists
        await Wishlist.updateOne(
            { userId },
            { $pull: { products: productId } }
        );

        await cart.save();

        // Calculate cart totals for response
        const cartWithProducts = await Cart.findOne({ userId }).populate('items.productId');
        const cartCount = cartWithProducts.items.reduce((total, item) => total + item.quantity, 0);
        const cartTotal = cartWithProducts.items.reduce((total, item) => {
            return total + (item.quantity * item.productId.salePrice);
        }, 0);

        res.status(200).json({
            success: true,
            message: cartItem ?
                `Product quantity updated in cart (${newQuantity} total)` :
                'Product added to cart successfully',
            cartCount,
            cartTotal,
            productName: product.productName
        });

    } catch (error) {
        console.error('Error adding to cart from listing:', error);

        // Handle specific error types
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: 'Invalid data provided'
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                error: 'Invalid product ID format'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to add product to cart. Please try again.'
        });
    }
};

// Bulk Stock Check for Product Listing (Optimized)
exports.bulkStockCheck = async (req, res) => {
    try {
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Product IDs array is required'
            });
        }

        // Validate all product IDs
        const validProductIds = productIds.filter(id => mongoose.Types.ObjectId.isValid(id));

        if (validProductIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid product IDs provided'
            });
        }

        // Get stock information for all products in a single query
        const products = await Product.find({
            _id: { $in: validProductIds }
        }).populate('category').select('_id quantity status isBlocked category');

        // Format response data
        const stockData = {};
        products.forEach(product => {
            // Determine actual status based on quantity and product status
            let actualStatus = product.status;
            if (product.quantity === 0) {
                actualStatus = 'Out of Stock';
            } else if (product.status === 'Out of Stock' && product.quantity > 0) {
                actualStatus = 'Available';
            }

            stockData[product._id.toString()] = {
                quantity: product.quantity,
                status: actualStatus,
                isBlocked: product.isBlocked,
                categoryListed: product.category ? product.category.isListed : false,
                isAvailable: !product.isBlocked &&
                           product.category &&
                           product.category.isListed &&
                           product.quantity > 0 &&
                           actualStatus !== 'Out of Stock'
            };
        });

        // Add entries for products not found (they might be deleted)
        validProductIds.forEach(id => {
            if (!stockData[id]) {
                stockData[id] = {
                    quantity: 0,
                    status: 'Unavailable',
                    isBlocked: true,
                    categoryListed: false,
                    isAvailable: false
                };
            }
        });

        res.json({
            success: true,
            stockData,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in bulk stock check:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check stock status'
        });
    }
};

// Get Cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    const categories = await Category.find({ isListed: true });

    if (!cart || !cart.items.length) {
      return res.render('user/cart', {
        cart: { items: [] },
        userName: req.session.userName || null,
        error: 'Your cart is empty',
        categories
      });
    }

    // Filter out invalid items (blocked products, unlisted categories, or out of stock)
    const validItems = [];
    let hasStockIssue = false;
    for (const item of cart.items) {
      const product = await Product.findById(item.productId).populate('category');
      if (
        product &&
        !product.isBlocked &&
        product.category.isListed &&
        product.quantity > 0 &&
        product.status !== 'Out of Stock'
      ) {
        validItems.push({
          ...item._doc,
          isAvailable: item.quantity <= product.quantity,
          maxStock: product.quantity
        });
        if (item.quantity > product.quantity) {
          hasStockIssue = true;
        }
      }
    }

    // Update cart if any items were invalid
    if (validItems.length !== cart.items.length) {
      cart.items = validItems;
      await cart.save();
    }

    const cartCount = validItems.reduce((sum, it) => sum + (it.quantity || 0), 0);
    res.render('user/cart', {
      cart: { items: validItems },
      userName: req.session.userName || null,
      error: null,
      categories,
      cartCount,
      hasStockIssue
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).render('user/cart', {
      cart: { items: [] },
      userName: req.session.userName || null,
      error: 'Failed to load cart',
      categories: []
    });
  }
};

// Remove from Cart
exports.removeFromCart = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.session.userId;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: 'Product not found in cart' });
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();

    res.status(200).json({ success: true, message: 'Product removed from cart' });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ success: false, message: 'Failed to remove from cart' });
  }
};

// Update quantity for buy-now flow
exports.updateBuyNowQuantity = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.session.userId;

    console.log('updateBuyNowQuantity called with:', { productId, quantity, userId });

    if (!quantity || quantity < 1) {
      console.log('Invalid quantity:', quantity);
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      console.log('Invalid or missing product ID:', productId);
      return res.status(400).json({ success: false, message: 'Invalid or missing product ID' });
    }

    const product = await Product.findById(productId).populate('category');
    if (!product) {
      console.log('Product not found:', productId);
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const MAX_QUANTITY_PER_PRODUCT = 10;
    if (product.quantity < quantity) {
      console.log('Insufficient stock:', { requested: quantity, available: product.quantity });
      return res.status(400).json({ 
        success: false, 
        message: `Only ${product.quantity} item${product.quantity === 1 ? '' : 's'} available` 
      });
    }

    if (quantity > MAX_QUANTITY_PER_PRODUCT) {
      console.log('Exceeds max quantity:', { requested: quantity, max: MAX_QUANTITY_PER_PRODUCT });
      return res.status(400).json({ 
        success: false, 
        message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` 
      });
    }

    // Calculate prices for buy-now
    const itemTotal = quantity * product.salePrice;
    const subtotal = itemTotal;
    const tax = subtotal * 0.05; // 5% tax
    const shipping = subtotal > 1000 ? 0 : 50; // Free shipping for orders over 1000
    const discount = 0; // No discount applied by default
    const total = subtotal + tax + shipping - discount;

    // Update the buy-now product in session
    if (req.session.buyNowProduct) {
      req.session.buyNowProduct.quantity = quantity;
    }

    return res.json({
      success: true,
      message: 'Quantity updated successfully',
      data: {
        itemTotal: itemTotal.toFixed(2),
        quantity: quantity,
        priceSummary: {
          subtotal: subtotal.toFixed(2),
          tax: tax.toFixed(2),
          shipping: shipping.toFixed(2),
          discount: discount.toFixed(2),
          total: total.toFixed(2)
        },
        cartCount: 0 // No cart count update for buy now
      }
    });
  } catch (error) {
    console.error('Error in updateBuyNowQuantity:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Could not update quantity',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update quantity for cart items
exports.setCartQuantity = async (req, res) => {
  try {
    // Get productId from URL params or request body
    const productId = req.params.id || req.body.productId;
    const userId = req.session.userId;
    const { quantity, isBuyNow } = req.body;

    console.log('setCartQuantity called with:', { productId, quantity, userId, isBuyNow });

    if (!quantity || quantity < 1) {
      console.log('Invalid quantity:', quantity);
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      console.log('Invalid or missing product ID:', productId);
      return res.status(400).json({ success: false, message: 'Invalid or missing product ID' });
    }

    const product = await Product.findById(productId).populate('category');
    if (!product) {
      console.log('Product not found:', productId);
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const MAX_QUANTITY_PER_PRODUCT = 10;
    if (product.quantity < quantity) {
      console.log('Insufficient stock:', { requested: quantity, available: product.quantity });
      return res.status(400).json({ 
        success: false, 
        message: `Only ${product.quantity} item${product.quantity === 1 ? '' : 's'} available` 
      });
    }
    
    // Check if this is a Buy Now flow
    if (isBuyNow) {
      // For Buy Now, we don't need to update the cart
      // Just return the updated product info and calculated prices
      const itemTotal = quantity * product.salePrice;
      const subtotal = itemTotal;
      const tax = subtotal * 0.05; // 5% tax
      const shipping = subtotal > 1000 ? 0 : 50; // Free shipping for orders over 1000
      const discount = 0; // No discount applied by default
      const total = subtotal + tax + shipping - discount;

      return res.json({
        success: true,
        message: 'Quantity updated successfully',
        data: {
          itemTotal: itemTotal.toFixed(2),
          quantity: quantity,
          priceSummary: {
            subtotal: subtotal.toFixed(2),
            tax: tax.toFixed(2),
            shipping: shipping.toFixed(2),
            discount: discount.toFixed(2),
            total: total.toFixed(2)
          },
          cartCount: 0 // No cart count update for buy now
        }
      });
    }

    if (quantity > MAX_QUANTITY_PER_PRODUCT) {
      console.log('Exceeds max quantity:', { requested: quantity, max: MAX_QUANTITY_PER_PRODUCT });
      return res.status(400).json({ 
        success: false, 
        message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` 
      });
    }

    let subtotal, tax, shipping, discount, total, itemTotal, updatedItem;
    let cartCount = 0;

    if (isBuyNow) {
      // Handle Buy Now case
      console.log('Processing Buy Now update');
      
      // Calculate item total
      itemTotal = quantity * product.salePrice;
      
      // Calculate price summary for Buy Now
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
      
      // Create updated item for response
      updatedItem = {
        productId: product,
        quantity: quantity,
        _id: product._id // For consistency with cart response
      };
      
      // Update the session for Buy Now
      if (req.session.buyNowProduct) {
        req.session.buyNowProduct.quantity = quantity;
      }
      
      // Get cart count separately for the header
      const cart = await Cart.findOne({ userId });
      cartCount = cart ? cart.items.reduce((count, item) => count + item.quantity, 0) : 0;
    } else {
      // Handle Cart case
      let cart = await Cart.findOne({ userId });
      if (!cart) {
        console.log('Cart not found for user:', userId);
        return res.status(404).json({ success: false, message: 'Cart not found' });
      }

      const itemIndex = cart.items.findIndex(i => i.productId.toString() === productId);
      if (itemIndex === -1) {
        console.log('Item not in cart:', { productId, cartItems: cart.items });
        return res.status(404).json({ success: false, message: 'Item not in cart' });
      }

      // Update the quantity
      cart.items[itemIndex].quantity = quantity;
      
      // Save the cart
      await cart.save();
      console.log('Cart updated successfully');

      // Calculate the new totals
      const updatedCart = await Cart.findOne({ userId }).populate('items.productId');
      updatedItem = updatedCart.items.find(i => i.productId._id.toString() === productId);
      
      if (!updatedItem) {
        console.error('Failed to find updated item in cart after save');
        return res.status(500).json({ success: false, message: 'Failed to update cart' });
      }

      // Calculate all the price components
      subtotal = updatedCart.items.reduce((sum, it) => {
        return sum + (it.quantity * (it.productId?.salePrice || 0));
      }, 0);
      
      tax = subtotal * 0.05; // 5% tax as shown in the frontend
      shipping = subtotal > 1000 ? 0 : 50; // Free shipping for orders over 1000
      discount = 0; // You can add discount calculation here if needed
      total = subtotal + tax + shipping - discount;
      
      itemTotal = updatedItem.quantity * updatedItem.productId.salePrice;
      cartCount = updatedCart.items.reduce((count, item) => count + item.quantity, 0);
    }
    
    console.log('Price calculation:', { 
      subtotal, 
      tax, 
      shipping, 
      discount, 
      total,
      isBuyNow,
      itemTotal,
      quantity: updatedItem.quantity
    });

    res.json({ 
      success: true, 
      message: 'Quantity updated successfully',
      data: {
        itemTotal: itemTotal.toFixed(2),
        quantity: updatedItem.quantity,
        priceSummary: {
          subtotal: subtotal.toFixed(2),
          tax: tax.toFixed(2),
          shipping: shipping.toFixed(2),
          discount: discount.toFixed(2),
          total: total.toFixed(2)
        },
        cartCount: cartCount
      }
    });
  } catch (err) {
    console.error('Error in setCartQuantity:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Could not update cart',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Update Cart Quantity (Increment/Decrement)
exports.adjustCartQuantity = async (req, res) => {
  try {
    const productId = req.params.id;
    const { action } = req.body; // 'increment' or 'decrement'
    const userId = req.session.userId;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    if (!['increment', 'decrement'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const cartItem = cart.items.find(item => item.productId.toString() === productId);
    if (!cartItem) {
      return res.status(404).json({ success: false, message: 'Product not found in cart' });
    }

    const product = await Product.findById(productId).populate('category');
    if (!product || product.isBlocked || !product.category.isListed || product.quantity === 0 || product.status === 'Out of Stock') {
      // Remove item from cart if it's invalid
      cart.items = cart.items.filter(item => item.productId.toString() !== productId);
      await cart.save();
      return res.status(400).json({ success: false, message: 'Product is unavailable' });
    }

    if (action === 'increment') {
      if (cartItem.quantity >= product.quantity) {
        return res.status(400).json({ success: false, message: 'Insufficient stock' });
      }
      if (cartItem.quantity >= MAX_QUANTITY_PER_PRODUCT) {
        return res.status(400).json({ success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` });
      }
      cartItem.quantity += 1;
    } else if (action === 'decrement') {
      if (cartItem.quantity <= 1) {
        cart.items = cart.items.filter(item => item.productId.toString() !== productId);
      } else {
        cartItem.quantity -= 1;
      }
    }

    await cart.save();
    res.status(200).json({ success: true, message: 'Cart updated successfully' });
  } catch (error) {
    console.error('Error updating cart quantity:', error);
    res.status(500).json({ success: false, message: 'Failed to update cart' });
  }
};

//////////
/////wishlist controller
//////////




// Checkout Page


//razorpay



exports.getCustomList = (req,res) =>{
    res.render('user/custom')
}

// Coming Soon Pages
exports.getCustomPage = (req, res) => {
    res.render('user/custom', {
        userName: req.session.userName || null
    });
};

exports.getAboutPage = (req, res) => {
    res.render('user/about', {
        userName: req.session.userName || null
    });
};

exports.getContactPage = (req, res) => {
    res.render('user/contact', {
        userName: req.session.userName || null
    });
};

// Apply offer during checkout


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

// Helper to generate OTP
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000);
}

exports.handleLogout = (req,res) =>{
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.redirect('/home');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
}

// Wallet Management
// Generate or return the current user's referral code and share link
exports.getReferralCode = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (!user.referralCode) {
            const base = (user.fullName || 'USER').replace(/\s+/g, '').slice(0, 4).toUpperCase();
            let code;
            do {
                const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
                code = `${base}${rand}`;
            } while (await User.exists({ referralCode: code }));
            user.referralCode = code;
            await user.save();
        }

        const link = `${req.protocol}://${req.get('host')}/r/${user.referralCode}`;
        return res.json({ success: true, code: user.referralCode, link });
    } catch (error) {
        console.error('Error getting referral code:', error);
        return res.status(500).json({ success: false, message: 'Failed to get referral code' });
    }
};

exports.getWallet = async (req, res) => {
    try {
        const userId = req.session.userId;
        const categories = await Category.find({ isListed: true });

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Transactions per page

        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
            await wallet.save();
        }

        // Sort transactions by date (newest first)
        const sortedTransactions = wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Calculate pagination
        const totalTransactions = sortedTransactions.length;
        const totalPages = Math.ceil(totalTransactions / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        // Get paginated transactions
        const paginatedTransactions = sortedTransactions.slice(startIndex, endIndex);

        res.render('user/wallet', {
            wallet: {
                balance: wallet.balance,
                transactions: paginatedTransactions
            },
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalTransactions: totalTransactions,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page + 1,
                prevPage: page - 1
            },
            userName: req.session.userName || null,
            categories,
            error: null
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.render('user/wallet', {
            wallet: { balance: 0, transactions: [] },
            pagination: {
                currentPage: 1,
                totalPages: 0,
                totalTransactions: 0,
                hasNextPage: false,
                hasPrevPage: false
            },
            userName: req.session.userName || null,
            categories: await Category.find({ isListed: true }),
            error: 'Failed to load wallet information'
        });
    }
};

// Helper function to process Razorpay refund
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

// Helper function to process wallet refund


// Export the module
module.exports = exports;
