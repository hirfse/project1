const Coupon = require('../models/coupon.model');
const Product = require('../models/product.model');
const Category = require('../models/category.model');

async function listCouponsPageData() {
  const coupons = await Coupon.find({})
    .populate('applicableProducts', 'productName')
    .populate('applicableCategories', 'name')
    .sort({ createdAt: -1 })
    .lean();
  const categories = await Category.find({ isListed: true }).select('name').lean();
  const products = await Product.find({ isBlocked: false }).select('productName').lean();
  return { coupons, categories, products };
}

async function addCoupon(payload) {
  const {
    code, discountType, discountNumber, maxDiscount, minPurchase,
    startDate, endDate, usageLimit, perUserUse, isActive, applicableType,
    applicableProducts, applicableCategories
  } = payload;

  if (!code || !discountType || !discountNumber || !maxDiscount || !minPurchase || !startDate || !endDate || !usageLimit) {
    return { success: false, message: 'All fields are required' };
  }

  const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (existingCoupon) {
    return { success: false, message: 'Coupon code already exists' };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start >= end) {
    return { success: false, message: 'End date must be after start date' };
  }

  let processedProducts = [];
  let processedCategories = [];
  if (applicableType === 'products' && applicableProducts) {
    processedProducts = Array.isArray(applicableProducts) ? applicableProducts : [applicableProducts];
  }
  if (applicableType === 'categories' && applicableCategories) {
    processedCategories = Array.isArray(applicableCategories) ? applicableCategories : [applicableCategories];
  }

  const newCoupon = new Coupon({
    code: code.toUpperCase(),
    discountType,
    discountNumber: parseFloat(discountNumber),
    maxDiscount: parseFloat(maxDiscount),
    minPurchase: parseFloat(minPurchase),
    startDate: start,
    endDate: end,
    usageLimit: parseInt(usageLimit),
    perUserUse: perUserUse !== undefined && perUserUse !== '' ? parseInt(perUserUse) : 0,
    isActive: isActive === 'on' || isActive === true,
    isBlocked: false,
    applicableType: applicableType || 'all',
    applicableProducts: processedProducts,
    applicableCategories: processedCategories,
    usedBy: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await newCoupon.save();
  return { success: true, message: 'Coupon added successfully' };
}

async function getCouponDetails(id) {
  const coupon = await Coupon.findById(id)
    .populate('applicableProducts', 'productName')
    .populate('applicableCategories', 'name')
    .lean();
  if (!coupon) return { success: false, message: 'Coupon not found' };
  return { success: true, coupon };
}

async function updateCoupon(id, data) {
  const { code, discountType, discountNumber, maxDiscount, minPurchase, startDate, endDate, usageLimit, perUserUse, isActive } = data;
  const coupon = await Coupon.findById(id);
  if (!coupon) return { success: false, message: 'Coupon not found' };

  if (!code || !discountType || !discountNumber || !maxDiscount || !minPurchase || !startDate || !endDate || !usageLimit) {
    return { success: false, message: 'All fields are required' };
  }

  const existingCoupon = await Coupon.findOne({ code: code.toUpperCase(), _id: { $ne: id } });
  if (existingCoupon) return { success: false, message: 'Coupon code already exists' };

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start >= end) return { success: false, message: 'End date must be after start date' };

  coupon.code = code.toUpperCase();
  coupon.discountType = discountType;
  coupon.discountNumber = parseFloat(discountNumber);
  coupon.maxDiscount = parseFloat(maxDiscount);
  coupon.minPurchase = parseFloat(minPurchase);
  coupon.startDate = start;
  coupon.endDate = end;
  coupon.usageLimit = parseInt(usageLimit);
  coupon.perUserUse = perUserUse !== undefined && perUserUse !== '' ? parseInt(perUserUse) : 0;
  coupon.isActive = isActive === 'on' || isActive === true;
  coupon.updatedAt = new Date();
  await coupon.save();

  return { success: true, message: 'Coupon updated successfully' };
}

async function deleteCoupon(id) {
  const coupon = await Coupon.findById(id);
  if (!coupon) return { success: false, message: 'Coupon not found' };
  await Coupon.findByIdAndDelete(id);
  return { success: true, message: 'Coupon deleted successfully' };
}

async function toggleCouponStatus(id) {
  const coupon = await Coupon.findById(id);
  if (!coupon) return { success: false, message: 'Coupon not found' };
  coupon.isBlocked = !coupon.isBlocked;
  coupon.updatedAt = new Date();
  await coupon.save();
  const status = coupon.isBlocked ? 'blocked' : 'unblocked';
  return { success: true, message: `Coupon ${status} successfully` };
}

module.exports = {
  listCouponsPageData,
  addCoupon,
  getCouponDetails,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
};
