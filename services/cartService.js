const mongoose = require('mongoose');
const Product = require('../models/product.model');
const Cart = require('../models/cart.model');
const Wishlist = require('../models/wishlist.model');

const MAX_QUANTITY_PER_PRODUCT = 10;

async function addToCart(userId, productId, quantity) {
  if (!userId) return { success: false, code: 401, message: 'Please login to add items to cart', redirect: '/login' };
  if (!mongoose.Types.ObjectId.isValid(productId)) return { success: false, message: 'Invalid product ID' };
  const qty = parseInt(quantity, 10);
  if (!qty || isNaN(qty) || qty < 1) return { success: false, message: 'Invalid quantity' };

  const product = await Product.findById(productId).populate('category');
  if (!product) return { success: false, code: 404, message: 'Product not found' };
  if (!product.category || product.isBlocked || product.category.isBlocked || !product.category.isListed) {
    return { success: false, message: 'Product or its category is blocked or unlisted' };
  }
  if (product.quantity === 0 || product.status === 'Out of Stock') return { success: false, message: 'Product is out of stock' };

  let cart = await Cart.findOne({ userId });
  if (!cart) cart = new Cart({ userId, items: [] });

  const cartItem = cart.items.find(i => i.productId.toString() === productId);
  let newQuantity;
  if (cartItem) {
    newQuantity = cartItem.quantity + qty;
    if (newQuantity > product.quantity) return { success: false, message: 'Insufficient stock' };
    if (newQuantity > MAX_QUANTITY_PER_PRODUCT) return { success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` };
    cartItem.quantity = newQuantity;
  } else {
    if (qty > product.quantity) return { success: false, message: 'Insufficient stock' };
    if (qty > MAX_QUANTITY_PER_PRODUCT) return { success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` };
    cart.items.push({ productId, quantity: qty });
  }

  await Wishlist.updateOne({ userId }, { $pull: { products: productId } });
  await cart.save();
  return { success: true, message: 'Product added to cart' };
}

async function getCartData(userId) {
  const cart = await Cart.findOne({ userId }).populate('items.productId');
  if (!cart || !cart.items.length) return { success: true, items: [], hasStockIssue: false };
  const validItems = [];
  let hasStockIssue = false;
  for (const item of cart.items) {
    const product = await Product.findById(item.productId).populate('category');
    if (product && !product.isBlocked && product.category.isListed && product.quantity > 0 && product.status !== 'Out of Stock') {
      validItems.push({ ...item._doc, isAvailable: item.quantity <= product.quantity, maxStock: product.quantity });
      if (item.quantity > product.quantity) hasStockIssue = true;
    }
  }
  if (validItems.length !== cart.items.length) {
    cart.items = validItems;
    await cart.save();
  }
  const cartCount = validItems.reduce((sum, it) => sum + (it.quantity || 0), 0);
  return { success: true, items: validItems, hasStockIssue, cartCount };
}

async function removeFromCart(userId, productId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) return { success: false, message: 'Invalid product ID' };
  const cart = await Cart.findOne({ userId });
  if (!cart) return { success: false, code: 404, message: 'Cart not found' };
  const idx = cart.items.findIndex(i => i.productId.toString() === productId);
  if (idx === -1) return { success: false, code: 404, message: 'Product not found in cart' };
  cart.items.splice(idx, 1);
  await cart.save();
  return { success: true, message: 'Product removed from cart' };
}

async function setCartQuantity({ userId, productId, quantity, isBuyNow, appliedOffer }) {
  if (!quantity || quantity < 1) return { success: false, message: 'Invalid quantity' };
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) return { success: false, message: 'Invalid or missing product ID' };
  const product = await Product.findById(productId).populate('category');
  if (!product) return { success: false, code: 404, message: 'Product not found' };
  if (product.quantity < quantity) return { success: false, message: `Only ${product.quantity} item${product.quantity === 1 ? '' : 's'} available` };

  if (isBuyNow) {
    // Calculate buy now pricing (no cart updates)
    const itemTotal = quantity * product.salePrice;
    const subtotal = itemTotal;
    const tax = subtotal * 0.05;
    const shipping = subtotal > 1000 ? 0 : 50;
    let discount = 0;
    const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
    const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
    discount = Math.max(productDiscount, categoryDiscount);
    const offerDiscount = appliedOffer ? (appliedOffer.discountAmount || 0) : 0;
    const total = subtotal + tax + shipping - discount - offerDiscount;
    return {
      success: true,
      data: {
        itemTotal: itemTotal.toFixed(2),
        quantity,
        priceSummary: { subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), shipping: shipping.toFixed(2), discount: discount.toFixed(2), total: total.toFixed(2) },
        cartCount: 0,
      }
    };
  }

  if (quantity > MAX_QUANTITY_PER_PRODUCT) return { success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` };

  let cart = await Cart.findOne({ userId });
  if (!cart) return { success: false, code: 404, message: 'Cart not found' };
  const itemIndex = cart.items.findIndex(i => i.productId.toString() === productId);
  if (itemIndex === -1) return { success: false, code: 404, message: 'Item not in cart' };

  cart.items[itemIndex].quantity = quantity;
  await cart.save();

  const updatedCart = await Cart.findOne({ userId }).populate('items.productId');
  const updatedItem = updatedCart.items.find(i => i.productId._id.toString() === productId);
  if (!updatedItem) return { success: false, message: 'Failed to update cart' };

  const subtotal = updatedCart.items.reduce((sum, it) => sum + (it.quantity * (it.productId?.salePrice || 0)), 0);
  const tax = subtotal * 0.05;
  const shipping = subtotal > 1000 ? 0 : 50;
  const discount = 0;
  const total = subtotal + tax + shipping - discount;
  const itemTotal = updatedItem.quantity * updatedItem.productId.salePrice;
  const cartCount = updatedCart.items.reduce((count, item) => count + item.quantity, 0);
  return {
    success: true,
    data: {
      itemTotal: itemTotal.toFixed(2),
      quantity: updatedItem.quantity,
      priceSummary: { subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), shipping: shipping.toFixed(2), discount: discount.toFixed(2), total: total.toFixed(2) },
      cartCount,
    }
  };
}

async function adjustCartQuantity(userId, productId, action) {
  if (!mongoose.Types.ObjectId.isValid(productId)) return { success: false, message: 'Invalid product ID' };
  if (!['increment', 'decrement'].includes(action)) return { success: false, message: 'Invalid action' };
  const cart = await Cart.findOne({ userId });
  if (!cart) return { success: false, code: 404, message: 'Cart not found' };
  const cartItem = cart.items.find(item => item.productId.toString() === productId);
  if (!cartItem) return { success: false, code: 404, message: 'Product not found in cart' };
  const product = await Product.findById(productId).populate('category');
  if (!product || product.isBlocked || !product.category.isListed || product.quantity === 0 || product.status === 'Out of Stock') {
    cart.items = cart.items.filter(item => item.productId.toString() !== productId);
    await cart.save();
    return { success: false, message: 'Product is unavailable' };
  }
  if (action === 'increment') {
    if (cartItem.quantity >= product.quantity) return { success: false, message: 'Insufficient stock' };
    if (cartItem.quantity >= MAX_QUANTITY_PER_PRODUCT) return { success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` };
    cartItem.quantity += 1;
  } else {
    if (cartItem.quantity <= 1) cart.items = cart.items.filter(item => item.productId.toString() !== productId);
    else cartItem.quantity -= 1;
  }
  await cart.save();
  return { success: true, message: 'Cart updated successfully' };
}

module.exports = {
  addToCart,
  getCartData,
  removeFromCart,
  setCartQuantity,
  adjustCartQuantity,
};
