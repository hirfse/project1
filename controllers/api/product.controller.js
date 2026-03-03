const Product = require('../../models/product.model')

exports.getAPINewArrivals = async (req, res) => {
  try {
    const products = await Product.find({ isBlocked: false })
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      data: products
    });

  } catch (err) {
    res.status(500).json({ success:false });
  }
};

exports.getAPIFeaturedProducts = async (req, res) => {
  try {

    const products = await Product.find({
      isBlocked: false,
      isFeatured: true
    })
    .limit(20);

    res.status(200).json({
      success: true,
      data: products
    });

  } catch (err) {
    res.status(500).json({ success:false });
  }
};