const HTTP_STATUS = require('../../constants/httpStatus');
const MESSAGES = require('../../constants/messages');
const Product = require('../../models/product.model');
const Wishlist = require('../../models/wishlist.model');
const Category = require('../../models/category.model');
const mongoose = require('mongoose');

exports.addToWishlist = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.userId;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        if (product.isBlocked) {
            return res.status(400).json({ success: false, message: 'Product is blocked' });
        }
        if (!product.category.isListed) {
            return res.status(400).json({ success: false, message: 'Product category is unlisted' });
        }
        if (product.quantity === 0 || product.status === 'Out of Stock') {
            return res.status(400).json({ success: false, message: 'Product is out of stock' });
        }

        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, products: [] });
        }

        // Fix: compare ObjectIds as strings
        if (wishlist.products.some(pid => pid.toString() === productId)) {
            return res.status(400).json({ success: false, message: 'Product already in wishlist' });
        }

        wishlist.products.push(productId);
        await wishlist.save();

        // Log to terminal when product is added to wishlist
        console.log(`Product ${productId} added to wishlist for user ${userId}`);

        res.status(200).json({ success: true, message: 'Product added to wishlist' });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(500).json({ success: false, message: 'Failed to add to wishlist' });
    }
};

exports.getWishlist = async (req, res) => {
    try {
        const userId = req.session.userId;
        const wishlist = await Wishlist.findOne({ userId }).populate('products');
        const categories = await Category.find({ isListed: true });

        // Filter products but keep out-of-stock items visible in wishlist
        let validProducts = [];
        let productsToRemove = [];

        if (wishlist && wishlist.products && wishlist.products.length) {
            validProducts = wishlist.products.filter(product => {
                if (!product) {
                    productsToRemove.push(product?._id);
                    return false;
                }
                if (product.isBlocked) {
                    productsToRemove.push(product._id);
                    return false;
                }
                if (!product.category) {
                    productsToRemove.push(product._id);
                    return false;
                }

                // Keep products even if category is not listed - show them as unavailable
                return true;
            });

            // Only remove truly invalid products from wishlist
            if (productsToRemove.length > 0) {
                wishlist.products = wishlist.products.filter(p =>
                    !productsToRemove.some(removeId => removeId && removeId.toString() === p._id.toString())
                );
                await wishlist.save();
            }
        }

        if (!validProducts.length) {
            return res.render('user/wishlist', {
                wishlist: { products: [] },
                userName: req.session.userName || null,
                error: 'Your wishlist is empty',
                categories
            });
        }

        res.render('user/wishlist', {
            wishlist: { products: validProducts },
            userName: req.session.userName || null,
            error: null,
            categories
        });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).render('user/wishlist', {
            wishlist: { products: [] },
            userName: req.session.userName || null,
            error: 'Failed to load wishlist',
            categories: []
        });
    }
};

// Remove from Wishlist
exports.removeFromWishlist = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.userId;

        console.log(`Removing product ${productId} from wishlist for user ${userId}`);

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({ success: false, message: 'Wishlist not found' });
        }

        // Check if product exists in wishlist
        const productExists = wishlist.products.some(pid => pid.toString() === productId);
        if (!productExists) {
            return res.status(404).json({ success: false, message: 'Product not found in wishlist' });
        }

        // Remove product from wishlist
        wishlist.products = wishlist.products.filter(pid => pid.toString() !== productId);
        await wishlist.save();

        console.log(`Product ${productId} removed from wishlist. Remaining products: ${wishlist.products.length}`);

        res.status(200).json({ success: true, message: 'Product removed from wishlist' });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({ success: false, message: 'Failed to remove from wishlist' });
    }
};