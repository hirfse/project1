const mongoose = require('mongoose')

const categoryOfferSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0,
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
        required: function() { return this.discountType === 'percentage'; },
        min: 0,
        default: 0,
        validate: {
            validator: function(value) {
                return value >= 0;
            },
            message: 'Maximum discount must be a positive number'
        }
    },
    minPrice: {
        type: Number,
        default: 50,
        min: 0
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    
    // Category-specific fields
    applicableCategories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    }],
    
    // Priority for conflict resolution (higher number = higher priority)
    priority: {
        type: Number,
        min: [1, 'Priority must be at least 1'],
        max: [10, 'Priority cannot exceed 10'],
        validate: {
            validator: Number.isInteger,
            message: 'Priority must be an integer'
        },
        default: 1
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
})

// Index for better performance
categoryOfferSchema.index({ isActive: 1, isBlocked: 1, startDate: 1, endDate: 1 })
categoryOfferSchema.index({ applicableCategories: 1 })

module.exports = mongoose.model('CategoryOffer', categoryOfferSchema)
