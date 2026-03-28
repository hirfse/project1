const Order = require('../../models/order.model')
const Product = require('../../models/product.model')
const User = require('../../models/user.model')

// Get user orders with pagination
exports.getUserOrders = async (req, res) => {
    try {
        const { userId } = req.query
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const status = req.query.status // Optional filter by status

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId is required'
            })
        }

        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            })
        }

        // Build query
        const query = { userId }
        if (status) {
            query.status = status
        }

        // Calculate pagination
        const skip = (page - 1) * limit

        // Get total count for pagination info
        const totalOrders = await Order.countDocuments(query)

        // Get orders with pagination
        const orders = await Order.find(query)
            .populate('items.productId', 'productName images salePrice')
            .sort({ orderDate: -1 })
            .skip(skip)
            .limit(limit)

        // Pagination metadata
        const pagination = {
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            totalOrders,
            hasNextPage: page < Math.ceil(totalOrders / limit),
            hasPrevPage: page > 1,
            limit
        }

        res.json({
            success: true,
            orders,
            pagination,
            message: 'Orders retrieved successfully'
        })

    } catch (error) {
        console.error('Error getting user orders:', error)
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        })
    }
}

// Get single order details with full population
exports.getOrderDetails = async (req, res) => {
    try {
        const { userId, orderId } = req.query

        if (!userId || !orderId) {
            return res.status(400).json({
                success: false,
                message: 'userId and orderId are required'
            })
        }

        const order = await Order.findOne({ _id: orderId, userId })
            .populate('items.productId', 'productName images salePrice description category')
            .populate('items.productId.category', 'categoryName')

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            })
        }

        // Add additional calculated fields for frontend
        const orderWithDetails = {
            ...order.toObject(),
            // Add formatted dates
            formattedOrderDate: order.orderDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            formattedUpdatedAt: order.updatedAt.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            // Add status timeline
            statusTimeline: [
                { status: 'Pending', date: order.orderDate, completed: true },
                { status: 'Confirmed', completed: order.status === 'Confirmed' || ['Shipped', 'Out for Delivery', 'Delivered'].includes(order.status) },
                { status: 'Shipped', completed: order.status === 'Shipped' || ['Out for Delivery', 'Delivered'].includes(order.status) },
                { status: 'Out for Delivery', completed: order.status === 'Out for Delivery' || order.status === 'Delivered' },
                { status: 'Delivered', completed: order.status === 'Delivered' },
                { status: 'Canceled', completed: order.status === 'Canceled' },
                { status: 'Return Requested', completed: order.status === 'Return Requested' },
                { status: 'Returned', completed: order.status === 'Returned' }
            ].filter(step => step.completed || step.status === order.status)
        }

        res.json({
            success: true,
            order: orderWithDetails,
            message: 'Order details retrieved successfully'
        })

    } catch (error) {
        console.error('Error getting order details:', error)
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        })
    }
}

// Cancel order
exports.cancelOrder = async (req, res) => {
    try {
        const { userId, orderId, cancelReason } = req.body

        if (!userId || !orderId) {
            return res.status(400).json({
                success: false,
                message: 'userId and orderId are required'
            })
        }

        const order = await Order.findOne({ _id: orderId, userId })
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            })
        }

        if (order.status !== 'Pending' && order.status !== 'Confirmed') {
            return res.status(400).json({
                success: false,
                message: 'Order cannot be canceled'
            })
        }

        // Restore stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { quantity: item.quantity },
                $set: { status: 'Available' }
            })
        }

        order.status = 'Canceled'
        order.cancelReason = cancelReason || 'No reason provided'
        order.updatedAt = new Date()
        await order.save()

        res.json({
            success: true,
            message: 'Order canceled successfully'
        })

    } catch (error) {
        console.error('Error canceling order:', error)
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        })
    }
}

// Return order
exports.returnOrder = async (req, res) => {
    try {
        const { userId, orderId, returnReason } = req.body

        if (!userId || !orderId) {
            return res.status(400).json({
                success: false,
                message: 'userId and orderId are required'
            })
        }

        const order = await Order.findOne({ _id: orderId, userId })
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            })
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({
                success: false,
                message: 'Only delivered orders can be returned'
            })
        }

        order.status = 'Return Requested'
        order.returnReason = returnReason
        order.updatedAt = new Date()
        await order.save()

        res.json({
            success: true,
            message: 'Return request submitted successfully'
        })

    } catch (error) {
        console.error('Error returning order:', error)
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        })
    }
}

// Legacy order handling (deprecated)
exports.orderHandling = async (req, res) => {
    try {
        const { userId, productId } = req.body

        const user = await User.findById(userId)
        console.log(userId, productId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User Not Found..!"
            })
        }

        const product = await Product.findById(productId)

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product Not Found..!"
            })
        }

        res.json({
            success: true,
            message: 'Order handling endpoint is deprecated. Use payment endpoints instead.'
        })

    } catch (error) {
        console.log('Error while handling order...!', error)
        return res.status(500).json({
            success: false,
            message: 'Error while handling order'
        })
    }
}