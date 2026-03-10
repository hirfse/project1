// middleware/cartMiddleware.js
const mongoose = require("mongoose");
const cartService = require("../services/cartService");

module.exports = async (req, res, next) => {
  try {

    const userId = req.session.userId;

    // Skip if no user or invalid ObjectId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      res.locals.cartCount = 0;
      return next();
    }

    const cartData = await cartService.getCartData(userId);

    res.locals.cartCount = cartData?.cartCount || 0;

    next();

  } catch (err) {
    console.error("Cart middleware error:", err);
    res.locals.cartCount = 0;
    next();
  }
};