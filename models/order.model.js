const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderID: {
        type: String,
        required: true,
        unique: true
    },
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        productName: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Canceled'],
            default: 'Pending'
        },
        cancelReason: String
    }],
    shippingAddress: {
        addressType: String,
        fullName: String,
        phone: String,
        secPhone: String,
        houseName: String,
        city: String,
        state: String,
        pincode: String,
        landMark: String
    },
    paymentMethod: {
        type: String,
        required: true
    },
    subtotal: {
        type: Number,
        required: true
    },
    tax: {
        type: Number,
        required: true
    },
    shipping: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Confirmed', 'Shipped', 'Out for Delivery', 'Delivered', 'Canceled', 'Return Requested', 'Returned'],
        default: 'Pending'
    },
    cancelReason: String,
    returnReason: String,
    rejectionReason: String,
    orderDate: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', orderSchema);