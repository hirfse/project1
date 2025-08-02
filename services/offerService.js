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

            // Find the best offer (highest discount)
            let bestOffer = null;
            let maxDiscount = 0;

            // Check product offers
            for (const offer of productOffers) {
                if (offer.discountType === 'percentage') {
                    // For percentage, we'll calculate based on a reference price
                    // This will be calculated dynamically when applying
                    if (offer.discountValue > maxDiscount) {
                        maxDiscount = offer.discountValue;
                        bestOffer = {
                            ...offer.toObject(),
                            offerType: 'product'
                        };
                    }
                } else if (offer.discountType === 'fixed') {
                    // For fixed amount, compare directly
                    if (offer.discountValue > maxDiscount) {
                        maxDiscount = offer.discountValue;
                        bestOffer = {
                            ...offer.toObject(),
                            offerType: 'product'
                        };
                    }
                }
            }

            // Check category offers
            for (const offer of categoryOffers) {
                if (offer.discountType === 'percentage') {
                    if (offer.discountValue > maxDiscount) {
                        maxDiscount = offer.discountValue;
                        bestOffer = {
                            ...offer.toObject(),
                            offerType: 'category'
                        };
                    }
                } else if (offer.discountType === 'fixed') {
                    if (offer.discountValue > maxDiscount) {
                        maxDiscount = offer.discountValue;
                        bestOffer = {
                            ...offer.toObject(),
                            offerType: 'category'
                        };
                    }
                }
            }

            return bestOffer;
        } catch (error) {
            console.error('Error getting best offer for product:', error);
            return null;
        }
    }

    // Calculate discounted price for a product
    static async calculateDiscountedPrice(product) {
        try {
            const bestOffer = await this.getBestOfferForProduct(product._id, product.category._id || product.category);
            
            if (!bestOffer) {
                return {
                    originalPrice: product.salePrice,
                    discountedPrice: product.salePrice,
                    discount: 0,
                    offer: null
                };
            }

            let discountAmount = 0;
            if (bestOffer.discountType === 'percentage') {
                discountAmount = (product.salePrice * bestOffer.discountValue) / 100;
            } else if (bestOffer.discountType === 'fixed') {
                discountAmount = bestOffer.discountValue;
            }

            // Apply maximum discount limit
            discountAmount = Math.min(discountAmount, bestOffer.maxDiscount);
            
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
