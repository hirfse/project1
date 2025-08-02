const Coupon = require('../../models/coupon.model');
const Product = require('../../models/product.model');
const Category = require('../../models/category.model');

// Get coupon management page
exports.getCouponManagement = async (req, res) => {
  try {
    const coupons = await Coupon.find({})
      .populate('applicableProducts', 'productName')
      .populate('applicableCategories', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const categories = await Category.find({ isListed: true }).select('name').lean();
    const products = await Product.find({ isBlocked: false }).select('productName').lean();

    res.render('admin/coupon', { coupons, categories, products });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.redirect('/admin/adminHome');
  }
};

// Add new coupon
exports.addCoupon = async (req, res) => {
  try {
    const {
      code, discountType, discountNumber, maxDiscount, minPurchase,
      startDate, endDate, usageLimit, isActive, applicableType,
      applicableProducts, applicableCategories
    } = req.body;

    // Validate required fields
    if (!code || !discountType || !discountNumber || !maxDiscount || !minPurchase || !startDate || !endDate || !usageLimit) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (start >= end) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    // Process applicable products and categories
    let processedProducts = [];
    let processedCategories = [];

    if (applicableType === 'products' && applicableProducts) {
      processedProducts = Array.isArray(applicableProducts) ? applicableProducts : [applicableProducts];
    }

    if (applicableType === 'categories' && applicableCategories) {
      processedCategories = Array.isArray(applicableCategories) ? applicableCategories : [applicableCategories];
    }

    // Create new coupon
    const newCoupon = new Coupon({
      code: code.toUpperCase(),
      discountType,
      discountNumber: parseFloat(discountNumber),
      maxDiscount: parseFloat(maxDiscount),
      minPurchase: parseFloat(minPurchase),
      startDate: start,
      endDate: end,
      usageLimit: parseInt(usageLimit),
      isActive: isActive === 'on' || isActive === true,
      isBlocked: false,
      applicableType: applicableType || 'all',
      applicableProducts: processedProducts,
      applicableCategories: processedCategories,
      usedBy: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newCoupon.save();
    res.status(200).json({ success: true, message: 'Coupon added successfully' });

  } catch (error) {
    console.error('Error adding coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to add coupon' });
  }
};

// Get coupon details
exports.getCouponDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id)
      .populate('applicableProducts', 'productName')
      .populate('applicableCategories', 'name')
      .lean();

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    res.status(200).json({ success: true, coupon });
  } catch (error) {
    console.error('Error fetching coupon details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch coupon details' });
  }
};

// Update coupon
exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, discountType, discountNumber, maxDiscount, minPurchase, startDate, endDate, usageLimit, isActive } = req.body;

    // Find the coupon
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    // Validate required fields
    if (!code || !discountType || !discountNumber || !maxDiscount || !minPurchase || !startDate || !endDate || !usageLimit) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check if coupon code already exists (excluding current coupon)
    const existingCoupon = await Coupon.findOne({ 
      code: code.toUpperCase(),
      _id: { $ne: id }
    });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    // Update coupon
    coupon.code = code.toUpperCase();
    coupon.discountType = discountType;
    coupon.discountNumber = parseFloat(discountNumber);
    coupon.maxDiscount = parseFloat(maxDiscount);
    coupon.minPurchase = parseFloat(minPurchase);
    coupon.startDate = start;
    coupon.endDate = end;
    coupon.usageLimit = parseInt(usageLimit);
    coupon.isActive = isActive === 'on' || isActive === true;
    coupon.updatedAt = new Date();

    await coupon.save();
    res.status(200).json({ success: true, message: 'Coupon updated successfully' });

  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to update coupon' });
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    await Coupon.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Coupon deleted successfully' });

  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to delete coupon' });
  }
};

// Toggle coupon status
exports.toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    coupon.isBlocked = !coupon.isBlocked;
    coupon.updatedAt = new Date();
    await coupon.save();

    const status = coupon.isBlocked ? 'blocked' : 'unblocked';
    res.status(200).json({ success: true, message: `Coupon ${status} successfully` });

  } catch (error) {
    console.error('Error toggling coupon status:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle coupon status' });
  }
};

// Get available coupons for user
exports.getAvailableCoupons = async (userId, cartItems) => {
    try {
        const now = new Date();
        const coupons = await Coupon.find({
            isActive: true,
            isBlocked: false,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).populate('applicableProducts applicableCategories').lean();

        const availableCoupons = [];

        for (const coupon of coupons) {
            // Check if user has already used this coupon
            const userUsage = coupon.usedBy.find(usage => usage.userId.toString() === userId.toString());
            if (userUsage) continue;

            // Check usage limit
            if (coupon.usedBy.length >= coupon.usageLimit) continue;

            // Calculate eligible items and potential discount
            const eligibleItems = [];
            let eligibleTotal = 0;

            for (const item of cartItems) {
                const product = item.productId;
                let isEligible = false;

                if (coupon.applicableType === 'all') {
                    isEligible = true;
                } else if (coupon.applicableType === 'products') {
                    isEligible = coupon.applicableProducts.some(p => p._id.toString() === product._id.toString());
                } else if (coupon.applicableType === 'categories') {
                    isEligible = coupon.applicableCategories.some(c => c._id.toString() === product.category.toString());
                }

                if (isEligible) {
                    const itemTotal = item.quantity * product.salePrice;
                    eligibleItems.push(item);
                    eligibleTotal += itemTotal;
                }
            }

            if (eligibleItems.length > 0) {
                // Calculate potential discount
                let potentialDiscount = 0;
                if (coupon.discountType === 'percentage') {
                    potentialDiscount = (eligibleTotal * coupon.discountNumber) / 100;
                } else {
                    potentialDiscount = coupon.discountNumber;
                }

                // Apply maximum discount limit
                potentialDiscount = Math.min(potentialDiscount, coupon.maxDiscount, eligibleTotal);

                // Check if minimum purchase requirement is met
                const meetsMinimum = eligibleTotal >= coupon.minPurchase;

                availableCoupons.push({
                    code: coupon.code,
                    discountType: coupon.discountType,
                    discountNumber: coupon.discountNumber,
                    maxDiscount: coupon.maxDiscount,
                    minPurchase: coupon.minPurchase,
                    endDate: coupon.endDate,
                    eligibleTotal: eligibleTotal,
                    potentialDiscount: potentialDiscount,
                    meetsMinimum: meetsMinimum,
                    applicableType: coupon.applicableType,
                    usageRemaining: coupon.usageLimit - coupon.usedBy.length
                });
            }
        }

        return availableCoupons;
    } catch (error) {
        console.error('Error getting available coupons:', error);
        return [];
    }
}

// Validate and apply coupon (for checkout)
exports.validateAndApplyCoupon = async (couponCode, userId, cartItems) => {
  try {
    // Find the coupon
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      isBlocked: false
    }).populate('applicableProducts applicableCategories');

    if (!coupon) {
      return { success: false, message: 'Invalid coupon code' };
    }

    // Check if coupon is within date range
    const now = new Date();
    if (now < coupon.startDate) {
      return { success: false, message: 'Coupon is not yet active' };
    }
    if (now > coupon.endDate) {
      return { success: false, message: 'Coupon has expired' };
    }

    // Check usage limit
    if (coupon.usedBy.length >= coupon.usageLimit) {
      return { success: false, message: 'Coupon usage limit exceeded' };
    }

    // Check if user has already used this coupon
    const userUsage = coupon.usedBy.find(usage => usage.userId.toString() === userId.toString());
    if (userUsage) {
      return { success: false, message: 'You have already used this coupon' };
    }

    // Calculate eligible items and discount
    const eligibleItems = [];
    let eligibleTotal = 0;

    for (const item of cartItems) {
      const product = item.productId;
      let isEligible = false;

      if (coupon.applicableType === 'all') {
        isEligible = true;
      } else if (coupon.applicableType === 'products') {
        isEligible = coupon.applicableProducts.some(p => p._id.toString() === product._id.toString());
      } else if (coupon.applicableType === 'categories') {
        isEligible = coupon.applicableCategories.some(c => c._id.toString() === product.category.toString());
      }

      if (isEligible) {
        const itemTotal = item.quantity * product.salePrice;
        eligibleItems.push({
          ...item,
          itemTotal
        });
        eligibleTotal += itemTotal;
      }
    }

    if (eligibleItems.length === 0) {
      return { success: false, message: 'No eligible items found for this coupon' };
    }

    // Check minimum purchase requirement
    if (eligibleTotal < coupon.minPurchase) {
      return {
        success: false,
        message: `Minimum purchase of ₹${coupon.minPurchase} required. Current eligible total: ₹${eligibleTotal}`
      };
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (eligibleTotal * coupon.discountNumber) / 100;
    } else {
      discountAmount = coupon.discountNumber;
    }

    // Apply maximum discount limit
    discountAmount = Math.min(discountAmount, coupon.maxDiscount, eligibleTotal);

    return {
      success: true,
      message: `Coupon applied successfully! You saved ₹${discountAmount}`,
      coupon: coupon,
      discountAmount: discountAmount,
      eligibleTotal: eligibleTotal,
      eligibleItems: eligibleItems
    };

  } catch (error) {
    console.error('Error validating coupon:', error);
    return { success: false, message: 'Failed to validate coupon' };
  }
};
