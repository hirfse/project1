const Product = require('../../models/product.model');


// ================================
// HOME API
// ================================
exports.getAPIHome = async (req, res) => {
  try {
    console.log("➡️ [HOME] API called");

    const [newArrivals, trending] = await Promise.all([

      // New arrivals (latest)
      Product.find({
        isBlocked: false,
        status: "Available"
      })
        .sort({ createdAt: -1 })
        .limit(4)
        .lean(),

      // Trending (based on popularityScore)
      Product.find({
        isBlocked: false,
        status: "Available"
      })
        .sort({ popularityScore: -1, createdAt: -1 })
        .limit(4)
        .lean()

    ]);

    console.log("✅ Home newArrivals:", newArrivals.length);
    console.log("✅ Home trending:", trending.length);

    return res.status(200).json({
      success: true,
      data: {
        newArrivals,
        trending
      }
    });

  } catch (error) {
    console.error("❌ Home API error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load home data"
    });
  }
};



// ================================
// NEW ARRIVALS LIST PAGE
// ================================
exports.getAPINewArrivals = async (req, res) => {
  try {
    console.log("➡️ [NEW ARRIVALS] API called");

    const products = await Product.find({
      isBlocked: false,
      status: "Available"
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log("✅ New arrivals count:", products.length);

    return res.status(200).json({
      success: true,
      data: products
    });

  } catch (err) {
    console.error("❌ New arrivals API error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to load new arrivals"
    });
  }
};



// ================================
// TRENDING LIST PAGE
// ================================
exports.getAPITrendingProducts = async (req, res) => {
  try {
    console.log("➡️ [TRENDING] API called");

    const products = await Product.find({
      isBlocked: false,
      status: "Available"
    })
      .sort({ popularityScore: -1, createdAt: -1 })
      .limit(10)
      .lean();

    console.log("✅ Trending products count:", products.length);

    return res.status(200).json({
      success: true,
      data: products
    });

  } catch (err) {
    console.error("❌ Trending API error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to load trending products"
    });
  }
};