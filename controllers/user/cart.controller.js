const HTTP_STATUS = require('../../constants/httpStatus');
const MESSAGES = require('../../constants/messages');
const Product = require('../../models/product.model');
const Cart = require('../../models/cart.model');
const Wishlist = require('../../models/wishlist.model');
const Category = require('../../models/category.model');
const mongoose = require('mongoose');

const MAX_QUANTITY_PER_PRODUCT = 10;

exports.addToCart = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.userId;
        const { quantity } = req.body;
        const qty = parseInt(quantity, 10);

        console.log('addToCart called with:', { productId, userId, quantity: qty });

        // Authentication check
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please login to add items to cart', redirect: '/login' });
        }

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.warn('Invalid product ID:', productId);
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        if (!qty || isNaN(qty) || qty < 1) {
            console.warn('Invalid quantity:', qty);
            return res.status(400).json({ success: false, message: 'Invalid quantity' });
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

        // Find or create cart
        let cart = await Cart.findOne({ userId });
        console.log('Cart found:', !!cart, 'Cart items count:', cart?.items?.length || 0);

        if (!cart) {
            console.log('Creating new cart for user:', userId);
            cart = new Cart({ userId, items: [] });
        }

        // Check if product is already in cart
        const cartItem = cart.items.find(item => item.productId.toString() === productId);
        console.log('Product in cart:', !!cartItem, 'Current quantity:', cartItem?.quantity);

        let newQuantity;
        if (cartItem) {
            // Check if increasing quantity exceeds stock or max limit
            newQuantity = cartItem.quantity + qty;
            if (newQuantity > product.quantity) {
                console.warn('Insufficient stock:', { requested: newQuantity, available: product.quantity });
                return res.status(400).json({ success: false, message: 'Insufficient stock' });
            }
            if (newQuantity > MAX_QUANTITY_PER_PRODUCT) {
                console.warn('Exceeds max quantity limit:', { requested: newQuantity, max: MAX_QUANTITY_PER_PRODUCT });
                return res.status(400).json({ success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` });
            }
            cartItem.quantity = newQuantity;
            console.log('Updated cart item quantity:', cartItem.quantity);
        } else {
            // Add new item to cart
            if (qty > product.quantity) {
                console.warn('Requested quantity exceeds stock:', { requested: qty, available: product.quantity });
                return res.status(400).json({ success: false, message: 'Insufficient stock' });
            }
            if (qty > MAX_QUANTITY_PER_PRODUCT) {
                console.warn('Requested quantity exceeds max limit:', { requested: qty, max: MAX_QUANTITY_PER_PRODUCT });
                return res.status(400).json({ success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` });
            }
            cart.items.push({ productId, quantity: qty });
            newQuantity = qty;
            console.log('Added new item to cart:', { productId, quantity: qty });
        }

        // Remove from wishlist if exists
        const wishlistUpdate = await Wishlist.updateOne(
            { userId },
            { $pull: { products: productId } }
        );
        console.log('Wishlist update result:', wishlistUpdate);

        await cart.save();
        console.log('Cart saved successfully');
        res.status(200).json({ success: true, message: 'Product added to cart' });
    } catch (error) {
        console.error('Error adding to cart:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Failed to add to cart. Please try again.' });
    }
};

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