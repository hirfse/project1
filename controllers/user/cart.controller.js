const Product = require('../../models/product.model');
const User = require('../../models/user.model');
const Cart = require('../../models/cart.model');
const Wishlist = require('../../models/wishlist.model');
const Category = require('../../models/category.model');
const mongoose = require('mongoose');
const cartService = require('../../services/cartService');

const MAX_QUANTITY_PER_PRODUCT = 10;

exports.addToCart = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.session.userId;
    const { quantity } = req.body;
    const result = await cartService.addToCart(userId, productId, quantity);
    if (!result.success) {
      const status = result.code === 401 ? 401 : (result.code === 404 ? 404 : 400);
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error adding to cart:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Failed to add to cart. Please try again.' });
  }
};

exports.getCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const categories = await Category.find({ isListed: true });
    const data = await cartService.getCartData(userId);

    let userUser = null;
    if (userId) {
      const userDoc = await User.findById(userId).lean();
      if (userDoc) {
        userUser = {
          userName: userDoc.fullName,
          userProfile: userDoc.profileImage // can be null
        };
      }
    }

    if (!data.items || data.items.length === 0) {
      return res.render('user/cart', {
        cart: { items: [] },
        userName: req.session.userName || null,
        user: userUser,
        error: 'Your cart is empty',
        categories
      });
    }
    res.render('user/cart', {
      cart: { items: data.items },
      userName: req.session.userName || null,
      user: userUser,
      error: null,
      categories,
      cartCount: data.cartCount,
      hasStockIssue: data.hasStockIssue
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).render('user/cart', {
      cart: { items: [] },
      userName: req.session.userName || null,
      user: null,
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
    const result = await cartService.removeFromCart(userId, productId);
    if (!result.success) {
      const status = result.code === 404 ? 404 : 400;
      return res.status(status).json(result);
    }
    res.status(200).json(result);
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
    const productId = req.params.id || req.body.productId;
    const userId = req.session.userId;
    const { quantity, isBuyNow } = req.body;
    const result = await cartService.setCartQuantity({ userId, productId, quantity, isBuyNow, appliedOffer: req.session.appliedOffer });
    if (!result.success) {
      const status = result.code === 404 ? 404 : 400;
      return res.status(status).json(result);
    }
    return res.json({ success: true, message: 'Quantity updated successfully', data: result.data });
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
    const result = await cartService.adjustCartQuantity(userId, productId, action);
    if (!result.success) {
      const status = result.code === 404 ? 404 : 400;
      return res.status(status).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('Error updating cart quantity:', error);
    res.status(500).json({ success: false, message: 'Failed to update cart' });
  }
};