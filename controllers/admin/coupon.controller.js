const Coupon = require('../../models/coupon.model');
const Product = require('../../models/product.model');
const Category = require('../../models/category.model');
const couponService = require('../../services/couponService');

// Get coupon management page
exports.getCouponManagement = async (req, res) => {
  try {
    const { coupons, categories, products } = await couponService.listCouponsPageData();
    res.render('admin/coupon', { coupons, categories, products });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.redirect('/admin/adminHome');
  }
};

// Add new coupon
exports.addCoupon = async (req, res) => {
  try {
    const result = await couponService.addCoupon(req.body);
    if (!result.success) return res.status(400).json(result);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error adding coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to add coupon' });
  }
};

// Get coupon details
exports.getCouponDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await couponService.getCouponDetails(id);
    if (!result.success) return res.status(404).json(result);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching coupon details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch coupon details' });
  }
};

// Update coupon
exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await couponService.updateCoupon(id, req.body);
    if (!result.success) {
      const code = result.message === 'Coupon not found' ? 404 : 400;
      return res.status(code).json(result);
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to update coupon' });
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await couponService.deleteCoupon(id);
    if (!result.success) return res.status(404).json(result);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ success: false, message: 'Failed to delete coupon' });
  }
};

// Toggle coupon status
exports.toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await couponService.toggleCouponStatus(id);
    if (!result.success) return res.status(404).json(result);
    res.status(200).json(result);
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
            // Check per-user usage
            const userUses = coupon.usedBy.filter(usage => usage.userId && usage.userId.toString() === userId.toString()).length;
            if (coupon.perUserUse > 0 && userUses >= coupon.perUserUse) continue;

            // Check global usage limit
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
