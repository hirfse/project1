const Product = require('../../models/product.model');
const User = require('../../models/user.model');
const Category = require('../../models/category.model');
const Subcategory = require('../../models/subcategory.model');
const Review = require('../../models/review.model');
const Cart = require('../../models/cart.model');
const Wishlist = require('../../models/wishlist.model');
const mongoose = require('mongoose');
const productService = require('../../services/productService');


exports.getProductListing = async (req, res) => {
    try {
        const { page = 1, category, subCategory, sort, search, minPrice, maxPrice } = req.query;
        const data = await productService.getProductListingData(req.query, req.session);

        let userUser = null;
        if (req.session.userId) {
            const userDoc = await User.findById(req.session.userId).lean();
            if (userDoc) {
                userUser = {
                    userName: userDoc.fullName,
                    userProfile: userDoc.profileImage // can be null
                };
            }
        }

        // Collect wishlist product IDs for the logged-in user
        let wishlistProductIds = [];
        if (req.session.userId) {
            const wishlist = await Wishlist.findOne(
                { userId: req.session.userId },
                'products'
            ).lean();
            wishlistProductIds = wishlist ? wishlist.products.map(p => p.toString()) : [];
        }

        res.render('user/productList', {
            products: data.productsWithOffers,
            userName: req.session.userName || null,
            user: userUser,
            error: req.query.error || null,
            currentPage: parseInt(page),
            totalPages: data.totalPages,
            categories: data.categories,
            selectedCategory: category || '',
            selectedSubCategory: subCategory || '',
            sort: sort || '',
            searchQuery: search || '',
            minPrice: minPrice || '',
            maxPrice: maxPrice || '',
            subcategories: data.subcategories,
            cartProductIds: data.cartProductIds,
            wishlistProductIds,
            cartCount: data.cartCount
        });
    } catch (error) {
        console.error('Error fetching product listing:', error.message);
        res.status(500).render('error', { message: 'Failed to load products. Please try again later.' });
    }
};


//product detail
exports.getProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).render('user/productError', {
                message: 'Invalid product ID',
                userName: req.session.userName || null
            });
        }
        const data = await productService.getProductDetailsData(productId, req.session);
        if (!data.ok) {
            if (data.reason === 'NOT_FOUND') {
                return res.status(404).render('user/productError', { message: 'Product not found', userName: req.session.userName || null });
            }
            return res.status(403).render('user/productError', { message: 'This product is not available now.', userName: req.session.userName || null });
        }

        let userUser = null;
        if (req.session.userId) {
            const userDoc = await User.findById(req.session.userId).lean();
            if (userDoc) {
                userUser = {
                    userName: userDoc.fullName,
                    userProfile: userDoc.profileImage
                };
            }
        }

        const productWithOffer = data.productWithOffer;
        const product = data.product;
        res.render('user/productDetails', {
            product: { ...product.toObject(), ...productWithOffer },
            relatedProducts: data.relatedProductsWithOffers,
            userName: req.session.userName || null,
            user: userUser,
            cartProductIds: data.cartProductIds,
            cartCount: data.cartCount
        });
    } catch (_error) {
        void _error;
        res.status(500).render('user/productError', {
            message: 'An unexpected error occurred. Please try again later.',
            userName: req.session.userName || null
        });
    }
};

exports.addReview = async (req, res) => {
    try {
        const { comment, rating } = req.body;
        const productId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.error('Invalid product ID:', productId);
            return res.status(400).render('error', { message: 'Invalid product ID' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            console.error('Product not found:', productId);
            return res.status(404).render('error', { message: 'Product not found' });
        }

        const newReview = new Review({
            userName: req.session.userName || 'Anonymous',
            userId: req.session.userId || null,
            productId,
            rating: parseInt(rating, 10),
            comment
        });

        await newReview.save();

        product.reviews.push(newReview._id);
        await product.save();

        res.redirect(`/product/${productId}`);
    } catch (error) {
        console.error('Error adding review:', error.message);
        res.status(500).render('error', { message: 'Failed to add review. Please try again later.' });
    }
};

exports.getProductDetailsJson = async (req, res) => {
    try {
        const productId = req.params.id;
        console.log('getProductDetailsJson called with productId:', productId);

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.warn('Invalid product ID:', productId);
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const product = await Product.findById(productId)
            .populate({ path: 'reviews', strictPopulate: false })
            .populate('category');

        if (!product) {
            console.warn('Product not found:', productId);
            return res.status(404).json({ success: false, message: 'Product not found' });
        }



        const response = {
            success: true,
            quantity: product.quantity,
            isBlocked: product.isBlocked,
            category: {
                isListed: product.category.isListed
            }
        };
        console.log('Sending response:', response);
        res.status(200).json(response);
    } catch (error) {
        console.error('Error fetching product details for JSON:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'An unexpected error occurred' });
    }
};


exports.bulkStockCheck = async (req, res) => {
    try {
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Product IDs array is required'
            });
        }

        // Validate all product IDs
        const validProductIds = productIds.filter(id => mongoose.Types.ObjectId.isValid(id));

        if (validProductIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid product IDs provided'
            });
        }

        // Get stock information for all products in a single query
        const products = await Product.find({
            _id: { $in: validProductIds }
        }).populate('category').select('_id quantity status isBlocked category');

        // Format response data
        const stockData = {};
        products.forEach(product => {
            // Determine actual status based on quantity and product status
            let actualStatus = product.status;
            if (product.quantity === 0) {
                actualStatus = 'Out of Stock';
            } else if (product.status === 'Out of Stock' && product.quantity > 0) {
                actualStatus = 'Available';
            }

            stockData[product._id.toString()] = {
                quantity: product.quantity,
                status: actualStatus,
                isBlocked: product.isBlocked,
                categoryListed: product.category ? product.category.isListed : false,
                isAvailable: !product.isBlocked &&
                    product.category &&
                    product.category.isListed &&
                    product.quantity > 0 &&
                    actualStatus !== 'Out of Stock'
            };
        });

        // Add entries for products not found (they might be deleted)
        validProductIds.forEach(id => {
            if (!stockData[id]) {
                stockData[id] = {
                    quantity: 0,
                    status: 'Unavailable',
                    isBlocked: true,
                    categoryListed: false,
                    isAvailable: false
                };
            }
        });

        res.json({
            success: true,
            stockData,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in bulk stock check:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check stock status'
        });
    }
};