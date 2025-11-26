const Product = require('../models/product.model');
const Category = require('../models/category.model');
const Subcategory = require('../models/subcategory.model');
const Cart = require('../models/cart.model');
const OfferService = require('./offerService');

async function getProductListingData(params, session) {
  const { page = 1, category, subCategory, sort, search, minPrice, maxPrice } = params;
  const itemsPerPage = 8;
  const query = { isBlocked: false };
  if (category && category.trim() !== '') query.category = category;
  if (subCategory && subCategory.trim() !== '') query.subCategory = subCategory.trim();
  if (search && search.trim() !== '') query.productName = { $regex: search.trim(), $options: 'i' };
  if (minPrice || maxPrice) {
    query.salePrice = {};
    if (minPrice && !isNaN(parseFloat(minPrice))) query.salePrice.$gte = parseFloat(minPrice);
    if (maxPrice && !isNaN(parseFloat(maxPrice))) query.salePrice.$lte = parseFloat(maxPrice);
  }
  const listedCategories = await Category.find({ isListed: true }).select('_id');
  const listedCategoryIds = listedCategories.map(c => c._id);
  query.category = query.category ? query.category : { $in: listedCategoryIds };
  let sortOption = {};
  if (sort === 'price_asc') sortOption.salePrice = 1;
  else if (sort === 'price_desc') sortOption.salePrice = -1;
  else if (sort === 'name_asc') sortOption.productName = 1;
  else if (sort === 'name_desc') sortOption.productName = -1;
  else if (sort === 'ratings') sortOption.averageRating = -1;
  else if (sort === 'newest') sortOption.createdAt = -1;
  else if (sort === 'oldest') sortOption.createdAt = 1;
  else if (sort === 'featured') sortOption.isFeatured = -1;
  else sortOption.createdAt = -1;
  const totalProducts = await Product.countDocuments(query);
  const totalPages = Math.ceil(totalProducts / itemsPerPage);
  const products = await Product.find(query)
    .collation({ locale: 'en', strength: 2 })
    .populate('category')
    .sort(sortOption)
    .skip((page - 1) * itemsPerPage)
    .limit(itemsPerPage);
  const filteredProducts = products.filter(p => p.category && p.category.isListed);
  const productsWithOffers = await OfferService.applyOffersToProducts(filteredProducts);
  const userId = session?.userId;
  const cart = await Cart.findOne({ userId });
  const cartProductIds = cart ? cart.items.map(i => i.productId.toString()) : [];
  const cartCount = cart ? cart.items.reduce((sum, it) => sum + (it.quantity || 0), 0) : 0;
  const categories = await Category.find();
  let subcategories = [];
  if (category) {
    subcategories = await Subcategory.find({ category, isActive: true }).sort({ name: 1 });
  }
  return {
    productsWithOffers,
    totalPages,
    categories,
    subcategories,
    cartProductIds,
    cartCount,
  };
}

async function getProductDetailsData(productId, session) {
  const product = await Product.findById(productId)
    .populate({ path: 'reviews', strictPopulate: false })
    .populate('category');
  if (!product || !product.category) return { ok: false, reason: 'NOT_FOUND' };
  if (product.isBlocked || product.category.isBlocked || !product.category.isListed) return { ok: false, reason: 'UNAVAILABLE' };
  const relatedProducts = await Product.find({
    category: product.category._id,
    _id: { $ne: productId },
    isBlocked: false,
  }).populate('category').limit(4);
  const filteredRelated = relatedProducts.filter(p => p.category && p.category.isListed);
  const productWithOffer = await OfferService.calculateDiscountedPrice(product);
  const relatedProductsWithOffers = await OfferService.applyOffersToProducts(filteredRelated);
  const cart = await Cart.findOne({ userId: session?.userId });
  const cartProductIds = cart ? cart.items.map(i => i.productId.toString()) : [];
  const cartCount = cart ? cart.items.reduce((sum, it) => sum + (it.quantity || 0), 0) : 0;
  return {
    ok: true,
    productWithOffer,
    relatedProductsWithOffers,
    product,
    cartProductIds,
    cartCount,
  };
}

module.exports = {
  getProductListingData,
  getProductDetailsData,
};
