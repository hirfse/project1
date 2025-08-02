const CategoryOffer = require('../models/categoryOffer.model');
const Category = require('../models/category.model');

// Add new category offer
const addCategoryOffer = async (req, res) => {
    try {
        const {
            name,
            description,
            discountType,
            discountValue,
            maxDiscount,
            applicableCategories,
            startDate,
            endDate,
            priority,
            isActive
        } = req.body;

        // Validation
        if (!name || !description || !discountType || !discountValue || !maxDiscount || 
            !applicableCategories || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided'
            });
        }

        // Validate categories exist
        const categories = await Category.find({ _id: { $in: applicableCategories } });
        if (categories.length !== applicableCategories.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more categories not found'
            });
        }

        // Check for overlapping offers on same categories
        const existingOffers = await CategoryOffer.find({
            applicableCategories: { $in: applicableCategories },
            isActive: true,
            isBlocked: false,
            $or: [
                {
                    startDate: { $lte: new Date(endDate) },
                    endDate: { $gte: new Date(startDate) }
                }
            ]
        });

        if (existingOffers.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'There are already active offers for one or more selected categories in the specified date range'
            });
        }

        const categoryOffer = new CategoryOffer({
            name,
            description,
            discountType,
            discountValue: parseFloat(discountValue),
            maxDiscount: parseFloat(maxDiscount),
            applicableCategories,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            priority: priority || 1,
            isActive: isActive !== undefined ? isActive : true,
            createdBy: req.session.admin
        });

        await categoryOffer.save();

        res.status(201).json({
            success: true,
            message: 'Category offer created successfully',
            offer: categoryOffer
        });

    } catch (error) {
        console.error('Error adding category offer:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create category offer'
        });
    }
};

// Get category offer details
const getCategoryOfferDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        const offer = await CategoryOffer.findById(id).populate('applicableCategories', 'name');
        
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Category offer not found'
            });
        }

        res.json({
            success: true,
            offer
        });

    } catch (error) {
        console.error('Error fetching category offer details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch category offer details'
        });
    }
};

// Update category offer
const updateCategoryOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            discountType,
            discountValue,
            maxDiscount,
            applicableCategories,
            startDate,
            endDate,
            priority,
            isActive
        } = req.body;

        const offer = await CategoryOffer.findById(id);
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Category offer not found'
            });
        }

        // Validate categories exist
        const categories = await Category.find({ _id: { $in: applicableCategories } });
        if (categories.length !== applicableCategories.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more categories not found'
            });
        }

        // Check for overlapping offers (excluding current offer)
        const existingOffers = await CategoryOffer.find({
            _id: { $ne: id },
            applicableCategories: { $in: applicableCategories },
            isActive: true,
            isBlocked: false,
            $or: [
                {
                    startDate: { $lte: new Date(endDate) },
                    endDate: { $gte: new Date(startDate) }
                }
            ]
        });

        if (existingOffers.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'There are already active offers for one or more selected categories in the specified date range'
            });
        }

        // Update offer
        offer.name = name;
        offer.description = description;
        offer.discountType = discountType;
        offer.discountValue = parseFloat(discountValue);
        offer.maxDiscount = parseFloat(maxDiscount);
        offer.applicableCategories = applicableCategories;
        offer.startDate = new Date(startDate);
        offer.endDate = new Date(endDate);
        offer.priority = priority || 1;
        offer.isActive = isActive !== undefined ? isActive : true;

        await offer.save();

        res.json({
            success: true,
            message: 'Category offer updated successfully',
            offer
        });

    } catch (error) {
        console.error('Error updating category offer:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update category offer'
        });
    }
};

// Delete category offer
const deleteCategoryOffer = async (req, res) => {
    try {
        const { id } = req.params;

        const offer = await CategoryOffer.findById(id);
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Category offer not found'
            });
        }

        await CategoryOffer.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Category offer deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting category offer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete category offer'
        });
    }
};

// Toggle category offer status (block/unblock)
const toggleCategoryOfferStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const offer = await CategoryOffer.findById(id);
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Category offer not found'
            });
        }

        offer.isBlocked = !offer.isBlocked;
        await offer.save();

        res.json({
            success: true,
            message: `Category offer ${offer.isBlocked ? 'blocked' : 'unblocked'} successfully`,
            offer
        });

    } catch (error) {
        console.error('Error toggling category offer status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle category offer status'
        });
    }
};

// Get active category offers for specific categories
const getActiveCategoryOffers = async (categoryIds) => {
    try {
        return await CategoryOffer.findActiveOffersForCategories(categoryIds);
    } catch (error) {
        console.error('Error fetching active category offers:', error);
        return [];
    }
};

module.exports = {
    addCategoryOffer,
    getCategoryOfferDetails,
    updateCategoryOffer,
    deleteCategoryOffer,
    toggleCategoryOfferStatus,
    getActiveCategoryOffers
};
