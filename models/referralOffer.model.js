const mongoose = require('mongoose')

const referralOfferSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    
    // Referrer rewards (person who refers)
    referrerRewardType: {
        type: String,
        enum: ['percentage', 'amount', 'points'],
        required: true
    },
    referrerRewardValue: {
        type: Number,
        required: true,
        min: 0
    },
    referrerMaxReward: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Referee rewards (person who gets referred)
    refereeRewardType: {
        type: String,
        enum: ['percentage', 'amount', 'points'],
        required: true
    },
    refereeRewardValue: {
        type: Number,
        required: true,
        min: 0
    },
    refereeMaxReward: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Conditions
    minPurchaseAmount: {
        type: Number,
        default: 0
    },
    maxReferralsPerUser: {
        type: Number,
        default: 10
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

    // Tracking
    totalReferrals: {
        type: Number,
        default: 0
    },
    totalRewardsPaid: {
        type: Number,
        default: 0
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
})

// Index for better performance
referralOfferSchema.index({ isActive: 1, isBlocked: 1, startDate: 1, endDate: 1 })

module.exports = mongoose.model('ReferralOffer', referralOfferSchema)
