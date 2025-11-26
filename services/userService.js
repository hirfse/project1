const Product = require('../models/product.model');

async function getHomePageData() {
  const products = await Product.find().limit(4);
  return { products };
}

module.exports = {
  getHomePageData,
};
