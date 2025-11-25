const HTTP_STATUS = require('../../constants/httpStatus');
const MESSAGES = require('../../constants/messages');
const Product = require('../../models/product.model');
const Category = require('../../models/category.model');
const Subcategory = require('../../models/subcategory.model');
const Review = require('../../models/review.model');
const OfferService = require('../../services/offerService');
const Cart = require('../../models/cart.model');
const Wishlist = require('../../models/wishlist.model');
const mongoose = require('mongoose');


exports.getProductListing = async (req, res) => {
    try {
        const { page = 1, category, subCategory, sort, search, minPrice, maxPrice } = req.query;
        const itemsPerPage = 8;

        // Build query for filtering products
        const query = { isBlocked: false };

        // Category filter
        if (category && category.trim() !== '') {
            query.category = category;
        }

        // Subcategory filter
        if (subCategory && subCategory.trim() !== '') {
            query.subCategory = subCategory.trim();
        }

        // Search filter
        if (search && search.trim() !== '') {
            query.productName = { $regex: search.trim(), $options: 'i' };
        }

        // Price range filter
        if (minPrice || maxPrice) {
            query.salePrice = {};
            if (minPrice && !isNaN(parseFloat(minPrice))) {
                query.salePrice.$gte = parseFloat(minPrice);
            }
            if (maxPrice && !isNaN(parseFloat(maxPrice))) {
                query.salePrice.$lte = parseFloat(maxPrice);
            }
        }

        // Find all listed categories
        const listedCategories = await Category.find({ isListed: true }).select('_id');
        const listedCategoryIds = listedCategories.map(cat => cat._id);

        // Only show products whose category is listed
        query.category = query.category
            ? query.category
            : { $in: listedCategoryIds };

        // Build sort option
        let sortOption = {};
        if (sort === 'price_asc') {
            sortOption.salePrice = 1;
        } else if (sort === 'price_desc') {
            sortOption.salePrice = -1;
        } else if (sort === 'name_asc') {
            sortOption.productName = 1;
        } else if (sort === 'name_desc') {
            sortOption.productName = -1;
        } else if (sort === 'ratings') {
            sortOption.averageRating = -1;
        } else if (sort === 'newest') {
            sortOption.createdAt = -1;
        } else if (sort === 'oldest') {
            sortOption.createdAt = 1;
        } else if (sort === 'featured') {
            sortOption.isFeatured = -1;
        } else {
            // Default sorting
            sortOption.createdAt = -1;
        }

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / itemsPerPage);

        const products = await Product.find(query)
            .collation({ locale: 'en', strength: 2 })
            .populate('category')
            .sort(sortOption)
            .skip((page - 1) * itemsPerPage)
            .limit(itemsPerPage);

        // Filter out products whose category is not listed (in case of inconsistent data)
        const filteredProducts = products.filter(
            p => p.category && p.category.isListed
        );

        // Apply offers to products
        const userId = req.session.userId;
        const productsWithOffers = await OfferService.applyOffersToProducts(filteredProducts);
        const cart = await Cart.findOne({ userId });
        const cartProductIds = cart ? cart.items.map(i => i.productId.toString()) : [];
        const cartCount = cart ? cart.items.reduce((sum, it) => sum + (it.quantity || 0), 0) : 0;
        const categories = await Category.find();
        let subcategories = [];
        if (category) {
            subcategories = await Subcategory.find({ category, isActive: true }).sort({ name: 1 });
        }

        res.render('user/productList', {
            products: productsWithOffers,
            userName: req.session.userName || null,
            error: req.query.error || null,
            currentPage: parseInt(page),
            totalPages,
            categories,
            selectedCategory: category || '',
            selectedSubCategory: subCategory || '',
            sort: sort || '',
            searchQuery: search || '',
            minPrice: minPrice || '',
            maxPrice: maxPrice || '',
            subcategories,
            cartProductIds,
            cartCount
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
            // Render a user-friendly error page
            return res.status(400).render('user/productError', { 
                message: 'Invalid product ID', 
                userName: req.session.userName || null 
            });
        }
        
        const product = await Product.findById(productId)
        .populate({ path: 'reviews', strictPopulate: false })
        .populate('category');
        
        // If product or its category is not found, show error
        if (!product || !product.category) {
            return res.status(404).render('user/productError', { 
                message: 'Product not found', 
                userName: req.session.userName || null 
            });
        }

        // If product or its category is blocked or unlisted, show "not available" error
        if (
            product.isBlocked ||
            product.category.isBlocked ||
            !product.category.isListed
        ) {
            return res.status(403).render('user/productError', {
                message: 'This product is not available now.',
                userName: req.session.userName || null
            });
        }
        
        product.reviews = product.reviews || [];
        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId },
            isBlocked: false
        }).populate('category').limit(4);

        // Filter related products to only those whose category is listed
        const filteredRelated = relatedProducts.filter(
            p => p.category && p.category.isListed
        );

        // Apply offers to main product and related products
        const productWithOffer = await OfferService.calculateDiscountedPrice(product);
        const relatedProductsWithOffers = await OfferService.applyOffersToProducts(filteredRelated);

        const cart = await Cart.findOne({ userId: req.session.userId });
        const cartProductIds = cart ? cart.items.map(i => i.productId.toString()) : [];
        const cartCount = cart ? cart.items.reduce((sum, it) => sum + (it.quantity || 0), 0) : 0;

        res.render('user/productDetails', {
            product: { ...product.toObject(), ...productWithOffer },
            relatedProducts: relatedProductsWithOffers,
            userName: req.session.userName || null,
            cartProductIds,
            cartCount
        });
    } catch (error) {
        // Render a user-friendly error page
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