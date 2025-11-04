const mongoose = require('mongoose')

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'amount'],
        required: true
    },
    discountNumber: {
        type: Number,
        required: true,
        validate: {
            validator: function(value) {
                if (this.discountType === 'percentage') {
                    return value > 0 && value <= 99;
                }
                return value > 0;
            },
            message: 'Discount percentage must be between 1 and 99%'
        }
    },
    maxDiscount: {
        type: Number,
        required: true
    },
    minPurchase: {
        type: Number,
        required: true,
        default: 0
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    usageLimit: {
        type: Number,
        required: true
    },
    // Optional per-user usage limit. 0 or undefined means unlimited per user.
    perUserUse: {
        type: Number,
        default: 0,
        min: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isBlocked: {
        type: Boolean,
        default: false
    },

    // Coupon applicability
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

module.exports = mongoose.model('Coupon', couponSchema)
