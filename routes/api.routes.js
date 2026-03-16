const express = require('express')

const router = express.Router()

const apiAuth = require('../controllers/api/apiAuth.controller')
const apiGoogleAuth = require('../controllers/api/apiGoogleAuth.controller');

const productController = require('../controllers/api/product.controller')

const cartController = require('../controllers/api/apiCart.controller')
 
const wishlistController = require('../controllers/api/apiWishlist.controller')

const profileController = require('../controllers/api/apiProfile.controller');


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
router.get('/address/:userId',profileController.getAddress)
router.post('/address/add/:userId',profileController.addAddress)


module.exports = router;


