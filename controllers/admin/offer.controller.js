const ProductOffer = require('../../models/productOffer.model');
const CategoryOffer = require('../../models/categoryOffer.model');
const ReferralOffer = require('../../models/referralOffer.model');
const Product = require('../../models/product.model');
const Category = require('../../models/category.model');

// Get offer management page
exports.getOfferManagement = async (req, res) => {
  try {
    const productOffers = await ProductOffer.find({})
      .populate('applicableProducts', 'productName')
      .sort({ createdAt: -1 })
      .lean();

    const categoryOffers = await CategoryOffer.find({})
      .populate('applicableCategories', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const referralOffers = await ReferralOffer.find({})
      .sort({ createdAt: -1 })
      .lean();

    const categories = await Category.find({ isListed: true }).select('name').lean();
    const products = await Product.find({ isBlocked: false }).select('productName').lean();

    res.render('admin/offer', { 
      productOffers, 
      categoryOffers, 
      referralOffers, 
      categories, 
      products 
    });
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.redirect('/admin/adminHome');
  }
};

// Product Offer Management
exports.addProductOffer = async (req, res) => {
  try {
    const {
      name, description, discountType, discountValue, maxDiscount,
      startDate, endDate, isActive, applicableProducts, priority
    } = req.body;

    // Validate required fields
    if (!name || !description || !discountType || !discountValue || !maxDiscount || !startDate || !endDate || !applicableProducts) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    // Process applicable products
    const processedProducts = Array.isArray(applicableProducts) ? applicableProducts : [applicableProducts];

    // Create new product offer
    const newProductOffer = new ProductOffer({
      name,
      description,
      discountType,
      discountValue: parseFloat(discountValue),
      maxDiscount: parseFloat(maxDiscount),
      startDate: start,
      endDate: end,
      isActive: isActive === 'on' || isActive === true,
      applicableProducts: processedProducts,
      priority: parseInt(priority) || 1,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newProductOffer.save();
    res.status(200).json({ success: true, message: 'Product offer added successfully' });

  } catch (error) {
    console.error('Error adding product offer:', error);
    res.status(500).json({ success: false, message: 'Failed to add product offer' });
  }
};

exports.updateProductOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, discountType, discountValue, maxDiscount,
      startDate, endDate, isActive, priority
    } = req.body;

    const offer = await ProductOffer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Product offer not found' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    // Update offer
    offer.name = name;
    offer.description = description;
    offer.discountType = discountType;
    offer.discountValue = parseFloat(discountValue);
    offer.maxDiscount = parseFloat(maxDiscount);
    offer.startDate = start;
    offer.endDate = end;
    offer.isActive = isActive === 'on' || isActive === true;
    offer.priority = parseInt(priority) || 1;
    offer.updatedAt = new Date();

    await offer.save();
    res.status(200).json({ success: true, message: 'Product offer updated successfully' });

  } catch (error) {
    console.error('Error updating product offer:', error);
    res.status(500).json({ success: false, message: 'Failed to update product offer' });
  }
};

exports.deleteProductOffer = async (req, res) => {
  try {
    const { id } = req.params;
    
    const offer = await ProductOffer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Product offer not found' });
    }

    await ProductOffer.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Product offer deleted successfully' });

  } catch (error) {
    console.error('Error deleting product offer:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product offer' });
  }
};

exports.toggleProductOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const offer = await ProductOffer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Product offer not found' });
    }

    offer.isBlocked = !offer.isBlocked;
    offer.updatedAt = new Date();
    await offer.save();

    const status = offer.isBlocked ? 'blocked' : 'unblocked';
    res.status(200).json({ success: true, message: `Product offer ${status} successfully` });

  } catch (error) {
    console.error('Error toggling product offer status:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle product offer status' });
  }
};

// Category Offer Management
exports.addCategoryOffer = async (req, res) => {
  try {
    const {
      name, description, discountType, discountValue, maxDiscount,
      startDate, endDate, isActive, applicableCategories, priority
    } = req.body;

    // Validate required fields
    if (!name || !description || !discountType || !discountValue || !maxDiscount || !startDate || !endDate || !applicableCategories) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    // Process applicable categories
    const processedCategories = Array.isArray(applicableCategories) ? applicableCategories : [applicableCategories];

    // Create new category offer
    const newCategoryOffer = new CategoryOffer({
      name,
      description,
      discountType,
      discountValue: parseFloat(discountValue),
      maxDiscount: parseFloat(maxDiscount),
      startDate: start,
      endDate: end,
      isActive: isActive === 'on' || isActive === true,
      applicableCategories: processedCategories,
      priority: parseInt(priority) || 1,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newCategoryOffer.save();
    res.status(200).json({ success: true, message: 'Category offer added successfully' });

  } catch (error) {
    console.error('Error adding category offer:', error);
    res.status(500).json({ success: false, message: 'Failed to add category offer' });
  }
};

exports.updateCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, discountType, discountValue, maxDiscount,
      startDate, endDate, isActive, priority
    } = req.body;

    const offer = await CategoryOffer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Category offer not found' });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    // Update offer
    offer.name = name;
    offer.description = description;
    offer.discountType = discountType;
    offer.discountValue = parseFloat(discountValue);
    offer.maxDiscount = parseFloat(maxDiscount);
    offer.startDate = start;
    offer.endDate = end;
    offer.isActive = isActive === 'on' || isActive === true;
    offer.priority = parseInt(priority) || 1;
    offer.updatedAt = new Date();

    await offer.save();
    res.status(200).json({ success: true, message: 'Category offer updated successfully' });

  } catch (error) {
    console.error('Error updating category offer:', error);
    res.status(500).json({ success: false, message: 'Failed to update category offer' });
  }
};

exports.deleteCategoryOffer = async (req, res) => {
  try {
    const { id } = req.params;
    
    const offer = await CategoryOffer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Category offer not found' });
    }

    await CategoryOffer.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Category offer deleted successfully' });

  } catch (error) {
    console.error('Error deleting category offer:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category offer' });
  }
};

exports.toggleCategoryOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await CategoryOffer.findById(id);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Category offer not found' });
    }

    offer.isBlocked = !offer.isBlocked;
    offer.updatedAt = new Date();
    await offer.save();

    const status = offer.isBlocked ? 'blocked' : 'unblocked';
    res.status(200).json({ success: true, message: `Category offer ${status} successfully` });

  } catch (error) {
    console.error('Error toggling category offer status:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle category offer status' });
  }
};

// Get offer details
exports.getProductOfferDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const offer = await ProductOffer.findById(id)
      .populate('applicableProducts', 'productName')
      .lean();

    if (!offer) {
      return res.status(404).json({ success: false, message: 'Product offer not found' });
    }

    res.status(200).json({ success: true, offer });
  } catch (error) {
    console.error('Error fetching product offer details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product offer details' });
  }
};

exports.getCategoryOfferDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const offer = await CategoryOffer.findById(id)
      .populate('applicableCategories', 'name')
      .lean();

    if (!offer) {
      return res.status(404).json({ success: false, message: 'Category offer not found' });
    }

    res.status(200).json({ success: true, offer });
  } catch (error) {
    console.error('Error fetching category offer details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch category offer details' });
  }
};

// Calculate best offer for a product
exports.calculateBestOffer = async (productId, categoryId, itemTotal) => {
  try {
    const now = new Date();
    let bestOffer = null;
    let maxDiscount = 0;

    // Get active product offers
    const productOffers = await ProductOffer.find({
      applicableProducts: productId,
      isActive: true,
      isBlocked: false,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ priority: -1 });

    // Get active category offers
    const categoryOffers = await CategoryOffer.find({
      applicableCategories: categoryId,
      isActive: true,
      isBlocked: false,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ priority: -1 });

    // Calculate product offer discounts
    for (const offer of productOffers) {
      let discount = 0;
      if (offer.discountType === 'percentage') {
        discount = (itemTotal * offer.discountValue) / 100;
      } else {
        discount = offer.discountValue;
      }

      // Apply max discount limit
      discount = Math.min(discount, offer.maxDiscount, itemTotal);

      if (discount > maxDiscount) {
        maxDiscount = discount;
        bestOffer = {
          type: 'product',
          offer: offer,
          discount: discount
        };
      }
    }

    // Calculate category offer discounts
    for (const offer of categoryOffers) {
      let discount = 0;
      if (offer.discountType === 'percentage') {
        discount = (itemTotal * offer.discountValue) / 100;
      } else {
        discount = offer.discountValue;
      }

      // Apply max discount limit
      discount = Math.min(discount, offer.maxDiscount, itemTotal);

      if (discount > maxDiscount) {
        maxDiscount = discount;
        bestOffer = {
          type: 'category',
          offer: offer,
          discount: discount
        };
      }
    }

    return bestOffer;

  } catch (error) {
    console.error('Error calculating best offer:', error);
    return null;
  }
};

// Get active offers for display
exports.getActiveOffersForDisplay = async () => {
  try {
    const now = new Date();

    const productOffers = await ProductOffer.find({
      isActive: true,
      isBlocked: false,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).populate('applicableProducts', 'productName productImage salePrice').lean();

    const categoryOffers = await CategoryOffer.find({
      isActive: true,
      isBlocked: false,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).populate('applicableCategories', 'name').lean();

    return {
      productOffers,
      categoryOffers
    };

  } catch (error) {
    console.error('Error getting active offers for display:', error);
    return {
      productOffers: [],
      categoryOffers: []
    };
  }
};

// Referral Offer Management
// exports.addReferralOffer = async (req, res) => {
//   try {
//     const {
//       name, description, referrerRewardType, referrerRewardValue, referrerMaxReward,
//       refereeRewardType, refereeRewardValue, refereeMaxReward, minPurchaseAmount,
//       maxReferralsPerUser, startDate, endDate, isActive
//     } = req.body;

//     // Validate required fields
//     if (!name || !description || !referrerRewardType || !referrerRewardValue || !referrerMaxReward ||
//         !refereeRewardType || !refereeRewardValue || !refereeMaxReward || !startDate || !endDate) {
//       return res.status(400).json({ success: false, message: 'All fields are required' });
//     }

//     // Validate dates
//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     if (start >= end) {
//       return res.status(400).json({ success: false, message: 'End date must be after start date' });
//     }

//     // Validate reward values
//     if (referrerRewardValue <= 0 || refereeRewardValue <= 0) {
//       return res.status(400).json({ success: false, message: 'Reward values must be greater than 0' });
//     }

//     if (referrerMaxReward <= 0 || refereeMaxReward <= 0) {
//       return res.status(400).json({ success: false, message: 'Max reward values must be greater than 0' });
//     }

//     // Create new referral offer
//     const newReferralOffer = new ReferralOffer({
//       name,
//       description,
//       referrerRewardType,
//       referrerRewardValue: parseFloat(referrerRewardValue),
//       referrerMaxReward: parseFloat(referrerMaxReward),
//       refereeRewardType,
//       refereeRewardValue: parseFloat(refereeRewardValue),
//       refereeMaxReward: parseFloat(refereeMaxReward),
//       minPurchaseAmount: parseFloat(minPurchaseAmount) || 0,
//       maxReferralsPerUser: parseInt(maxReferralsPerUser) || 10,
//       startDate: start,
//       endDate: end,
//       isActive: isActive === 'on' || isActive === true,
//       isBlocked: false,
//       createdAt: new Date(),
//       updatedAt: new Date()
//     });

//     await newReferralOffer.save();
//     res.status(200).json({ success: true, message: 'Referral offer added successfully' });

//   } catch (error) {
//     console.error('Error adding referral offer:', error);
//     res.status(500).json({ success: false, message: 'Failed to add referral offer' });
//   }
// };

// exports.updateReferralOffer = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const {
//       name, description, referrerRewardType, referrerRewardValue, referrerMaxReward,
//       refereeRewardType, refereeRewardValue, refereeMaxReward, minPurchaseAmount,
//       maxReferralsPerUser, startDate, endDate, isActive
//     } = req.body;

//     // Find the referral offer
//     const referralOffer = await ReferralOffer.findById(id);
//     if (!referralOffer) {
//       return res.status(404).json({ success: false, message: 'Referral offer not found' });
//     }

//     // Validate required fields
//     if (!name || !description || !referrerRewardType || !referrerRewardValue || !referrerMaxReward ||
//         !refereeRewardType || !refereeRewardValue || !refereeMaxReward || !startDate || !endDate) {
//       return res.status(400).json({ success: false, message: 'All fields are required' });
//     }

//     // Validate dates
//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     if (start >= end) {
//       return res.status(400).json({ success: false, message: 'End date must be after start date' });
//     }

//     // Update referral offer
//     referralOffer.name = name;
//     referralOffer.description = description;
//     referralOffer.referrerRewardType = referrerRewardType;
//     referralOffer.referrerRewardValue = parseFloat(referrerRewardValue);
//     referralOffer.referrerMaxReward = parseFloat(referrerMaxReward);
//     referralOffer.refereeRewardType = refereeRewardType;
//     referralOffer.refereeRewardValue = parseFloat(refereeRewardValue);
//     referralOffer.refereeMaxReward = parseFloat(refereeMaxReward);
//     referralOffer.minPurchaseAmount = parseFloat(minPurchaseAmount) || 0;
//     referralOffer.maxReferralsPerUser = parseInt(maxReferralsPerUser) || 10;
//     referralOffer.startDate = start;
//     referralOffer.endDate = end;
//     referralOffer.isActive = isActive === 'on' || isActive === true;
//     referralOffer.updatedAt = new Date();

//     await referralOffer.save();
//     res.status(200).json({ success: true, message: 'Referral offer updated successfully' });

//   } catch (error) {
//     console.error('Error updating referral offer:', error);
//     res.status(500).json({ success: false, message: 'Failed to update referral offer' });
//   }
// };

// exports.deleteReferralOffer = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const referralOffer = await ReferralOffer.findById(id);
//     if (!referralOffer) {
//       return res.status(404).json({ success: false, message: 'Referral offer not found' });
//     }

//     await ReferralOffer.findByIdAndDelete(id);
//     res.status(200).json({ success: true, message: 'Referral offer deleted successfully' });

//   } catch (error) {
//     console.error('Error deleting referral offer:', error);
//     res.status(500).json({ success: false, message: 'Failed to delete referral offer' });
//   }
// };

// exports.toggleReferralOfferStatus = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const referralOffer = await ReferralOffer.findById(id);
//     if (!referralOffer) {
//       return res.status(404).json({ success: false, message: 'Referral offer not found' });
//     }

//     referralOffer.isBlocked = !referralOffer.isBlocked;
//     referralOffer.updatedAt = new Date();
//     await referralOffer.save();

//     const status = referralOffer.isBlocked ? 'blocked' : 'unblocked';
//     res.status(200).json({ success: true, message: `Referral offer ${status} successfully` });

//   } catch (error) {
//     console.error('Error toggling referral offer status:', error);
//     res.status(500).json({ success: false, message: 'Failed to toggle referral offer status' });
//   }
// };

// exports.getReferralOfferDetails = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const offer = await ReferralOffer.findById(id).lean();

//     if (!offer) {
//       return res.status(404).json({ success: false, message: 'Referral offer not found' });
//     }

//     res.status(200).json({ success: true, offer });
//   } catch (error) {
//     console.error('Error fetching referral offer details:', error);
//     res.status(500).json({ success: false, message: 'Failed to fetch referral offer details' });
//   }
// };
