const mongoose = require('mongoose')

// This model is now deprecated - use Coupon model instead
// Keeping for backward compatibility during migration
const offerSchema = new mongoose.Schema({
    code: String,
    discountType: String, // 'percentage' or 'amount'
    discountNumber: Number,
    maxDiscount: Number,
    minPurchase: Number,
    startDate: Date,
    endDate: Date,
    usageLimit: Number,
    isActive: Boolean,
    isBlocked: Boolean,

    // Offer applicability
    applicableType: {
        type: String,
        enum: ['all', 'products', 'categories'],
        default: 'all'
    },
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

    // Usage tracking
    usedBy: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        usedAt: { type: Date, default: Date.now },
        discountAmount: Number
    }],

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model('Offer', offerSchema)