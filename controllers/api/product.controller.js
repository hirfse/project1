const Product = require('../../models/product.model');
const Review = require('../../models/review.model')


// ================================
// HOME API
// ================================
exports.getAPIHome = async (req, res) => {
  try {
    console.log("➡️ [HOME] API called");

    const [newArrivals, trending, featuredCollection] = await Promise.all([

      // 1️⃣ New Arrivals (latest products)
      Product.find({
        isBlocked: false,
        status: "Available"
      })
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),

      // 2️⃣ Trending (based on popularityScore)
      Product.find({
        isBlocked: false,
        status: "Available"
      })
        .sort({ popularityScore: -1 })
        .limit(4)
        .lean(),

      // 3️⃣ Featured Collection (sorted by price - Low to High)
      Product.find({
        isBlocked: false,
        status: "Available",
      })
        .sort({ salePrice: 1 })  // 1 = Low → High, -1 = High → Low
        .limit(6)
        .lean()

    ]);

    console.log("✅ Home newArrivals:", newArrivals.length);
    console.log("✅ Home trending:", trending.length);
    console.log("✅ Home featured:", featuredCollection.length);

    return res.status(200).json({
      success: true,
      data: {
        newArrivals,
        trending,
        featuredCollection
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

    // Accept name from POST body or from query params (?search= or ?name=)
    const name = (req.body && req.body.name) || req.query.search || req.query.name;

    // Debug mode: return a sample of available products to inspect stored names/status
    if (req.query.debug === '1' || req.query._debug === '1') {
      const samples = await Product.find({ isBlocked: false })
        .select('productName status isBlocked')
        .limit(20)
        .lean();
      return res.status(200).json({ success: true, debug: true, count: samples.length, samples });
    }

    // Deeper debug: run the regex match with and without filters and return counts/samples
    if (req.query.debug === '2') {
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ success: false, message: 'Product name is required for debug search' });
      }
      const termDebug = name.trim();
      const regexDebug = new RegExp(termDebug, 'i');
      const withFilters = await Product.find({ productName: regexDebug, isBlocked: false, status: 'Available' }).select('productName status isBlocked').limit(50).lean();
      const withoutStatus = await Product.find({ productName: regexDebug, isBlocked: false }).select('productName status isBlocked').limit(50).lean();
      const withoutBlocked = await Product.find({ productName: regexDebug }).select('productName status isBlocked').limit(50).lean();
      return res.status(200).json({
        success: true,
        debug: 2,
        term: termDebug,
        counts: {
          withFilters: withFilters.length,
          withoutStatus: withoutStatus.length,
          withoutBlocked: withoutBlocked.length
        },
        samples: {
          withFilters: withFilters.slice(0, 10),
          withoutStatus: withoutStatus.slice(0, 10),
          withoutBlocked: withoutBlocked.slice(0, 10)
        }
      });
    }

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Product name is required for search'
      });
    }

    const term = name.trim();
    // build case-insensitive regex to match anywhere in the name
    const regex = new RegExp(term, 'i');

    const includeUnavailable = req.query.includeUnavailable === '1' || req.query.includeUnavailable === 'true' ||
      req.body && (req.body.includeUnavailable === true || req.body.includeUnavailable === '1' || req.body.includeUnavailable === 'true');

    const query = {
      productName: regex
    };

    // always exclude blocked products unless explicitly overridden (rare)
    query.isBlocked = false;

    // if includeUnavailable is not set, restrict to Available status only
    if (!includeUnavailable) query.status = 'Available';

    const products = await Product.find(query).lean();

    console.log(`✅ Search results for "${term}":`, products.length);

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

// ================================
// EXPLORE PAGE
// ================================

exports.getExplore = async (req,res) => {
  try{
    console.log(" [EXPLORE] API called...!")
    const products = await Product.find().lean()
    return res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  }catch(error){
    console.error("❌ EXPLORE API error:", error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get explore page'
    });
  }
}

// ================================
// PRODUCT DETAIL PAGE
// ================================
exports.getProductDetail = async(req,res) => {
  try{
    const id = req.params.id
    const product = await Product.findById(id)

    return res.status(200).json({
      success:true,
      product:product
    })

  }catch(error){
    console.error(' PRODUCT DETAIL API error:',error);
    return res.status(500).json({
      success:false,
      message: "Product not found"
    })
  }
}

// ================================
// ADD REVIEW
// ================================

exports.addReview = async (req,res) => {
  try{
    console.log(req.body.userName)

  }catch(error){

  }
}