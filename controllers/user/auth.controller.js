const HTTP_STATUS = require('../../constants/httpStatus');
const MESSAGES = require('../../constants/messages');
const User = require('../../models/user.model');
const bcrypt = require('bcrypt');
const Product = require('../../models/product.model');
const nodemailer = require('nodemailer');
const authService = require('../../services/authService');
const userService = require('../../services/userService');

// OTP stores
// const otpStore = new Map();
// const emailOtpStore = new Map();
// const signupOtpStore = new Map();


exports.getLandingPage = async (req, res) => {
  try {
    const products = await Product.find().limit(4);
    res.render('user/landingPage', { error: null, products, userName: null });
  } catch (error) {
    console.error(error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('user/landingPage', { 
      error: MESSAGES.PRODUCT.NOT_FOUND, 
      products: [], 
      userName: null 
    });
  }
};

// Referral landing: store referral code in session and redirect to signup
exports.referralLanding = async (req, res) => {
  try {
    const { code } = req.params;
    if (code) {
      const refUser = await User.findOne({ referralCode: code }).lean();
      if (refUser) {
        req.session.referralCode = code;
      }
    }
  } catch (e) {
    console.error('Error handling referral landing:', e);
  }
  return res.redirect(HTTP_STATUS.FOUND, '/signup');
};

exports.getSignupPage = (req, res) => {
    res.status(HTTP_STATUS.OK).render('user/signup', { 
        error: null 
    });
};

exports.handleSignupPage = async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword, phone } = req.body;
        if (!fullName || !email || !password || !confirmPassword) {
            return res.status(HTTP_STATUS.BAD_REQUEST).render('user/signup', { 
                error: MESSAGES.AUTH.SIGNUP_REQUIRED_FIELDS 
            });
        }
        if (password !== confirmPassword) {
            return res.status(HTTP_STATUS.BAD_REQUEST).render('user/signup', { 
                error: MESSAGES.VALIDATION.PASSWORD_MISMATCH 
            });
        }
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(HTTP_STATUS.CONFLICT).render('user/signup', { 
                error: MESSAGES.AUTH.SIGNUP_EMAIL_EXISTS 
            });
        }
        const { otp } = await authService.generateSignupOTP(email);
        console.log(`Generated OTP for ${email}: ${otp}`);

        res.render('user/verifySignupOTP', {
            email,
            fullName,
            phone,
            password,
            error: null
        });
    } catch (error) {
        console.error('Error during signup:', error);
        res.render('user/signup', { error: 'Something went wrong. Please try again.' });
    }
};

exports.verifySignupOTP = async (req, res) => {
    const { email, otp, fullName, phone, password } = req.body;

    const verification = authService.verifySignupOTP(email, otp);
    if (!verification.valid) {
        const msg = verification.reason === 'expired' ? 'OTP expired. Please try again.' : 'Invalid OTP. Please try again.';
        return res.render('user/verifySignupOTP', { error: msg, email, fullName, phone, password });
    }

    try {
        const newUser = await authService.createUserWithReferral({ fullName, email, phone, password, referralCode: req.session?.referralCode });
        req.session.userId = newUser._id.toString();
        req.session.userEmail = newUser.email;
        req.session.userRole = newUser.role;
        req.session.userName = newUser.fullName;
        if (req.session) delete req.session.referralCode;
        res.render('user/login', { error: 'Signup successful. Please log in.' });
    } catch (error) {
        console.error('Error saving user:', error);
        res.render('user/verifySignupOTP', { error: 'Something went wrong. Please try again.', email, fullName, phone, password });
    }
};

exports.getLoginPage = (req, res) => {
    const error = req.query.error || null;
    res.render('user/login', { error });
};

exports.handleLoginPage = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.authenticate(email, password);
        if (!result.success) {
            const code = result.code;
            if (code === 'ACCOUNT_BLOCKED') return res.status(HTTP_STATUS.FORBIDDEN).render('user/login', { error: MESSAGES.AUTH.ACCOUNT_BLOCKED });
            if (code === 'USE_GOOGLE_AUTH') return res.status(HTTP_STATUS.UNAUTHORIZED).render('user/login', { error: MESSAGES.AUTH.USE_GOOGLE_AUTH });
            return res.status(HTTP_STATUS.UNAUTHORIZED).render('user/login', { error: MESSAGES.AUTH.INVALID_CREDENTIALS });
        }

        const user = result.user;
        req.session.role = undefined;
        req.session.userId = user._id.toString();
        req.session.userEmail = user.email;
        req.session.userRole = user.role;
        req.session.userName = user.fullName;

        // Explicitly save the session before redirecting
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('user/login', { 
                    error: 'Login failed. Please try again.' 
                });
            }
            res.redirect(HTTP_STATUS.FOUND, '/home');
        });
    } catch (error) {
        console.error(error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('user/login', { 
            error: 'Error occurred. Please try again.' 
        });
    }
};


 //forgot page contoller

const otpStore = new Map(); // For password reset OTP
const signupOtpStore = new Map(); // For signup OTP

 exports.getForgotPage = (req,res) => {
    res.render('user/forgotPassword',{error:null})
 }

exports.handleForgotPage = async (req,res) => {
    try{
        const {email} = req.body
        const userEmail = await User.findOne({email})
        if(!userEmail){
            return res.render('user/forgotPassword',{error:'Email not found'})
        }
       // generate OTP

       const otp = Math.floor(1000+Math.random()*9000);
       otpStore.set(email,{ otp, expiresAt: Date.now()+30000})

       //configure nodemailer
       const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Use TLS
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
      
       transporter.verify((error) => {
        if (error) {
          console.error('Email transporter configuration error:', error);
        } else {
          console.log('Email transporter is ready');
        }
      });

        //SEND OTP 
        const mailOptions = {
            to:email,
            subject:'U-Craft password Reset OTP',
            html: `<p> Hi ${email} , <br> OTP for password reset is : <strong> ${otp}</strong></p>`
        }
        console.log(otp)
        await transporter.sendMail(mailOptions)
        console.log('OTP sent to :',email)

        res.redirect(`/verifyOTP?email=${email}`)
    }catch(error){
        res.render('user/forgotPassword',{error:`Something Went Wrong ${error.message}`})
    }

}

//verifyOTP controller

exports.getVerifyOTPPage = (req, res) => {
  const { email } = req.query;
  console.log('Email in getVerifyOTPPage:', email);
  if (!email) {
      return res.redirect('/forgotPassword'); 
  }
  res.render('user/verifyOTP', { error: null, email });
};

exports.verifyOTP = (req, res) => {
  const { email, otp } = req.body;
  console.log('Email:', email); // debuggin
  console.log('OTP:', otp); // debuggin

  if (!otpStore.has(email)) {
      return res.render('user/verifyOTP', { error: 'OTP expired or invalid', email });
  }

  const storedOTPData = otpStore.get(email);
  if (Date.now() > storedOTPData.expiresAt) {
      otpStore.delete(email);
      return res.render('user/verifyOTP', { error: 'OTP expired. Please try again.', email });
  }

  if (storedOTPData.otp.toString() !== otp.toString()) {
      return res.render('user/verifyOTP', { error: 'Invalid OTP. Please try again.', email });
  }

  console.log('Redirecting to resetPassword with email:', email); // debuggin
  return res.redirect(`/resetPassword?email=${encodeURIComponent(email)}`);
};

//resend Otp 

exports.resendOTP = async (req, res) => {
  try {
     
      const email = req.body.email || req.query.email;

      if (!email) {
          console.error("Error: Email is missing in request.");
          return res.status(400).json({ success: false, message: "Email is required" });
      }

      
      const otp = Math.floor(1000 + Math.random() * 9000);
      otpStore.set(email, { otp, expiresAt: Date.now() + 60000 });

      console.log("Generated OTP:", otp, "for email:", email);

      
      const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
          }
      });

      
      await transporter.sendMail({
          to: email,
          subject: "U-Craft OTP Verification",
          html: `<p>Your OTP is: <strong>${otp}</strong></p>`,
      });

      console.log("OTP sent successfully to:", email);
      res.json({ success: true, message: "OTP resent successfully" });

  } catch (error) {
      console.error("Error resending OTP:", error);
      res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};



exports.getResetPassword = (req, res) => {
  const { email } = req.query;
  console.log('Email in getResetPassword:', email); // debuggin

  if (!email) {
      return res.redirect('/forgotPassword'); 
  }

  res.render('user/resetPassword', { email, msg: null });
};


exports.handleResetPassword = async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  if (!email || !password || !confirmPassword) {
      return res.render('user/resetPassword', { email, msg: 'All fields are required' });
  }

  if (password !== confirmPassword) {
      return res.render('user/resetPassword', { email, msg: 'Passwords do not match' });
  }

  try {
      const result = await authService.updatePassword(email, password);
      if (!result.success) {
          return res.render('user/resetPassword', { email, msg: 'User not found' });
      }
      res.redirect('/login');
  } catch (error) {
      console.error('Error resetting password:', error);
      res.render('user/resetPassword', { email, msg: 'An error occurred. Please try again.' });
  }
};


 exports.getHomePage = (req,res) => {
    console.log('Authenticated User:', req.user); // debuggin
    res.render('user/home', { user: req.user });
 }
 

 exports.getHomePage = async (req, res) => {
  try {
      const { products } = await userService.getHomePageData();
      res.render('user/home', { 
          products, 
          userName: req.session.userName || null 
      });
      console.log(req.session.userName)
  } catch (error) {
      console.error(error);
      res.render('user/home', { 
          products: [], 
          error: 'Failed to fetch products.', 
          userName: req.session.userName || null
      });
  }
};
