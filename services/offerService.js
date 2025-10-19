const ProductOffer = require('../models/productOffer.model');
const CategoryOffer = require('../models/categoryOffer.model');

class OfferService {
    // Get the best offer for a product
    static async getBestOfferForProduct(productId, categoryId) {
        try {
            const now = new Date();
            
            // Get active product offers
            const productOffers = await ProductOffer.find({
                applicableProducts: productId,
                isActive: true,
                isBlocked: false,
                startDate: { $lte: now },
                endDate: { $gte: now }
            }).sort({ priority: -1 });

            // Get active category offers
            const categoryOffers = await CategoryOffer.find({
                applicableCategories: categoryId,
                isActive: true,
                isBlocked: false,
                startDate: { $lte: now },
                endDate: { $gte: now }
            }).sort({ priority: -1 });

            // Priority-first selection (fallback: highest discountValue)
            const candidates = [];
            for (const o of productOffers) candidates.push({ ...o.toObject(), offerType: 'product', priority: o.priority || 1 });
            for (const o of categoryOffers) candidates.push({ ...o.toObject(), offerType: 'category', priority: o.priority || 1 });
            if (candidates.length === 0) return null;
            const maxPriority = Math.max(...candidates.map(c => c.priority));
            const top = candidates.filter(c => c.priority === maxPriority);
            // Without price context here, break ties by larger discountValue normalized: percentage treated as their value, fixed as value
            top.sort((a, b) => (b.discountValue || 0) - (a.discountValue || 0));
            return top[0];
        } catch (error) {
            console.error('Error getting best offer for product:', error);
            return null;
        }
    }

    // Calculate discounted price for a product
    static async calculateDiscountedPrice(product) {
        try {
            const now = new Date();
            // Fetch active offers
            const productOffers = await ProductOffer.find({
                applicableProducts: product._id,
                isActive: true,
                isBlocked: false,
                startDate: { $lte: now },
                endDate: { $gte: now }
            }).lean();
            const categoryId = product.category._id || product.category;
            const categoryOffers = await CategoryOffer.find({
                applicableCategories: categoryId,
                isActive: true,
                isBlocked: false,
                startDate: { $lte: now },
                endDate: { $gte: now }
            }).lean();

            const candidates = [];
            const computeDiscount = (offer) => {
                if (offer.discountType === 'percentage') {
                    const d = (product.salePrice * offer.discountValue) / 100;
                    return Math.min(d, offer.maxDiscount || 0, product.salePrice);
                } else {
                    // fixed amount, do not cap with maxDiscount
                    return Math.min(offer.discountValue, product.salePrice);
                }
            };
            for (const o of productOffers) candidates.push({ ...o, offerType: 'product', priority: o.priority || 1, discountAmount: computeDiscount(o) });
            for (const o of categoryOffers) candidates.push({ ...o, offerType: 'category', priority: o.priority || 1, discountAmount: computeDiscount(o) });

            if (candidates.length === 0) {
                return {
                    originalPrice: product.salePrice,
                    discountedPrice: product.salePrice,
                    discount: 0,
                    offer: null
                };
            }

            // Priority-first: choose highest priority first, then by greatest computed discount
            const maxPriority = Math.max(...candidates.map(c => c.priority));
            const top = candidates.filter(c => c.priority === maxPriority);
            top.sort((a, b) => (b.discountAmount || 0) - (a.discountAmount || 0));
            const bestOffer = top[0];

            let discountAmount = bestOffer.discountAmount;
            
            const discountedPrice = Math.max(0, product.salePrice - discountAmount);

            return {
                originalPrice: product.salePrice,
                discountedPrice: discountedPrice,
                discount: discountAmount,
                discountPercentage: ((discountAmount / product.salePrice) * 100).toFixed(1),
                offer: bestOffer
            };
        } catch (error) {
            console.error('Error calculating discounted price:', error);
            return {
                originalPrice: product.salePrice,
                discountedPrice: product.salePrice,
                discount: 0,
                offer: null
            };
        }
    }

    // Apply offers to multiple products
    static async applyOffersToProducts(products) {
        try {
            const productsWithOffers = [];
            
            for (const product of products) {
                const priceInfo = await this.calculateDiscountedPrice(product);
                productsWithOffers.push({
                    ...product.toObject ? product.toObject() : product,
                    ...priceInfo
                });
            }
            
            return productsWithOffers;
        } catch (error) {
            console.error('Error applying offers to products:', error);
            return products;
        }
    }

    // Get all active offers for display
    static async getActiveOffers() {
        try {
            const now = new Date();
            
            const productOffers = await ProductOffer.find({
                isActive: true,
                isBlocked: false,
                startDate: { $lte: now },
                endDate: { $gte: now }
            }).populate('applicableProducts', 'productName').sort({ priority: -1 });

            const categoryOffers = await CategoryOffer.find({
                isActive: true,
                isBlocked: false,
                startDate: { $lte: now },
                endDate: { $gte: now }
            }).populate('applicableCategories', 'name').sort({ priority: -1 });

            return {
                productOffers,
                categoryOffers
            };
        } catch (error) {
            console.error('Error getting active offers:', error);
            return {
                productOffers: [],
                categoryOffers: []
            };
        }
    }

    // Calculate cart total with offers
    static async calculateCartTotalWithOffers(cartItems) {
        try {
            let subtotal = 0;
            let totalDiscount = 0;
            const itemsWithOffers = [];

            for (const item of cartItems) {
                const product = item.productId || item.product;
                const quantity = item.quantity;
                
                const priceInfo = await this.calculateDiscountedPrice(product);
                const itemTotal = priceInfo.discountedPrice * quantity;
                const itemDiscount = priceInfo.discount * quantity;
                
                subtotal += itemTotal;
                totalDiscount += itemDiscount;
                
                itemsWithOffers.push({
                    ...item,
                    priceInfo,
                    itemTotal,
                    itemDiscount
                });
            }

            return {
                subtotal,
                totalDiscount,
                itemsWithOffers
            };
        } catch (error) {
            console.error('Error calculating cart total with offers:', error);
            return {
                subtotal: 0,
                totalDiscount: 0,
                itemsWithOffers: cartItems
            };
        }
    }
}

module.exports = OfferService;
