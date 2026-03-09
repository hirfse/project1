const express = require('express')

const router = express.Router()

const apiAuth = require('../controllers/api/apiAuth.controller')
const productController = require('../controllers/api/product.controller')

const apiGoogleAuth = require('../controllers/api/apiGoogleAuth.controller');


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

//CART
router.post('/cart/add/:id',)

module.exports = router;


