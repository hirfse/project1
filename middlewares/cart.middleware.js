// middleware/cartMiddleware.js
const mongoose = require("mongoose");
const cartService = require("../services/cartService");

module.exports = async (req, res, next) => {
  try {

    // Skip if admin
    if (!req.session.user || req.session.user === "admin") {
      res.locals.cartCount = 0;
      return next();
    }

    // Validate ObjectId before DB query
    if (req.session.userId && mongoose.Types.ObjectId.isValid(req.session.userId)) {

      const cartData = await cartService.getCartData(req.session.userId);
      res.locals.cartCount = cartData?.cartCount || 0;

    } else {
      res.locals.cartCount = 0;
    }

    next();

  } catch (err) {
    console.error("Cart middleware error:", err);
    res.locals.cartCount = 0;
    next();
  }
};