const express = require('express');
const router = express.Router();
const passport = require('passport');
const Razorpay = require('razorpay');
const userController = require('../controllers/user/user.controller');
const authController = require('../controllers/user/auth.controller');
const profileController = require('../controllers/user/profile.controller');
const productController = require('../controllers/user/product.controller');
const cartController = require('../controllers/user/cart.controller');
const wishlistController = require('../controllers/user/wishlist.controller');
const orderController = require('../controllers/user/order.controller');
const paymentController = require('../controllers/user/payment.controller');
const walletController = require('../controllers/user/wallet.controller');

const { checkUserSession, preventBackAfterLogout, checkUserStatus  } = require('../middlewares/auth.middleware'); 
const multer = require('multer');
const path = require('path');
const fs = require('fs'); 

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'public/uploads/profile';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + Date.now() + ext);
  }
});



const upload = multer({ storage: storage });

//   Public Routes (No authentication required)
router.get('/', authController.getLandingPage);

// Referral landing: store code in session and redirect to signup/home
router.get('/r/:code', authController.referralLanding);

router.get('/signup', preventBackAfterLogout, authController.getSignupPage);
router.post('/signup', authController.handleSignupPage);
router.post('/verifySignupOTP', authController.verifySignupOTP);
// router.get('/verifySignupOTP', preventBackAfterLogout, userController.verifySignupOTP);


router.get('/login', preventBackAfterLogout, authController.getLoginPage);
router.post('/login', authController.handleLoginPage);

router.get('/forgotPassword', preventBackAfterLogout, authController.getForgotPage);
router.post('/forgotPassword', authController.handleForgotPage);

router.get('/verifyOTP', preventBackAfterLogout, authController.getVerifyOTPPage);
router.post('/verifyOTP', authController.verifyOTP);
router.post('/resendOTP', authController.resendOTP);


router.get('/resetPassword', preventBackAfterLogout, authController.getResetPassword);
router.post('/resetPassword', authController.handleResetPassword);

//productListing

router.get('/productListing', productController.getProductListing);

//productDetails

router.get('/product/:id', productController.getProductDetails);


// Coming Soon Pages
router.get('/custom', userController.getCustomPage);
router.get('/about', userController.getAboutPage);
router.get('/contact', userController.getContactPage);


//   Google OAuth Authentication
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    console.log('Google Authentication Successful:', req.user);
    
    //   Add this part to save session
    req.session.userId = req.user._id;
    req.session.userEmail = req.user.email;
    req.session.userName = req.user.fullName;
    
    res.redirect('/home');
  }
);


//   Protected Routes (Require Login)
router.use(checkUserStatus); 
router.use(checkUserSession);
router.use(preventBackAfterLogout); 

router.get('/home', authController.getHomePage);

///profile 
router.get('/profile',profileController.getProfile)
router.get('/profile/edit',profileController.getEditProfile);
router.post('/edit-profile/:id', upload.single('profileImage'), profileController.editProfile);
router.get('/verify-email-otp', profileController.getVerifyEmailOTP);
router.post('/verify-email-otp', profileController.verifyEmailOTP);
router.post('/resend-email-otp', profileController.resendEmailOTP);
// router.get('/change-password', userController.getChangePassword);
// router.post('/change-password', userController.handleChangePassword);
// router.get('/verify-password-otp', userController.verifyPasswordOTP); 
// router.post('/verify-password-otp', userController.verifyPasswordOTP); 




/////////
// Address Management Routes
/////////
router.get('/addresses',profileController.getAddresses)
router.get('/addresses/add',profileController.getAddAddress)
router.post('/addresses/add', profileController.addAddress);
router.get('/addresses/edit/:id', profileController.getEditAddress);
router.post('/addresses/edit/:id', profileController.editAddress);
router.post('/addresses/delete/:id', profileController.deleteAddress);

router.get('/product/:id/json', productController.getProductDetailsJson);
router.post('/products/bulk-stock-check', productController.bulkStockCheck);
router.post('/product/:id/addReview', productController.addReview);

// Cart Management Routes
router.post('/cart/add/:id', cartController.addToCart);
router.post('/cart/add', userController.addToCartFromListing); 
router.get('/cart', cartController.getCart);
router.post('/cart/remove/:id', cartController.removeFromCart);
router.post('/cart/update-quantity/:id', cartController.setCartQuantity);
router.post('/buy-now/update-quantity', cartController.updateBuyNowQuantity);

router.post('/wishlist/add/:id', wishlistController.addToWishlist);
router.post('/wishlist/remove/:id', wishlistController.removeFromWishlist);
router.get('/wishlist', wishlistController.getWishlist);



router.get('/customListing', userController.getCustomList);

//checkout 

router.get('/checkout', orderController.getCheckout);
router.post('/checkout/select-address', orderController.selectAddress);
router.post('/checkout/apply-offer', orderController.applyOffer);
router.post('/checkout/remove-offer', orderController.removeOffer);
router.post('/place-order', orderController.placeOrder);
router.get('/order-confirmation', orderController.getOrderConfirmation);
router.post('/buy-now/:id', orderController.buyNow);
router.post('/create-order', paymentController.createOrder);
router.post('/verify-payment', paymentController.verifyPayment);
router.get('/payment-success', paymentController.paymentSuccess);
router.get('/payment-failure', paymentController.paymentFailure);

// New Order Management Routes
router.get('/orders', orderController.getOrderList);
router.get('/orders/:id', orderController.getOrderDetails);
router.post('/orders/cancel/:id', orderController.cancelOrder);
router.post('/orders/cancel-item/:orderId/:itemId', orderController.cancelOrderItem);
router.post('/orders/return-item/:orderId/:itemId', orderController.returnOrderItem);
router.post('/orders/return/:id', orderController.returnOrder);
router.get('/orders/invoice/:id', orderController.downloadInvoice);

// Wallet Management
router.get('/wallet', walletController.getWallet);

// Referral: get or generate current user's referral code
router.get('/referral-code', userController.getReferralCode);


// Test route - add this to your routes
router.get('/test-error', (req, res, next) => {
    // This will be caught by our error handler
    throw new Error('This is a test error');
});

//   Logout Route

router.post('/logout', userController.handleLogout);

module.exports = router;
