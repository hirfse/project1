const express = require('express');
const router = express.Router();
const passport = require('passport');
const userController = require('../controllers/user/user.controller');
const { checkUserSession, preventBackAfterLogout, checkUserStatus  } = require('../middlewares/auth.middleware'); // Use user-specific session check
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Add this at the top with other requires

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
router.get('/', userController.getLandingPage);

router.get('/signup', preventBackAfterLogout, userController.getSignupPage);
router.post('/signup', userController.handleSignupPage);
router.post('/verifySignupOTP', userController.verifySignupOTP);
// router.get('/verifySignupOTP', preventBackAfterLogout, userController.verifySignupOTP);


router.get('/login', preventBackAfterLogout, userController.getLoginPage);
router.post('/login', userController.handleLoginPage);

router.get('/forgotPassword', preventBackAfterLogout, userController.getForgotPage);
router.post('/forgotPassword', userController.handleForgotPage);

router.get('/verifyOTP', preventBackAfterLogout, userController.getVerifyOTPPage);
router.post('/verifyOTP', userController.verifyOTP);
router.post('/resendOTP', userController.resendOTP);


router.get('/resetPassword', preventBackAfterLogout, userController.getResetPassword);
router.post('/resetPassword', userController.handleResetPassword);

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

router.get('/home', userController.getHomePage);

///profile 
router.get('/profile',userController.getProfile)
router.get('/profile/edit',userController.getEditProfile);
router.post('/edit-profile/:id', upload.single('profileImage'), userController.editProfile);
router.get('/verify-email-otp', userController.getVerifyEmailOTP);
router.post('/verify-email-otp', userController.verifyEmailOTP);
router.post('/resend-email-otp', userController.resendEmailOTP);
// router.get('/change-password', userController.getChangePassword);
// router.post('/change-password', userController.handleChangePassword);
// router.get('/verify-password-otp', userController.verifyPasswordOTP); 
// router.post('/verify-password-otp', userController.verifyPasswordOTP); 


/////////
// Address Management Routes
/////////
router.get('/addresses',userController.getAddresses)
router.get('/addresses/add',userController.getAddAddress)
router.post('/addresses/add', userController.addAddress);
router.get('/addresses/edit/:id', userController.getEditAddress);
router.post('/addresses/edit/:id', userController.editAddress);
router.post('/addresses/delete/:id', userController.deleteAddress);
router.get('/productListing', userController.getProductListing);

// Cart Management Routes
router.post('/cart/add/:id', userController.addToCart);
router.get('/cart', userController.getCart);
router.get('/product/:id/json', userController.getProductDetailsJson); 
router.post('/cart/remove/:id', userController.removeFromCart);
router.post('/cart/update-quantity/:id', userController.updateCartQuantity);

router.post('/wishlist/add/:id', userController.addToWishlist);
router.get('/wishlist', userController.getWishlist);

router.get('/customListing', userController.getCustomList);

router.get('/product/:id', userController.getProductDetails);
router.post('/product/:id/addReview', userController.addReview);

//checkout 

router.get('/checkout', userController.getCheckout);
router.post('/checkout/select-address', userController.selectAddress);
router.post('/place-order', userController.placeOrder);
router.get('/order-confirmation', userController.getOrderConfirmation);
router.post('/buy-now/:id', userController.buyNow);

// New Order Management Routes
router.get('/orders', userController.getOrderList);
router.get('/orders/:id', userController.getOrderDetails);
router.post('/orders/cancel/:id', userController.cancelOrder);
router.post('/orders/cancel-item/:orderId/:itemId', userController.cancelOrderItem);
router.post('/orders/return/:id', userController.returnOrder);
router.get('/orders/invoice/:id', userController.downloadInvoice);


//   Logout Route

router.post('/logout', userController.handleLogout);

module.exports = router;
