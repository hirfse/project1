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
        enum: ['percentage', 'amount'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    maxDiscount: {
        type: Number,
        required: true,
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
        default: 1
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
})

// Index for better performance
categoryOfferSchema.index({ isActive: 1, isBlocked: 1, startDate: 1, endDate: 1 })
categoryOfferSchema.index({ applicableCategories: 1 })

module.exports = mongoose.model('CategoryOffer', categoryOfferSchema)
