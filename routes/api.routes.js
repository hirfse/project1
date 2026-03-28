const express = require('express')

const router = express.Router()

// Add logging middleware for all API routes
router.use((req, res, next) => {
    console.log(`=== API REQUEST ===`);
    console.log(`${req.method} ${req.originalUrl}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('==================');
    next();
});

const apiAuth = require('../controllers/api/apiAuth.controller')
const apiGoogleAuth = require('../controllers/api/apiGoogleAuth.controller');

const productController = require('../controllers/api/product.controller')

const cartController = require('../controllers/api/apiCart.controller')
 
const wishlistController = require('../controllers/api/apiWishlist.controller')

const profileController = require('../controllers/api/apiProfile.controller');
const apiPaymentController = require('../controllers/api/apiPayment.controller');
const apiOrderController = require('../controllers/api/apiOrder.controller');


router.post('/signup',apiAuth.handleAPISignup)
router.post('/verifyOTP',apiAuth.verifyOTP)
router.post('/resendOTP',apiAuth.resendOTP)
router.post('/auth/google', apiGoogleAuth.apiGoogleLogin);

router.post('/login',apiAuth.handleAPILogin)

//HOME

router.get('/home',productController.getAPIHome)
router.get('/new-arrivals',productController.getAPINewArrivals)
router.get('/trending',productController.getAPITrendingProducts)

//SEARCH

router.post('/search-products', productController.searchProducts)
router.get('/search-products', productController.searchProducts)

//PRODUCT 

router.get('/explore',productController.getExplore)
router.get('/product/:id',productController.getProductDetail)

//REVIEW

router.post('/addReview',productController.addReview)


//ORDER
router.get('/orders', apiOrderController.getUserOrders)
router.get('/order/details', apiOrderController.getOrderDetails)
router.post('/order/cancel', apiOrderController.cancelOrder)
router.post('/order/return', apiOrderController.returnOrder)
router.post('/order', apiOrderController.orderHandling)

//PAYMENT
router.post('/payment/create-order', apiPaymentController.createRazorpayOrder)
router.post('/payment/verify', apiPaymentController.verifyPaymentAndCreateOrder)

//CART

router.get('/cart/:userId',cartController.getCart)
router.post('/cart/add',cartController.addToCart)
router.post('/cart/remove',cartController.removeCart)

//WISHLIST

router.get('/wishlist/:userId',wishlistController.getWishlist)
router.post('/wishlist/add',wishlistController.addToWishlist)
router.post('/wishlist/remove',wishlistController.removeWishlist)

//PROFILE

router.get('/profile/:userId',profileController.getProfile)
router.post('/profile/edit/:userId',profileController.editProfile)
router.get('/address/:userId',profileController.getAddress)
router.post('/address/add/:userId',profileController.addAddress)
router.post('/address/delete/:userId',profileController.deleteAddress)


module.exports = router;


