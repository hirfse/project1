// middleware/cartMiddleware.js
const cartService = require('../services/cartService');

module.exports = async (req, res, next) => {
  try {
    if (req.session.userId) {
      const cartData = await cartService.getCartData(req.session.userId);
      res.locals.cartCount = cartData.cartCount || 0;
    } else {
      res.locals.cartCount = 0;
    }
    next();
  } catch (err) {
    console.error('Cart middleware error:', err);
    res.locals.cartCount = 0;
    next();
  }
};
