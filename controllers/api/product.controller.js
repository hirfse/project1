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


// ================================
// SEARCH PRODUCTS
// ================================
exports.searchProducts = async (req, res) => {
  try {
    console.log("➡️ [SEARCH] API called");
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Product name is required for search'
      });
    }

    // build case-insensitive regex to match anywhere in the name
    const regex = new RegExp(name.trim(), 'i');

    const products = await Product.find({
      name: regex,
      isBlocked: false,
      status: 'Available'
    })
      .lean();

    console.log(`✅ Search results for "${name}":`, products.length);

    return res.status(200).json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error("❌ Search API error:", error);
    return res.status(500).json({
      success: false,
      message: 'Failed to perform product search'
    });
  }
};