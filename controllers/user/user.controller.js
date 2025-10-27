// user.controller.js
const User = require('../../models/user.model');
const Product = require('../../models/product.model');
const Review = require('../../models/review.model');
const bcrypt = require('bcrypt');
const Category = require('../../models/category.model');
const Subcategory = require('../../models/subcategory.model');
const Order = require('../../models/order.model');
const OfferService = require('../../services/offerService');
const mongoose = require('mongoose');
const ReferralOffer = require('../../models/referralOffer.model');


///////to genertate order id
//////////
const generateOrderID = () => {
    const prefix = 'ORD';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${timestamp}-${random}`;
};
 

////// landing page controller
/////////////////
exports.getLandingPage = async (req, res) => {
  try {
    const products = await Product.find().limit(4);
    res.render('user/landingPage', { error: null, products, userName: null });
  } catch (error) {
    console.error(error);
    res.render('user/landingPage', { error: 'Failed to load products', products: [], userName: null });
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
  } finally {
    return res.redirect('/signup');
  }
};

exports.getSignupPage = (req, res) => {
    res.render('user/signup', { error: null });
};

exports.handleSignupPage = async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword, phone } = req.body;
        if (!fullName || !email || !password || !confirmPassword) {
            return res.render('user/signup', { error: 'All fields are required' });
        }
        if (password !== confirmPassword) {
            return res.render('user/signup', { error: 'Password and confirm password do not match' });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('user/signup', { error: 'Email already exists' });
        }
        const otp = Math.floor(1000 + Math.random() * 9000);
        signupOtpStore.set(email, { otp, expiresAt: Date.now() + 60000 });

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

exports.verifySignupOTP = (req, res) => {
    const { email, otp, fullName, phone, password } = req.body;

    if (!signupOtpStore.has(email)) {
        return res.render('user/verifySignupOTP', { error: 'OTP expired or invalid', email, fullName, phone, password });
    }

    const storedOTPData = signupOtpStore.get(email);
    if (Date.now() > storedOTPData.expiresAt) {
        signupOtpStore.delete(email);
        return res.render('user/verifySignupOTP', { error: 'OTP expired. Please try again.', email, fullName, phone, password });
    }

    if (storedOTPData.otp.toString() !== otp.toString()) {
        return res.render('user/verifySignupOTP', { error: 'Invalid OTP. Please try again.', email, fullName, phone, password });
    }

    signupOtpStore.delete(email);

    bcrypt.hash(password, 10, async (err, hashedPassword) => {
        if (err) {
            console.error('Error hashing password:', err);
            return res.render('user/verifySignupOTP', { error: 'Something went wrong. Please try again.', email, fullName, phone, password });
        }

        try {
            // Determine referredBy from session referralCode, if any (prevent self-referral)
            let referredById = null;
            if (req.session && req.session.referralCode) {
                const referrer = await User.findOne({ referralCode: req.session.referralCode }).lean();
                if (referrer && referrer.email.toLowerCase() !== email.toLowerCase()) {
                    referredById = referrer._id;
                }
            }
            const newUser = new User({
                fullName,
                email,
                phone,
                password: hashedPassword,
                role: 'user',
                status: 'active',
                referredBy: referredById
            });
            await newUser.save();

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
    });
};

exports.getLoginPage = (req, res) => {
    const error = req.query.error || null;
    res.render('user/login', { error });
};

exports.handleLoginPage = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Email:', email);
        console.log('Password:', password);
        
        const user = await User.findOne({ email });
        console.log('User:', user);

        if (!user) {
            return res.render('user/login', { error: 'User not found' });
        }

        if (user.status === 'blocked') {
            return res.render('user/login', {
                error: 'Your account has been blocked by Admin. Please contact support.',
                email
            });
        }

        if (!user.password) {
            return res.render('user/login', { error: 'Please log in using Google Authentication' });
        }

        console.log('User Password:', user.password);

        const passwordCheck = await bcrypt.compare(password, user.password);

        if (!passwordCheck) {
            return res.render('user/login', { error: 'Invalid credentials' });
        }

        // Clear any existing admin session data
        req.session.role = undefined;

        // Set user session data
        req.session.userId = user._id.toString();
        req.session.userEmail = user.email;
        req.session.userRole = user.role;
        req.session.userName = user.fullName;

        // Explicitly save the session before redirecting
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.render('user/login', { error: 'Login failed. Please try again.' });
            }
            res.redirect('/home');
        });
    } catch (error) {
        console.error(error);
        res.render('user/login', { error: 'Error occurred. Please try again.' });
    }
};


 //forgot page contoller

const nodemailer = require('nodemailer')//for sending otp
const Wallet = require('../../models/wallet.model'); // Add wallet model
const otpStore = new Map(); // For password reset OTP
const emailOtpStore = new Map(); // For email verification OTP
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
      const user = await User.findOne({ email });
      if (!user) {
          return res.render('user/resetPassword', { email, msg: 'User not found' });
      }

      
      const hashedPassword = await bcrypt.hash(password, 10);

     
      user.password = hashedPassword;
      await user.save();

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
      const products = await Product.find().limit(4);
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


//////////////////
/////profile controller
/////////////////

exports.getProfile = async (req, res) => {
    const userId = req.session.userId;
    const user = await User.findOne({ _id: userId });
    res.render('user/profile', { user });
};

exports.getEditProfile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findOne({ _id: userId });
        if (!user) {
            return res.render('user/error', {
                message: 'User not found',
                userName: req.session.userName || null,
                categories: await Category.find({ isListed: true })
            });
        }
        res.render('user/editProfile', {
            user,
            userName: req.session.userName || null,
            error: null,
            categories: await Category.find({ isListed: true })
        });
    } catch (error) {
        console.error('Error fetching edit profile:', error);
        res.render('user/error', {
            message: 'Failed to load edit profile page',
            userName: req.session.userName || null,
            categories: await Category.find({ isListed: true })
        });
    }
};

// Edit Profile (with email OTP verification)
exports.editProfile = async (req, res) => {
    try {
        const userId = req.params.id;
        const { fullName, email } = req.body;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!fullName.trim()) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        if (!email.trim()) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Check if email is changed (normalize for comparison)
        const normalizedNewEmail = email.trim().toLowerCase();
        const normalizedCurrentEmail = user.email.trim().toLowerCase();

        console.log(`Email comparison: new="${normalizedNewEmail}", current="${normalizedCurrentEmail}"`);

        if (normalizedNewEmail !== normalizedCurrentEmail) {
            const existingUser = await User.findOne({ email: normalizedNewEmail });
            if (existingUser) {
                return res.status(400).json({ success: false, message: 'Email already exists' });
            }

            // Generate OTP and store in email OTP store
            const otp = generateOTP();
            console.log(`OTP for ${email}: ${otp}`); // Log OTP to console
            emailOtpStore.set(email, { otp, expiresAt: Date.now() + 60000 });
            req.session.pendingProfileUpdate = { fullName, email, profileImage: req.file ? req.file.filename : user.profileImage };

            // Send OTP to new email
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            try {
                await transporter.sendMail({
                    to: email,
                    subject: 'U-Craft Email Verification OTP',
                    html: `<p>Hi, your OTP for email verification is: <strong>${otp}</strong></p>`
                });
            } catch (emailError) {
                console.error('Error sending OTP email:', emailError);
                return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
            }

            return res.json({ success: true, redirect: `/verify-email-otp?email=${encodeURIComponent(email)}` });
        }

        // Update name and profile image if email is unchanged
        user.fullName = fullName;
        if (req.file) {
            // Save only the filename, not the full path
            user.profileImage = req.file.filename;
        }
        await user.save();

        req.session.userName = fullName; // Update session
        return res.json({ success: true, redirect: '/profile' });
    } catch (error) {
        console.error('Error editing profile:', error);
        return res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
};

exports.getVerifyEmailOTP = async (req, res) => {
    try {
        const { email } = req.query;
        console.log(`getVerifyEmailOTP called with email: ${email}`);
        console.log(`Query params:`, req.query, );

        if (!email) {
            console.log(`No email provided, redirecting to profile edit`);
            return res.redirect('/profile/edit');
        }

        console.log(`Rendering verifyEmailOTP page for email: ${email}`);
        res.render('user/verifyEmailOTP', {
            email,
            userName: req.session.userName || null,
            error: null,
            categories: await Category.find({ isListed: true })
        });
    } catch (error) {
        console.error('Error loading OTP page:', error);
        res.render('user/error', {
            message: 'Failed to load email verification page',
            userName: req.session.userName || null,
            categories: await Category.find({ isListed: true })
        });
    }
};

// Verify Email OTP
exports.verifyEmailOTP = async (req, res) => {
    try {
        console.log(`verifyEmailOTP called`);
        console.log(`Request body:`, req.body);
        console.log(`Request headers:`, req.headers);
        console.log(`Request method:`, req.method);

        const { email, otp } = req.body;
        const userId = req.session.userId;

        console.log(`Verifying OTP for email: ${email}, OTP: ${otp}, userId: ${userId}`);
        console.log(`Email OTP Store has email: ${emailOtpStore.has(email)}`);
        console.log(`Email OTP Store contents:`, Array.from(emailOtpStore.entries()));

        if (!emailOtpStore.has(email)) {
            console.log(`OTP not found in store for email: ${email}`);
            return res.status(400).json({ success: false, message: 'OTP expired or invalid' });
        }

        const storedOTPData = emailOtpStore.get(email);
        console.log(`Stored OTP data:`, storedOTPData);
        console.log(`Current time: ${Date.now()}, Expires at: ${storedOTPData.expiresAt}`);

        if (Date.now() > storedOTPData.expiresAt) {
            console.log(`OTP expired for email: ${email}`);
            emailOtpStore.delete(email);
            return res.status(400).json({ success: false, message: 'OTP expired. Please try again.' });
        }

        console.log(`Comparing OTPs: stored="${storedOTPData.otp}", provided="${otp}"`);
        if (storedOTPData.otp.toString() !== otp.toString()) {
            console.log(`OTP mismatch for email: ${email}`);
            return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Update user with pending changes
        const pendingUpdate = req.session.pendingProfileUpdate;
        console.log(`Pending update data:`, pendingUpdate);

        if (pendingUpdate) {
            console.log(`Updating user: ${user.email} -> ${pendingUpdate.email}`);
            user.fullName = pendingUpdate.fullName;
            user.email = pendingUpdate.email;
            if (pendingUpdate.profileImage) {
                user.profileImage = pendingUpdate.profileImage;
            }
            req.session.userName = pendingUpdate.fullName;
            req.session.userEmail = pendingUpdate.email;
            delete req.session.pendingProfileUpdate;
        }
        await user.save();
        console.log(`User updated successfully with new email: ${user.email}`);

        emailOtpStore.delete(email);
        return res.json({ success: true, redirect: '/profile' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return res.status(500).json({ success: false, message: 'Failed to verify OTP' });
    }
};

//reset password page
exports.resendEmailOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const user = await User.findOne({ email: req.session.userEmail });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Generate new OTP
        const otp = generateOTP();
        console.log(`Resent OTP for ${email}: ${otp}`); // Log OTP to console
        emailOtpStore.set(email, { otp, expiresAt: Date.now() + 60000 });

        // Send OTP to email
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        try {
            await transporter.sendMail({
                to: email,
                subject: 'U-Craft Email Verification OTP',
                html: `<p>Hi, your new OTP for email verification is: <strong>${otp}</strong></p>`
            });
        } catch (emailError) {
            console.error('Error resending OTP email:', emailError);
            return res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again.' });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Error resending OTP:', error);
        return res.status(500).json({ success: false, message: 'Failed to resend OTP' });
    }
};

// Get Change Password Page
// exports.getChangePassword = async (req, res) => {
//     try {
//         const userId = req.session.userId;
//         const user = await User.findById(userId);
//         if (!user) {
//             return res.render('user/error', {
//                 message: 'User not found',
//                 userName: req.session.userName || null,
//                 categories: await Category.find({ isListed: true })
//             });
//         }
//         res.render('user/changePassword', {
//             user,
//             userName: req.session.userName || null,
//             error: null,
//             categories: await Category.find({ isListed: true })
//         });
//     } catch (error) {
//         res.render('user/error', {
//             message: 'Failed to load change password page',
//             userName: req.session.userName || null,
//             categories: await Category.find({ isListed: true })
//         });
//     }
// };

// // Handle Change Password (Send OTP)
// exports.handleChangePassword = async (req, res) => {
//     try {
//         const { password, confirmPassword } = req.body;
//         const userId = req.session.userId;
//         const user = await User.findById(userId);

//         if (!user) {
//             return res.render('user/changePassword', {
//                 user,
//                 userName: req.session.userName || null,
//                 error: 'User not found',
//                 categories: await Category.find({ isListed: true })
//             });
//         }

//         if (!password || !confirmPassword) {
//             return res.render('user/changePassword', {
//                 user,
//                 userName: req.session.userName || null,
//                 error: 'All fields are required',
//                 categories: await Category.find({ isListed: true })
//             });
//         }

//         if (password !== confirmPassword) {
//             return res.render('user/changePassword', {
//                 user,
//                 userName: req.session.userName || null,
//                 error: 'Passwords do not match',
//                 categories: await Category.find({ isListed: true })
//             });
//         }

//         // Generate OTP and store in session
//         const otp = generateOTP();
//         otpStore.set(user.email, { otp, expiresAt: Date.now() + 60000, newPassword: password });

//         // Send OTP to current email
//         const transporter = require('nodemailer').createTransport({
//             host: 'smtp.gmail.com',
//             port: 587,
//             secure: false,
//             auth: {
//                 user: process.env.EMAIL_USER,
//                 pass: process.env.EMAIL_PASS
//             }
//         });

//         await transporter.sendMail({
//             to: user.email,
//             subject: 'U-Craft Password Change OTP',
//             html: `<p>Hi, your OTP for password change is: <strong>${otp}</strong></p>`
//         });

//         return res.redirect(`/verify-password-otp?email=${encodeURIComponent(user.email)}`);
//     } catch (error) {
//         res.render('user/changePassword', {
//             user: await User.findById(req.session.userId),
//             userName: req.session.userName || null,
//             error: 'Failed to process password change',
//             categories: await Category.find({ isListed: true })
//         });
//     }
// };

// // Verify Password OTP
// exports.verifyPasswordOTP = async (req, res) => {
//     try {
//         const { email, otp } = req.body;
//         const userId = req.session.userId;

//         if (!otpStore.has(email)) {
//             return res.render('user/verifyPasswordOTP', {
//                 email,
//                 userName: req.session.userName || null,
//                 error: 'OTP expired or invalid',
//                 categories: await Category.find({ isListed: true })
//             });
//         }

//         const storedOTPData = otpStore.get(email);
//         if (Date.now() > storedOTPData.expiresAt) {
//             otpStore.delete(email);
//             return res.render('user/verifyPasswordOTP', {
//                 email,
//                 userName: req.session.userName || null,
//                 error: 'OTP expired. Please try again.',
//                 categories: await Category.find({ isListed: true })
//             });
//         }

//         if (storedOTPData.otp.toString() !== otp.toString()) {
//             return res.render('user/verifyPasswordOTP', {
//                 email,
//                 userName: req.session.userName || null,
//                 error: 'Invalid OTP. Please try again.',
//                 categories: await Category.find({ isListed: true })
//             });
//         }

//         const user = await User.findById(userId);
//         if (!user) {
//             return res.render('user/error', {
//                 message: 'User not found',
//                 userName: req.session.userName || null,
//                 categories: await Category.find({ isListed: true })
//             });
//         }

//         // Update password
//         user.password = await bcrypt.hash(storedOTPData.newPassword, 10);
//         await user.save();

//         otpStore.delete(email);
//         res.redirect('/profile');
//     } catch (error) {
//         res.render('user/verifyPasswordOTP', {
//             email,
//             userName: req.session.userName || null,
//             error: 'Failed to verify OTP',
//             categories: await Category.find({ isListed: true })
//         });
//     }
// };


//////////////////
//// addresses controler
/////////////////

const Address = require('../../models/address.model')

exports.getAddresses = async (req, res) => {
    try {
        const userId = req.session.userId;
        const addressDoc = await Address.findOne({ userId });

        if (!addressDoc || !addressDoc.address.length) {
            return res.render('user/address', { address: [], error: 'No addresses found.' });
        }

        res.render('user/address', { address: addressDoc.address, error: null });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.render('user/address', { address: [], error: 'Failed to fetch addresses.' });
    }
};

exports.getAddAddress = (req, res) => {
    res.render('user/addAddress', { error: null, success: null });
};

exports.addAddress = async (req, res) => {
    try {
        const { addressType, fullName, phone, secPhone, houseName, city, state, pincode, landMark } = req.body;
        const userId = req.session.userId;

        // Validate required fields
        if (!addressType || !fullName || !phone || !houseName || !city || !state || !pincode) {
            return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
        }

        let addressDoc = await Address.findOne({ userId });
        const newAddress = {
            addressType,
            fullName,
            phone,
            secPhone,
            houseName,
            city,
            state,
            pincode,
            landMark
        };

        if (addressDoc) {
            addressDoc.address.push(newAddress);
            await addressDoc.save();
        } else {
            addressDoc = new Address({
                userId,
                address: [newAddress]
            });
            await addressDoc.save();
        }

        res.status(200).json({ success: true, message: 'Address added successfully!' });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({ success: false, message: 'Failed to add address. Please try again.' });
    }
};

exports.getEditAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.userId;

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).send('Address not found');
        }

        const address = addressDoc.address.find(addr => addr._id.toString() === id);
        if (!address) {
            return res.status(404).send('Address not found');
        }

        res.render('user/editAddress', { address });
    } catch (error) {
        console.error('Error fetching address for editing:', error);
        res.status(500).send('Failed to fetch address');
    }
};

exports.editAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const { addressType, fullName, phone, secPhone, houseName, city, state, pincode, landMark } = req.body;
        const userId = req.session.userId;

        // Validate required fields
        if (!addressType || !fullName || !phone || !houseName || !city || !state || !pincode) {
            return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === id);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        // Update the specific address while preserving its _id
        addressDoc.address[addressIndex] = {
            ...addressDoc.address[addressIndex]._doc, // Preserve existing fields, including _id
            addressType,
            fullName,
            phone,
            secPhone,
            houseName,
            city,
            state,
            pincode,
            landMark
        };

        await addressDoc.save();
        res.status(200).json({ success: true, message: 'Address updated successfully!' });
    } catch (error) {
        console.error('Error editing address:', error);
        res.status(500).json({ success: false, message: 'Failed to edit address. Please try again.' });
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.session.userId;

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === id);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }

        addressDoc.address.splice(addressIndex, 1);
        await addressDoc.save();

        res.status(200).json({ success: true, message: 'Address deleted successfully!' });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ success: false, message: 'Failed to delete address. Please try again.' });
    }
};


//productLitsing
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


const Cart = require('../../models/cart.model');
const Wishlist = require('../../models/wishlist.model'); // Assuming a wishlist model exists
const Offer = require('../../models/offer.model');
const Coupon = require('../../models/coupon.model');
const AdminCouponController = require('../admin/coupon.controller');
const MAX_QUANTITY_PER_PRODUCT = 10; // Define maximum quantity per product

// Add to Cart
// user.controller.js
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

exports.addToCart = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.userId;
        const { quantity } = req.body;
        const qty = parseInt(quantity, 10);

        console.log('addToCart called with:', { productId, userId, quantity: qty });

        // Authentication check
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please login to add items to cart', redirect: '/login' });
        }

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.warn('Invalid product ID:', productId);
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        if (!qty || isNaN(qty) || qty < 1) {
            console.warn('Invalid quantity:', qty);
            return res.status(400).json({ success: false, message: 'Invalid quantity' });
        }

        // Check if product exists and is not blocked/unlisted and category is listed
        const product = await Product.findById(productId).populate('category');
        console.log('Product data:', {
            exists: !!product,
            isBlocked: product?.isBlocked,
            categoryListed: product?.category?.isListed,
            categoryBlocked: product?.category?.isBlocked,
            quantity: product?.quantity,
            status: product?.status
        });

        if (!product) {
            console.warn('Product not found:', productId);
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        // Check if product or its category is blocked or unlisted
        if (
            product.isBlocked ||
            !product.category ||
            product.category.isBlocked ||
            !product.category.isListed
        ) {
            console.warn('Product or category is blocked/unlisted:', productId);
            return res.status(400).json({ success: false, message: 'Product or its category is blocked or unlisted' });
        }
        if (product.quantity === 0 || product.status === 'Out of Stock') {
            console.warn('Product out of stock:', productId);
            return res.status(400).json({ success: false, message: 'Product is out of stock' });
        }

        // Find or create cart
        let cart = await Cart.findOne({ userId });
        console.log('Cart found:', !!cart, 'Cart items count:', cart?.items?.length || 0);

        if (!cart) {
            console.log('Creating new cart for user:', userId);
            cart = new Cart({ userId, items: [] });
        }

        // Check if product is already in cart
        const cartItem = cart.items.find(item => item.productId.toString() === productId);
        console.log('Product in cart:', !!cartItem, 'Current quantity:', cartItem?.quantity);

        let newQuantity;
        if (cartItem) {
            // Check if increasing quantity exceeds stock or max limit
            newQuantity = cartItem.quantity + qty;
            if (newQuantity > product.quantity) {
                console.warn('Insufficient stock:', { requested: newQuantity, available: product.quantity });
                return res.status(400).json({ success: false, message: 'Insufficient stock' });
            }
            if (newQuantity > MAX_QUANTITY_PER_PRODUCT) {
                console.warn('Exceeds max quantity limit:', { requested: newQuantity, max: MAX_QUANTITY_PER_PRODUCT });
                return res.status(400).json({ success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` });
            }
            cartItem.quantity = newQuantity;
            console.log('Updated cart item quantity:', cartItem.quantity);
        } else {
            // Add new item to cart
            if (qty > product.quantity) {
                console.warn('Requested quantity exceeds stock:', { requested: qty, available: product.quantity });
                return res.status(400).json({ success: false, message: 'Insufficient stock' });
            }
            if (qty > MAX_QUANTITY_PER_PRODUCT) {
                console.warn('Requested quantity exceeds max limit:', { requested: qty, max: MAX_QUANTITY_PER_PRODUCT });
                return res.status(400).json({ success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` });
            }
            cart.items.push({ productId, quantity: qty });
            newQuantity = qty;
            console.log('Added new item to cart:', { productId, quantity: qty });
        }

        // Remove from wishlist if exists
        const wishlistUpdate = await Wishlist.updateOne(
            { userId },
            { $pull: { products: productId } }
        );
        console.log('Wishlist update result:', wishlistUpdate);

        await cart.save();
        console.log('Cart saved successfully');
        res.status(200).json({ success: true, message: 'Product added to cart' });
    } catch (error) {
        console.error('Error adding to cart:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Failed to add to cart. Please try again.' });
    }
};

// Add to Cart from Product Listing (Enhanced with all requirements)
exports.addToCartFromListing = async (req, res) => {
    try {
        const { productId, quantity = 1 } = req.body;
        const userId = req.session.userId;

        console.log('addToCartFromListing called with:', { productId, userId, quantity });

        // Authentication check
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Please login to add items to cart',
                requiresLogin: true
            });
        }

        // Validate product ID
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid product ID'
            });
        }

        // Validate quantity
        const qty = parseInt(quantity);
        if (isNaN(qty) || qty < 1) {
            return res.status(400).json({
                success: false,
                error: 'Invalid quantity'
            });
        }

        // Check if product exists and is available
        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Check if product is blocked
        if (product.isBlocked) {
            return res.status(400).json({
                success: false,
                error: 'This product is currently unavailable'
            });
        }

        // Check if category is listed
        if (!product.category || !product.category.isListed) {
            return res.status(400).json({
                success: false,
                error: 'This product category is currently unavailable'
            });
        }

        // Stock validation
        if (product.quantity === 0 || product.status === 'Out of Stock') {
            return res.status(400).json({
                success: false,
                error: 'This product is currently out of stock'
            });
        }

        if (qty > product.quantity) {
            return res.status(400).json({
                success: false,
                error: `Only ${product.quantity} items available in stock`
            });
        }

        const MAX_QUANTITY_PER_PRODUCT = 10;
        if (qty > MAX_QUANTITY_PER_PRODUCT) {
            return res.status(400).json({
                success: false,
                error: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product`
            });
        }

        // Find or create cart
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        // Check if product is already in cart
        const cartItem = cart.items.find(item => item.productId.toString() === productId);
        let newQuantity = qty;

        if (cartItem) {
            // Update quantity if product is already in cart
            newQuantity = cartItem.quantity + qty;

            if (newQuantity > product.quantity) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot add ${qty} more. Only ${product.quantity - cartItem.quantity} items available`
                });
            }

            if (newQuantity > MAX_QUANTITY_PER_PRODUCT) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product`
                });
            }

            cartItem.quantity = newQuantity;
        } else {
            // Add new item to cart
            cart.items.push({ productId, quantity: qty });
        }

        // Remove from wishlist if exists
        await Wishlist.updateOne(
            { userId },
            { $pull: { products: productId } }
        );

        await cart.save();

        // Calculate cart totals for response
        const cartWithProducts = await Cart.findOne({ userId }).populate('items.productId');
        const cartCount = cartWithProducts.items.reduce((total, item) => total + item.quantity, 0);
        const cartTotal = cartWithProducts.items.reduce((total, item) => {
            return total + (item.quantity * item.productId.salePrice);
        }, 0);

        res.status(200).json({
            success: true,
            message: cartItem ?
                `Product quantity updated in cart (${newQuantity} total)` :
                'Product added to cart successfully',
            cartCount,
            cartTotal,
            productName: product.productName
        });

    } catch (error) {
        console.error('Error adding to cart from listing:', error);

        // Handle specific error types
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: 'Invalid data provided'
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                error: 'Invalid product ID format'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to add product to cart. Please try again.'
        });
    }
};

// Bulk Stock Check for Product Listing (Optimized)
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

// Get Cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    const categories = await Category.find({ isListed: true });

    if (!cart || !cart.items.length) {
      return res.render('user/cart', {
        cart: { items: [] },
        userName: req.session.userName || null,
        error: 'Your cart is empty',
        categories
      });
    }

    // Filter out invalid items (blocked products, unlisted categories, or out of stock)
    const validItems = [];
    let hasStockIssue = false;
    for (const item of cart.items) {
      const product = await Product.findById(item.productId).populate('category');
      if (
        product &&
        !product.isBlocked &&
        product.category.isListed &&
        product.quantity > 0 &&
        product.status !== 'Out of Stock'
      ) {
        validItems.push({
          ...item._doc,
          isAvailable: item.quantity <= product.quantity,
          maxStock: product.quantity
        });
        if (item.quantity > product.quantity) {
          hasStockIssue = true;
        }
      }
    }

    // Update cart if any items were invalid
    if (validItems.length !== cart.items.length) {
      cart.items = validItems;
      await cart.save();
    }

    const cartCount = validItems.reduce((sum, it) => sum + (it.quantity || 0), 0);
    res.render('user/cart', {
      cart: { items: validItems },
      userName: req.session.userName || null,
      error: null,
      categories,
      cartCount,
      hasStockIssue
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).render('user/cart', {
      cart: { items: [] },
      userName: req.session.userName || null,
      error: 'Failed to load cart',
      categories: []
    });
  }
};

// Remove from Cart
exports.removeFromCart = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.session.userId;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: 'Product not found in cart' });
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();

    res.status(200).json({ success: true, message: 'Product removed from cart' });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ success: false, message: 'Failed to remove from cart' });
  }
};

// Update quantity for both cart and buy now
// This function now handles both cart updates and buy now updates
exports.setCartQuantity = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.session.userId;
    const { quantity, isBuyNow } = req.body;

    console.log('setCartQuantity called with:', { productId, quantity, userId, isBuyNow });

    if (!quantity || quantity < 1) {
      console.log('Invalid quantity:', quantity);
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.log('Invalid product ID:', productId);
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const product = await Product.findById(productId).populate('category');
    if (!product) {
      console.log('Product not found:', productId);
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const MAX_QUANTITY_PER_PRODUCT = 10;
    if (product.quantity < quantity) {
      console.log('Insufficient stock:', { requested: quantity, available: product.quantity });
      return res.status(400).json({ 
        success: false, 
        message: `Only ${product.quantity} item${product.quantity === 1 ? '' : 's'} available` 
      });
    }

    if (quantity > MAX_QUANTITY_PER_PRODUCT) {
      console.log('Exceeds max quantity:', { requested: quantity, max: MAX_QUANTITY_PER_PRODUCT });
      return res.status(400).json({ 
        success: false, 
        message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` 
      });
    }

    let subtotal, tax, shipping, discount, total, itemTotal, updatedItem;
    let cartCount = 0;

    if (isBuyNow) {
      // Handle Buy Now case
      console.log('Processing Buy Now update');
      
      // Calculate item total
      itemTotal = quantity * product.salePrice;
      
      // Calculate price summary for Buy Now
      subtotal = itemTotal;
      tax = subtotal * 0.05; // 5% tax
      shipping = subtotal > 1000 ? 0 : 50; // Free shipping for orders over 1000
      discount = 0; // You can add discount calculation here if needed
      total = subtotal + tax + shipping - discount;
      
      // Create updated item for response
      updatedItem = {
        productId: product,
        quantity: quantity,
        _id: product._id // For consistency with cart response
      };
      
      // Update the session for Buy Now
      if (req.session.buyNowProduct) {
        req.session.buyNowProduct.quantity = quantity;
      }
      
      // Get cart count separately for the header
      const cart = await Cart.findOne({ userId });
      cartCount = cart ? cart.items.reduce((count, item) => count + item.quantity, 0) : 0;
    } else {
      // Handle Cart case
      let cart = await Cart.findOne({ userId });
      if (!cart) {
        console.log('Cart not found for user:', userId);
        return res.status(404).json({ success: false, message: 'Cart not found' });
      }

      const itemIndex = cart.items.findIndex(i => i.productId.toString() === productId);
      if (itemIndex === -1) {
        console.log('Item not in cart:', { productId, cartItems: cart.items });
        return res.status(404).json({ success: false, message: 'Item not in cart' });
      }

      // Update the quantity
      cart.items[itemIndex].quantity = quantity;
      
      // Save the cart
      await cart.save();
      console.log('Cart updated successfully');

      // Calculate the new totals
      const updatedCart = await Cart.findOne({ userId }).populate('items.productId');
      updatedItem = updatedCart.items.find(i => i.productId._id.toString() === productId);
      
      if (!updatedItem) {
        console.error('Failed to find updated item in cart after save');
        return res.status(500).json({ success: false, message: 'Failed to update cart' });
      }

      // Calculate all the price components
      subtotal = updatedCart.items.reduce((sum, it) => {
        return sum + (it.quantity * (it.productId?.salePrice || 0));
      }, 0);
      
      tax = subtotal * 0.05; // 5% tax as shown in the frontend
      shipping = subtotal > 1000 ? 0 : 50; // Free shipping for orders over 1000
      discount = 0; // You can add discount calculation here if needed
      total = subtotal + tax + shipping - discount;
      
      itemTotal = updatedItem.quantity * updatedItem.productId.salePrice;
      cartCount = updatedCart.items.reduce((count, item) => count + item.quantity, 0);
    }
    
    console.log('Price calculation:', { 
      subtotal, 
      tax, 
      shipping, 
      discount, 
      total,
      isBuyNow,
      itemTotal,
      quantity: updatedItem.quantity
    });

    res.json({ 
      success: true, 
      message: 'Quantity updated successfully',
      data: {
        itemTotal: itemTotal.toFixed(2),
        quantity: updatedItem.quantity,
        priceSummary: {
          subtotal: subtotal.toFixed(2),
          tax: tax.toFixed(2),
          shipping: shipping.toFixed(2),
          discount: discount.toFixed(2),
          total: total.toFixed(2)
        },
        cartCount: cartCount
      }
    });
  } catch (err) {
    console.error('Error in setCartQuantity:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Could not update cart',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Update Cart Quantity (Increment/Decrement)
exports.adjustCartQuantity = async (req, res) => {
  try {
    const productId = req.params.id;
    const { action } = req.body; // 'increment' or 'decrement'
    const userId = req.session.userId;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    if (!['increment', 'decrement'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const cartItem = cart.items.find(item => item.productId.toString() === productId);
    if (!cartItem) {
      return res.status(404).json({ success: false, message: 'Product not found in cart' });
    }

    const product = await Product.findById(productId).populate('category');
    if (!product || product.isBlocked || !product.category.isListed || product.quantity === 0 || product.status === 'Out of Stock') {
      // Remove item from cart if it's invalid
      cart.items = cart.items.filter(item => item.productId.toString() !== productId);
      await cart.save();
      return res.status(400).json({ success: false, message: 'Product is unavailable' });
    }

    if (action === 'increment') {
      if (cartItem.quantity >= product.quantity) {
        return res.status(400).json({ success: false, message: 'Insufficient stock' });
      }
      if (cartItem.quantity >= MAX_QUANTITY_PER_PRODUCT) {
        return res.status(400).json({ success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` });
      }
      cartItem.quantity += 1;
    } else if (action === 'decrement') {
      if (cartItem.quantity <= 1) {
        cart.items = cart.items.filter(item => item.productId.toString() !== productId);
      } else {
        cartItem.quantity -= 1;
      }
    }

    await cart.save();
    res.status(200).json({ success: true, message: 'Cart updated successfully' });
  } catch (error) {
    console.error('Error updating cart quantity:', error);
    res.status(500).json({ success: false, message: 'Failed to update cart' });
  }
};

//////////
/////wishlist controller
//////////

exports.addToWishlist = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.userId;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        if (product.isBlocked) {
            return res.status(400).json({ success: false, message: 'Product is blocked' });
        }
        if (!product.category.isListed) {
            return res.status(400).json({ success: false, message: 'Product category is unlisted' });
        }
        if (product.quantity === 0 || product.status === 'Out of Stock') {
            return res.status(400).json({ success: false, message: 'Product is out of stock' });
        }

        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, products: [] });
        }

        // Fix: compare ObjectIds as strings
        if (wishlist.products.some(pid => pid.toString() === productId)) {
            return res.status(400).json({ success: false, message: 'Product already in wishlist' });
        }

        wishlist.products.push(productId);
        await wishlist.save();

        // Log to terminal when product is added to wishlist
        console.log(`Product ${productId} added to wishlist for user ${userId}`);

        res.status(200).json({ success: true, message: 'Product added to wishlist' });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(500).json({ success: false, message: 'Failed to add to wishlist' });
    }
};

exports.getWishlist = async (req, res) => {
    try {
        const userId = req.session.userId;
        const wishlist = await Wishlist.findOne({ userId }).populate('products');
        const categories = await Category.find({ isListed: true });

        // Filter products but keep out-of-stock items visible in wishlist
        let validProducts = [];
        let productsToRemove = [];

        if (wishlist && wishlist.products && wishlist.products.length) {
            validProducts = wishlist.products.filter(product => {
                if (!product) {
                    productsToRemove.push(product?._id);
                    return false;
                }
                if (product.isBlocked) {
                    productsToRemove.push(product._id);
                    return false;
                }
                if (!product.category) {
                    productsToRemove.push(product._id);
                    return false;
                }

                // Keep products even if category is not listed - show them as unavailable
                return true;
            });

            // Only remove truly invalid products from wishlist
            if (productsToRemove.length > 0) {
                wishlist.products = wishlist.products.filter(p =>
                    !productsToRemove.some(removeId => removeId && removeId.toString() === p._id.toString())
                );
                await wishlist.save();
            }
        }

        if (!validProducts.length) {
            return res.render('user/wishlist', {
                wishlist: { products: [] },
                userName: req.session.userName || null,
                error: 'Your wishlist is empty',
                categories
            });
        }

        res.render('user/wishlist', {
            wishlist: { products: validProducts },
            userName: req.session.userName || null,
            error: null,
            categories
        });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).render('user/wishlist', {
            wishlist: { products: [] },
            userName: req.session.userName || null,
            error: 'Failed to load wishlist',
            categories: []
        });
    }
};

// Remove from Wishlist
exports.removeFromWishlist = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.userId;

        console.log(`Removing product ${productId} from wishlist for user ${userId}`);

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({ success: false, message: 'Wishlist not found' });
        }

        // Check if product exists in wishlist
        const productExists = wishlist.products.some(pid => pid.toString() === productId);
        if (!productExists) {
            return res.status(404).json({ success: false, message: 'Product not found in wishlist' });
        }

        // Remove product from wishlist
        wishlist.products = wishlist.products.filter(pid => pid.toString() !== productId);
        await wishlist.save();

        console.log(`Product ${productId} removed from wishlist. Remaining products: ${wishlist.products.length}`);

        res.status(200).json({ success: true, message: 'Product removed from wishlist' });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({ success: false, message: 'Failed to remove from wishlist' });
    }
};


// Checkout Page
exports.getCheckout = async (req, res) => {
    try {
        const userId = req.session.userId;
        const addressDoc = await Address.findOne({ userId });
        const categories = await Category.find({ isListed: true });
        const isBuyNow = req.query.buyNow === 'true' || req.session.buyNowProduct;

        // Initialize default values
        let addresses = addressDoc ? addressDoc.address : [];
        let selectedAddress = null;
        let subtotal = 0;
        let tax = 0;
        let shipping = 50; // Flat shipping rate
        let discount = 0;
        let total = 0;
        let checkoutItems = [];

        // Ensure one address is default
        if (addresses.length > 0) {
            selectedAddress = addresses.find(addr => addr.isDefault) || addresses[0];
            if (!selectedAddress.isDefault) {
                selectedAddress.isDefault = true;
                await Address.updateOne(
                    { userId, 'address._id': selectedAddress._id },
                    { $set: { 'address.$.isDefault': true } }
                );
            }
        }

        // Handle Buy Now vs Regular Cart
        if (isBuyNow && req.session.buyNowProduct) {
            // Buy Now: Use only the single product from session
            const buyNowData = req.session.buyNowProduct;
            const product = await Product.findById(buyNowData.productId).populate('category');

            if (product && !product.isBlocked && product.category.isListed &&
                product.quantity >= buyNowData.quantity && product.status !== 'Out of Stock') {

                checkoutItems = [{
                    productId: product,
                    quantity: buyNowData.quantity
                }];

                const itemTotal = buyNowData.quantity * product.salePrice;
                subtotal = itemTotal;

                // Apply product or category offer
                const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
                const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
                discount = Math.max(productDiscount, categoryDiscount);

                tax = subtotal * 0.05; // 5% tax

                // Apply offer discount if available
                let offerDiscount = 0;
                if (req.session.appliedOffer) {
                    offerDiscount = req.session.appliedOffer.discountAmount || 0;
                }

                total = subtotal + tax + shipping - discount - offerDiscount;
            }
        } else {
            // Regular Cart: Use cart items
            const cart = await Cart.findOne({ userId }).populate('items.productId');

            if (cart && cart.items.length > 0) {
                const validItems = [];
                for (const item of cart.items) {
                    const product = await Product.findById(item.productId).populate('category');
                    if (
                        product &&
                        !product.isBlocked &&
                        product.category.isListed &&
                        product.quantity >= item.quantity &&
                        product.status !== 'Out of Stock'
                    ) {
                        validItems.push(item);
                        const itemTotal = item.quantity * product.salePrice;
                        subtotal += itemTotal;
                        // Apply product or category offer
                        const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
                        const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
                        discount += Math.max(productDiscount, categoryDiscount);
                    }
                }
                // Update cart if any items were invalid
                if (validItems.length !== cart.items.length) {
                    cart.items = validItems;
                    await cart.save();
                }
                checkoutItems = validItems;
                tax = subtotal * 0.05; // 5% tax

                // Apply offer discount if available
                let offerDiscount = 0;
                if (req.session.appliedOffer) {
                    offerDiscount = req.session.appliedOffer.discountAmount || 0;
                }

                total = subtotal + tax + shipping - discount - offerDiscount;
            }
        }

        // Get available offers for user
        const availableOffers = await getAvailableOffers(userId, checkoutItems);
        // Get available coupons for user
        const availableCoupons = await AdminCouponController.getAvailableCoupons(userId, checkoutItems);

        // Get user details for Razorpay
        const user = await User.findById(userId).select('email phone').lean();
        
        res.render('user/checkout', {
            addresses,
            selectedAddress,
            cart: { items: checkoutItems },
            userName: req.session.userName || null,
            userEmail: user?.email || '',
            userPhone: user?.phone || '',
            error: checkoutItems.length === 0 ? (isBuyNow ? 'Product not available for purchase' : 'Your cart is empty') : null,
            categories,
            subtotal,
            tax,
            shipping,
            discount,
            total,
            isBuyNow: isBuyNow,
            appliedOffer: req.session.appliedOffer || null,
            availableOffers: availableOffers,
            availableCoupons: availableCoupons
        });
    } catch (error) {
        console.error('Error fetching checkout page:', error);
        res.status(500).render('user/checkout', {
            addresses: [],
            selectedAddress: null,
            cart: { items: [] },
            userName: req.session.userName || null,
            error: 'Failed to load checkout page',
            categories: [],
            subtotal: 0,
            tax: 0,
            shipping: 0,
            discount: 0,
            total: 0
        });
    }
};

// Select Default Address
exports.selectAddress = async (req, res) => {
    try {
        const { selectedAddress } = req.body;
        const userId = req.session.userId;

        if (!mongoose.Types.ObjectId.isValid(selectedAddress)) {
            return res.status(400).json({ success: false, message: 'Invalid address ID' });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({ success: false, message: 'No addresses found' });
        }

        // Reset all addresses to non-default
        addressDoc.address.forEach(addr => (addr.isDefault = false));
        // Set selected address as default
        const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === selectedAddress);
        if (addressIndex === -1) {
            return res.status(404).json({ success: false, message: 'Address not found' });
        }
        addressDoc.address[addressIndex].isDefault = true;
        await addressDoc.save();

        res.status(200).json({ success: true, message: 'Address selected successfully' });
    } catch (error) {
        console.error('Error selecting address:', error);
        res.status(500).json({ success: false, message: 'Failed to select address' });
    }
};

// Place Order (Placeholder - Implement as needed)
exports.placeOrder = async (req, res) => {
    try {
        const { selectedAddress, paymentMethod } = req.body;
        const userId = req.session.userId;

        // Store checkout data in session for Razorpay payments
        req.session.checkoutData = {
            selectedAddress,
            paymentMethod
        };

        // If payment method is Razorpay, redirect to payment gateway
        if (paymentMethod === 'razorpay') {
            return res.json({
                success: true,
                redirect: true,
                message: 'Redirecting to payment gateway'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(selectedAddress)) {
            return res.render('user/checkout', {
                addresses: [],
                selectedAddress: null,
                cart: { items: [] },
                userName: req.session.userName || null,
                error: 'Invalid address ID',
                categories: await Category.find({ isListed: true }),
                subtotal: 0,
                tax: 0,
                shipping: 0,
                discount: 0,
                total: 0
            });
        }

        if (paymentMethod !== 'cod') {
            return res.render('user/checkout', {
                addresses: [],
                selectedAddress: null,
                cart: { items: [] },
                userName: req.session.userName || null,
                error: 'Selected payment method is not available',
                categories: await Category.find({ isListed: true }),
                subtotal: 0,
                tax: 0,
                shipping: 0,
                discount: 0,
                total: 0
            });
        }

        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc || !addressDoc.address.find(addr => addr._id.toString() === selectedAddress)) {
            return res.render('user/checkout', {
                addresses: [],
                selectedAddress: null,
                cart: { items: [] },
                userName: req.session.userName || null,
                error: 'Address not found',
                categories: await Category.find({ isListed: true }),
                subtotal: 0,
                tax: 0,
                shipping: 0,
                discount: 0,
                total: 0
            });
        }

        // Check if this is a buy now order or regular cart order
        const isBuyNow = req.session.buyNowProduct;
        let orderItems = [];

        if (isBuyNow) {
            // Buy Now: Use product from session
            const buyNowData = req.session.buyNowProduct;
            const product = await Product.findById(buyNowData.productId).populate('category');

            if (!product) {
                return res.render('user/checkout', {
                    addresses: [],
                    selectedAddress: null,
                    cart: { items: [] },
                    userName: req.session.userName || null,
                    error: 'Product not found',
                    categories: await Category.find({ isListed: true }),
                    subtotal: 0,
                    tax: 0,
                    shipping: 0,
                    discount: 0,
                    total: 0
                });
            }

            orderItems = [{
                productId: product,
                quantity: buyNowData.quantity
            }];
        } else {
            // Regular Cart: Use cart items
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (!cart || !cart.items.length) {
                return res.render('user/checkout', {
                    addresses: [],
                    selectedAddress: null,
                    cart: { items: [] },
                    userName: req.session.userName || null,
                    error: 'Cart is empty',
                    categories: await Category.find({ isListed: true }),
                    subtotal: 0,
                    tax: 0,
                    shipping: 0,
                    discount: 0,
                    total: 0
                });
            }
            orderItems = cart.items;
        }

        // Calculate totals and validate stock
        let subtotal = 0;
        let tax = 0;
        let shipping = 50;
        let discount = 0;
        const validItems = [];

        for (const item of orderItems) {
            const product = isBuyNow ? item.productId : await Product.findById(item.productId._id).populate('category');
            if (!product) {
                console.warn('Product not found:', item.productId);
                continue;
            }
            if (product.quantity < item.quantity) {
                return res.render('user/checkout', {
                    addresses: addressDoc.address,
                    selectedAddress: addressDoc.address.find(addr => addr._id.toString() === selectedAddress),
                    cart: { items: orderItems },
                    userName: req.session.userName || null,
                    error: `Insufficient stock for ${product.productName}`,
                    categories: await Category.find({ isListed: true }),
                    subtotal: 0,
                    tax: 0,
                    shipping: 0,
                    discount: 0,
                    total: 0
                });
            }
            if (
                product.isBlocked ||
                !product.category.isListed ||
                product.status === 'Out of Stock'
            ) {
                console.warn('Invalid product:', product.productName);
                continue;
            }
            validItems.push({
                productId: product._id,
                quantity: item.quantity,
                price: product.salePrice,
                productName: product.productName
            });
            const itemTotal = item.quantity * product.salePrice;
            subtotal += itemTotal;
            const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
            const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
            discount += Math.max(productDiscount, categoryDiscount);

            // Update product stock
            product.quantity -= item.quantity;
            if (product.quantity <= 0) {
                product.status = 'Out of Stock';
            }
            await product.save();
        }

        // Update cart only if it's not a buy now order
        if (!isBuyNow) {
            const cart = await Cart.findOne({ userId });
            if (cart && validItems.length !== cart.items.length) {
                cart.items = validItems;
                await cart.save();
            }
        }

        if (!validItems.length) {
            return res.render('user/checkout', {
                addresses: addressDoc.address,
                selectedAddress: addressDoc.address.find(addr => addr._id.toString() === selectedAddress),
                cart: { items: [] },
                userName: req.session.userName || null,
                error: isBuyNow ? 'Product not available' : 'No valid items in cart',
                categories: await Category.find({ isListed: true }),
                subtotal: 0,
                tax: 0,
                shipping: 0,
                discount: 0,
                total: 0
            });
        }

        tax = subtotal * 0.05;

        // Apply offer discount if available
        let offerDiscount = 0;
        let appliedOffer = null;
        if (req.session.appliedOffer) {
            offerDiscount = req.session.appliedOffer.discountAmount || 0;
            appliedOffer = req.session.appliedOffer;
        }

        const total = subtotal + tax + shipping - discount - offerDiscount;

        const selectedAddr = addressDoc.address.find(addr => addr._id.toString() === selectedAddress);

        // Save order to database
        const order = new Order({
            userId,
            orderID: generateOrderID(),
            items: validItems,
            shippingAddress: {
                addressType: selectedAddr.addressType,
                fullName: selectedAddr.fullName,
                phone: selectedAddr.phone,
                secPhone: selectedAddr.secPhone,
                houseName: selectedAddr.houseName,
                city: selectedAddr.city,
                state: selectedAddr.state,
                pincode: selectedAddr.pincode,
                landMark: selectedAddr.landMark
            },
            paymentMethod,
            subtotal,
            tax,
            shipping,
            discount,
            offerDiscount: offerDiscount,
            appliedOffer: appliedOffer ? {
                code: appliedOffer.code,
                discountAmount: offerDiscount
            } : null,
            total,
            status: 'Pending',
            orderDate: new Date()
        });
        await order.save();

        // Apply referral rewards if eligible
        try { await applyReferralRewards(order); } catch (e) { console.error('Referral reward error (COD):', e); }

        // Track coupon usage if applied
        if (appliedOffer && appliedOffer.code) {
            try {
                await Coupon.findOneAndUpdate(
                    { code: appliedOffer.code.toUpperCase() },
                    {
                        $push: {
                            usedBy: {
                                userId: userId,
                                orderId: order._id,
                                usedAt: new Date(),
                                discountAmount: offerDiscount
                            }
                        },
                        $set: { updatedAt: new Date() }
                    }
                );
                console.log(`Coupon ${appliedOffer.code} usage tracked for order ${order.orderID}`);
            } catch (error) {
                console.error('Error tracking coupon usage:', error);
                // Don't fail the order if coupon tracking fails
            }
        }

        // Clear cart or buy now session
        if (isBuyNow) {
            // Clear buy now session data
            delete req.session.buyNowProduct;
        } else {
            // Clear regular cart
            const cart = await Cart.findOne({ userId });
            if (cart) {
                cart.items = [];
                await cart.save();
            }
        }

        // Clear applied offer from session
        delete req.session.appliedOffer;

        // Store order details in session for confirmation page
        req.session.orderDetails = {
            orderID: order.orderID,
            address: order.shippingAddress,
            items: order.items,
            subtotal,
            tax,
            shipping,
            discount,
            total,
            paymentMethod,
            orderDate: order.orderDate
        };

        return res.redirect('/order-confirmation');
    } catch (error) {
        console.error('Error placing order:', error);
        return res.render('user/checkout', {
            addresses: [],
            selectedAddress: null,
            cart: { items: [] },
            userName: req.session.userName || null,
            error: 'Failed to place order. Please try again.',
            categories: await Category.find({ isListed: true }),
            subtotal: 0,
            tax: 0,
            shipping: 0,
            discount: 0,
            total: 0
        });
    }
};

exports.getOrderConfirmation = async (req, res) => {
    try {
        const orderDetails = req.session.orderDetails || null;
        const categories = await Category.find({ isListed: true });

        // Clear order details from session after rendering
        req.session.orderDetails = null;

        res.render('user/orderConfirmation', {
            userName: req.session.userName || null,
            message: 'Order placed successfully!',
            orderDetails,
            categories
        });
    } catch (error) {
        console.error('Error rendering order confirmation:', error);
        res.render('user/orderConfirmation', {
            userName: req.session.userName || null,
            message: 'Order placed successfully!',
            orderDetails: null,
            categories: [],
            error: 'Failed to load order confirmation details'
        });
    }
};

// Get Order Listing
exports.getOrderList = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { page = 1, search = '' } = req.query;
        const itemsPerPage = 10;

        // Validate userId - check if it's a valid ObjectId and not an admin session
        if (!userId || !mongoose.Types.ObjectId.isValid(userId) || userId === 'admin' || req.session.role === 'admin') {
            return res.render('user/orderList', {
                orders: [],
                userName: req.session.userName || null,
                error: 'Access denied. Please login as a user to view orders.',
                categories: await Category.find({ isListed: true }),
                currentPage: 1,
                totalPages: 0,
                searchQuery: ''
            });
        }

        const query = { userId };
        if (search) {
            query.orderID = { $regex: search, $options: 'i' };
        }

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / itemsPerPage);

        const orders = await Order.find(query)
            .sort({ orderDate: -1 })
            .skip((page - 1) * itemsPerPage)
            .limit(itemsPerPage)
            .lean();

        const categories = await Category.find({ isListed: true });

        res.render('user/orderList', {
            orders,
            userName: req.session.userName || null,
            error: null,
            categories,
            currentPage: parseInt(page),
            totalPages,
            searchQuery: search
        });
    } catch (error) {
        console.error('Error fetching order list:', error);
        res.render('user/orderList', {
            orders: [],
            userName: req.session.userName || null,
            error: 'Failed to load orders',
            categories: [],
            currentPage: 1,
            totalPages: 0,
            searchQuery: ''
        });
    }
};

// Get Order Details
exports.getOrderDetails = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;

        // Validate orderId
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.render('user/orderError', {
                message: 'Invalid order ID',
                userName: req.session.userName || null,
                categories: await Category.find({ isListed: true })
            });
        }

        // Validate userId - check if it's a valid ObjectId and not an admin session
        if (!userId || !mongoose.Types.ObjectId.isValid(userId) || userId === 'admin' || req.session.role === 'admin') {
            return res.render('user/orderError', {
                message: 'Access denied. Please login as a user to view orders.',
                userName: req.session.userName || null,
                categories: await Category.find({ isListed: true })
            });
        }

        const order = await Order.findOne({ _id: orderId, userId }).lean();
        if (!order) {
            return res.render('user/orderError', {
                message: 'Order not found',
                userName: req.session.userName || null,
                categories: await Category.find({ isListed: true })
            });
        }

        const categories = await Category.find({ isListed: true });

        res.render('user/orderDetails', {
            order,
            userName: req.session.userName || null,
            error: null,
            categories
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.render('user/orderError', {
            message: 'Failed to load order details',
            userName: req.session.userName || null,
            categories: await Category.find({ isListed: true })
        });
    }
};

// Cancel Entire Order
exports.cancelOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;
        const { cancelReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Pending' && order.status !== 'Confirmed') {
            return res.status(400).json({ success: false, message: 'Order cannot be canceled' });
        }

        // Restore stock for each item
        for (const item of order.items) {
            const product = await Product.findById(item.productId);
            if (product) {
                product.quantity += item.quantity;
                product.status = product.quantity > 0 ? 'Available' : 'Out of Stock';
                await product.save();
            }
        }

        // Process wallet refund if payment was made via Razorpay
        let refundMessage = 'Order canceled successfully';
        console.log(`Order cancellation - Payment Method: ${order.paymentMethod}, Order Total: ₹${order.total}`);

        if (order.paymentMethod === 'card' || order.paymentMethod === 'razorpay') {
            try {
                const refundAmount = order.total;
                await processWalletRefund(userId, refundAmount, `Refund for canceled order #${order.orderID}`);
                refundMessage = `Order canceled successfully. ₹${refundAmount} has been refunded to your wallet.`;
                console.log(`Wallet refund processed: ₹${refundAmount} for canceled order ${order.orderID}`);
            } catch (refundError) {
                console.error('Error processing wallet refund for canceled order:', refundError);
                refundMessage = 'Order canceled successfully. Refund processing failed, please contact support.';
            }
        }

        order.status = 'Canceled';
        order.cancelReason = cancelReason || 'No reason provided';
        order.updatedAt = new Date();
        await order.save();

        res.status(200).json({ success: true, message: refundMessage });
    } catch (error) {
        console.error('Error canceling order:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel order' });
    }
};

// Cancel Specific Order Item
exports.cancelOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const userId = req.session.userId;
        const { cancelReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({ success: false, message: 'Invalid order or item ID' });
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Pending' && order.status !== 'Confirmed') {
            return res.status(400).json({ success: false, message: 'Order items cannot be canceled' });
        }

        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        const item = order.items[itemIndex];
        const product = await Product.findById(item.productId);
        if (product) {
            product.quantity += item.quantity;
            product.status = product.quantity > 0 ? 'Available' : 'Out of Stock';
            await product.save();
        }

        // Add cancellation reason to the item
        item.status = 'Canceled';
        item.cancelReason = cancelReason || 'No reason provided';
        order.items[itemIndex] = item;

        // Check if all items are canceled
        const allCanceled = order.items.every(i => i.status === 'Canceled');
        if (allCanceled) {
            order.status = 'Canceled';
            order.cancelReason = cancelReason || 'All items canceled';
        }

        // Calculate refund amount for this item
        const itemRefundAmount = item.price * item.quantity;

        // Update order totals
        order.subtotal -= itemRefundAmount;
        order.tax = order.subtotal * 0.05;
        order.total = order.subtotal + order.tax + order.shipping - order.discount;

        // Process wallet refund if payment was made via Razorpay
        let refundMessage = 'Order item canceled successfully';
        console.log(`Item cancellation - Payment Method: ${order.paymentMethod}, Item Refund: ₹${itemRefundAmount}`);

        if (order.paymentMethod === 'card' || order.paymentMethod === 'razorpay') {
            try {
                await processWalletRefund(userId, itemRefundAmount, `Refund for canceled item from order #${order.orderID}`);
                refundMessage = `Order item canceled successfully. ₹${itemRefundAmount} has been refunded to your wallet.`;
                console.log(`Wallet refund processed: ₹${itemRefundAmount} for canceled item from order ${order.orderID}`);
            } catch (refundError) {
                console.error('Error processing wallet refund for canceled item:', refundError);
                refundMessage = 'Order item canceled successfully. Refund processing failed, please contact support.';
            }
        }

        order.updatedAt = new Date();
        await order.save();

        res.status(200).json({ success: true, message: refundMessage });
    } catch (error) {
        console.error('Error canceling order item:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel order item' });
    }
};

// Return Specific Order Item
exports.returnOrderItem = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const userId = req.session.userId;
        const { returnReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({ success: false, message: 'Invalid order or item ID' });
        }

        if (!returnReason) {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in order' });
        }

        const item = order.items[itemIndex];

        // ✅ FIX: Check item.status instead of order.status
        if (item.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Only delivered items can be returned' });
        }

        item.status = 'Return Requested';
        item.returnReason = returnReason;
        order.items[itemIndex] = item;
        order.updatedAt = new Date();
        await order.save();

        res.status(200).json({ success: true, message: 'Return request submitted successfully' });
    }
    catch (error) {
        console.error('Error requesting return:', error);
        res.status(500).json({ success: false, message: 'Failed to submit return request' });
    }
};

// Return Order
exports.returnOrder = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;
        const { returnReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        if (!returnReason) {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
        }

        order.status = 'Return Requested';
        order.returnReason = returnReason;
        order.updatedAt = new Date();
        await order.save();

        res.status(200).json({ success: true, message: 'Return request submitted successfully' });
    } catch (error) {
        console.error('Error requesting return:', error);
        res.status(500).json({ success: false, message: 'Failed to submit return request' });
    }
};


const PDFDocument = require('pdfkit');

exports.downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.id;
        const userId = req.session.userId;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }

        const order = await Order.findOne({ _id: orderId, userId }).populate('items.productId');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const user = await User.findById(userId);

        // Create PDF document with larger right margin for totals
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4'
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=U-Craft_Invoice_${order.orderID}.pdf`);

        // Pipe PDF to response
        doc.pipe(res);

        // Add logo (replace with your actual logo path)
        // doc.image('public/images/logo.png', 50, 45, { width: 100 });

        // Add content to PDF
        generateInvoicePDF(doc, order, user);
        
        // Finalize PDF
        doc.end();
        
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).json({ success: false, message: 'Failed to generate invoice' });
    }
};

function generateInvoicePDF(doc, order, user) {
    // Constants for layout
    const leftColumn = 50;
    const rightColumn = 350;
    const pageWidth = 595;
    const pageCenter = pageWidth / 2;

    // Header Section
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text('U-CRAFT', { align: 'center' });
    
    doc.fontSize(14)
       .font('Helvetica')
       .text('INVOICE', { align: 'center' });
    
    // Horizontal line
    doc.moveTo(leftColumn, 100)
       .lineTo(pageWidth - leftColumn, 100)
       .lineWidth(1)
       .stroke();

    // Invoice Info (right aligned)
    doc.fontSize(10)
       .text(`Invoice #: ${order.orderID}`, rightColumn, 120, { width: 200, align: 'right' })
       .text(`Date: ${new Date(order.orderDate).toLocaleDateString()}`, rightColumn, 135, { width: 200, align: 'right' })
       .moveDown(1);

    // Customer Information
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('BILL TO:', leftColumn, 170);
    
    doc.font('Helvetica')
       .text(user.fullName, leftColumn, 190)
       .text(user.email, leftColumn, 205);
    
    if (user.phone) {
        doc.text(`Phone: ${user.phone}`, leftColumn, 220);
    }

    // Shipping Address
    doc.font('Helvetica-Bold')
       .text('SHIPPING ADDRESS:', leftColumn, 250);
    
    doc.font('Helvetica')
       .text(order.shippingAddress.fullName, leftColumn, 270)
       .text(order.shippingAddress.houseName, leftColumn, 285)
       .text(`${order.shippingAddress.city}, ${order.shippingAddress.state}`, leftColumn, 300)
       .text(`Pincode: ${order.shippingAddress.pincode}`, leftColumn, 315);
    
    if (order.shippingAddress.landMark) {
        doc.text(`Landmark: ${order.shippingAddress.landMark}`, leftColumn, 330);
    }

    // Order Items Table Header
    doc.font('Helvetica-Bold')
       .fontSize(12)
       .text('PRODUCT', leftColumn, 380)
       .text('QTY', 250, 380)
       .text('PRICE', 320, 380, { width: 90, align: 'right' })
       .text('TOTAL', 420, 380, { width: 90, align: 'right' })
    
    // Table line
    doc.moveTo(leftColumn, 395)
       .lineTo(pageWidth - leftColumn, 395)
       .lineWidth(1)
       .stroke();

    // Order Items
    let yPosition = 410;
    order.items.forEach(item => {
        const itemTotal = (item.quantity * item.price).toFixed(2);
        
        doc.font('Helvetica')
           .fontSize(10)
           .text(item.productName, leftColumn, yPosition, { width: 180 })
           .text(item.quantity.toString(), 250, yPosition)
           .text(`₹${item.price.toFixed(2)}`, 320, yPosition, { width: 90, align: 'right' })
           .text(`₹${itemTotal}`, 420, yPosition, { width: 90, align: 'right' })
           .text(item.status || 'N/A', 520, yPosition, { align: 'right' });
        
        yPosition += 20;
    });

    // Summary Section
    doc.moveTo(leftColumn, yPosition + 20)
       .lineTo(pageWidth - leftColumn, yPosition + 20)
       .lineWidth(1)
       .stroke();

    doc.font('Helvetica-Bold')
       .fontSize(12)
       .text('SUBTOTAL:', rightColumn, yPosition + 30, { width: 90, align: 'right' })
       .text(`₹${order.subtotal.toFixed(2)}`, 420, yPosition + 30, { width: 90, align: 'right' });

    doc.text('TAX (5%):', rightColumn, yPosition + 50, { width: 90, align: 'right' })
       .text(`₹${order.tax.toFixed(2)}`, 420, yPosition + 50, { width: 90, align: 'right' });

    doc.text('SHIPPING:', rightColumn, yPosition + 70, { width: 90, align: 'right' })
       .text(`₹${order.shipping.toFixed(2)}`, 420, yPosition + 70, { width: 90, align: 'right' });

    let currentYOffset = 90;

    // Product/Category Discount
    if (order.discount && order.discount > 0) {
        doc.text('PRODUCT DISCOUNT:', rightColumn, yPosition + currentYOffset, { width: 90, align: 'right' })
           .text(`-₹${order.discount.toFixed(2)}`, 420, yPosition + currentYOffset, { width: 90, align: 'right' });
        currentYOffset += 20;
    }

    // Offer Discount
    if (order.offerDiscount && order.offerDiscount > 0) {
        const offerText = order.appliedOffer && order.appliedOffer.code ?
            `OFFER (${order.appliedOffer.code}):` : 'OFFER DISCOUNT:';
        doc.text(offerText, rightColumn, yPosition + currentYOffset, { width: 90, align: 'right' })
           .text(`-₹${order.offerDiscount.toFixed(2)}`, 420, yPosition + currentYOffset, { width: 90, align: 'right' });
        currentYOffset += 20;
    }

    doc.moveTo(leftColumn, yPosition + currentYOffset + 20)
       .lineTo(pageWidth - leftColumn, yPosition + currentYOffset + 20)
       .lineWidth(1)
       .stroke();

    doc.fontSize(14)
       .text('TOTAL:', rightColumn, yPosition + currentYOffset + 30, { width: 90, align: 'right' })
       .text(`₹${order.total.toFixed(2)}`, 420, yPosition + currentYOffset + 30, { width: 90, align: 'right', underline: true });
    
    // Payment Method
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('PAYMENT METHOD:', leftColumn, yPosition + currentYOffset + 60)
       .font('Helvetica')
       .text(order.paymentMethod.toUpperCase(), leftColumn + 120, yPosition + currentYOffset + 60);
    
    // Footer
    doc.fontSize(10)
       .text('Thank you for shopping with U-Craft!', pageCenter, 750, { align: 'center' })
       .text('For any inquiries, please contact support@u-craft.com', pageCenter, 765, { align: 'center' });
}

exports.buyNow = async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.userId;
        // Default quantity to 1 if not provided
        let quantity = req.body.quantity;
        if (!quantity || isNaN(quantity) || quantity < 1) {
            quantity = 1;
        } else {
            quantity = parseInt(quantity, 10);
        }

        console.log('buyNow called with:', { productId, userId, quantity });

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.warn('Invalid product ID:', productId);
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        // Check if product exists and is not blocked/unlisted and category is listed
        const product = await Product.findById(productId).populate('category');
        console.log('Product data:', {
            exists: !!product,
            isBlocked: product?.isBlocked,
            categoryListed: product?.category?.isListed,
            categoryBlocked: product?.category?.isBlocked,
            quantity: product?.quantity,
            status: product?.status
        });

        if (!product) {
            console.warn('Product not found:', productId);
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        // Check if product or its category is blocked or unlisted
        if (
            product.isBlocked ||
            !product.category ||
            product.category.isBlocked ||
            !product.category.isListed
        ) {
            console.warn('Product or category is blocked/unlisted:', productId);
            return res.status(400).json({ success: false, message: 'Product or its category is blocked or unlisted' });
        }
        if (product.quantity === 0 || product.status === 'Out of Stock') {
            console.warn('Product out of stock:', productId);
            return res.status(400).json({ success: false, message: 'Product is out of stock' });
        }

        // Validate quantity
        if (quantity > product.quantity) {
            console.warn('Requested quantity exceeds stock:', { requested: quantity, available: product.quantity });
            return res.status(400).json({ success: false, message: 'Insufficient stock' });
        }
        if (quantity > MAX_QUANTITY_PER_PRODUCT) {
            console.warn('Requested quantity exceeds max limit:', { requested: quantity, max: MAX_QUANTITY_PER_PRODUCT });
            return res.status(400).json({ success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` });
        }

        // Store buy now product in session for direct checkout
        req.session.buyNowProduct = {
            productId: productId,
            quantity: quantity,
            product: {
                _id: product._id,
                productName: product.productName,
                salePrice: product.salePrice,
                productImage: product.productImage,
                description: product.description
            }
        };

        console.log('Buy now product stored in session:', req.session.buyNowProduct);

        // Remove from wishlist if exists (optional - user preference)
        await Wishlist.updateOne(
            { userId },
            { $pull: { products: productId } }
        );
        console.log('Wishlist updated: Removed product if present');

        // Redirect to checkout page with buy now flag
        res.redirect('/checkout?buyNow=true');
    } catch (error) {
        console.error('Error in buyNow:', error.message, error.stack);
        res.status(500).render('user/productError', { 
            message: 'Failed to process buy now', 
            userName: req.session.userName || null 
        });
    }
};

//razorpay

exports.createOrder = async (req,res) => {
  try {
    console.log('Create order request received:', req.body);

    if (!req.body.amount) {
      return res.status(400).json({ success: false, error: 'Amount is required' });
    }

    const amount = req.body.amount * 100; // in paise
    console.log('Amount in paise:', amount);

    const options = {
      amount,
      currency: "INR",
      receipt: `receipt_order_${Date.now()}`
    };

    console.log('Razorpay options:', options);
    console.log('Razorpay instance available:', !!global.razorpayInstance);

    if (!global.razorpayInstance) {
      return res.status(500).json({ success: false, error: 'Razorpay not initialized' });
    }

    const order = await global.razorpayInstance.orders.create(options);
    console.log('Razorpay order created:', order);
    res.json({ success: true, order });
  } catch (err) {
    console.error('Razorpay order creation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const crypto = require('crypto');

    // Create signature for verification
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Payment is verified, now place the order
      const userId = req.session.userId;
      const { selectedAddress, paymentMethod } = req.session.checkoutData || {};

      if (!selectedAddress) {
        return res.status(400).json({
          success: false,
          message: 'Checkout session expired. Please try again.'
        });
      }

      // Get cart items or buy now product
      let cartItems = [];
      const isBuyNow = req.session.buyNowProduct;

      if (isBuyNow) {
        const buyNowData = req.session.buyNowProduct;
        const product = await Product.findById(buyNowData.productId).populate('category');
        if (product) {
          cartItems = [{
            productId: product,
            quantity: buyNowData.quantity
          }];
        }
      } else {
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (cart && cart.items.length > 0) {
          cartItems = cart.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity
          }));
        }
      }

      if (!cartItems.length) {
        return res.status(400).json({
          success: false,
          message: 'No items found for order'
        });
      }

      // Process the order (similar to existing placeOrder logic)
      const result = await processOrderAfterPayment(userId, cartItems, selectedAddress, 'razorpay', req.session.appliedOffer);

      if (result.success) {
        // Clear session data
        if (isBuyNow) {
          delete req.session.buyNowProduct;
        } else {
          const cart = await Cart.findOne({ userId });
          if (cart) {
            cart.items = [];
            await cart.save();
          }
        }
        delete req.session.appliedOffer;
        delete req.session.checkoutData;

        res.json({
          success: true,
          orderId: result.orderId,
          message: 'Payment verified and order placed successfully'
        });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } else {
      res.status(400).json({ success: false, message: 'Payment verification failed' });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
};

// Payment success page
exports.paymentSuccess = async (req, res) => {
  try {
    const { orderId } = req.query;
    let order = null;

    if (orderId) {
      order = await Order.findById(orderId).populate('items.productId');
    }

    res.render('user/paymentSuccess', {
      userName: req.session.userName || null,
      order: order
    });
  } catch (error) {
    console.error('Error loading payment success page:', error);
    res.render('user/paymentSuccess', {
      userName: req.session.userName || null,
      order: null
    });
  }
};

// Payment failure page
exports.paymentFailure = async (req, res) => {
  try {
    const { orderId, reason } = req.query;

    res.render('user/paymentFailure', {
      userName: req.session.userName || null,
      orderId: orderId || null,
      reason: reason || 'Payment was not completed'
    });
  } catch (error) {
    console.error('Error loading payment failure page:', error);
    res.render('user/paymentFailure', {
      userName: req.session.userName || null,
      orderId: null,
      reason: 'Payment failed'
    });
  }
};

// Helper function to process order after successful payment
async function processOrderAfterPayment(userId, cartItems, selectedAddress, paymentMethod, appliedOffer) {
  try {
    // Get address details
    const addressDoc = await Address.findOne({ userId });
    if (!addressDoc) {
      return { success: false, message: 'Address not found' };
    }

    const selectedAddr = addressDoc.address.find(addr => addr._id.toString() === selectedAddress);
    if (!selectedAddr) {
      return { success: false, message: 'Selected address not found' };
    }

    // Calculate totals and validate stock
    let subtotal = 0;
    let tax = 0;
    let shipping = 50;
    let discount = 0;
    const validItems = [];

    for (const item of cartItems) {
      const product = await Product.findById(item.productId._id).populate('category');
      if (!product) {
        console.warn('Product not found:', item.productId);
        continue;
      }
      if (product.quantity < item.quantity) {
        return { success: false, message: `Insufficient stock for ${product.productName}` };
      }
      if (product.isBlocked || !product.category.isListed || product.status === 'Out of Stock') {
        console.warn('Invalid product:', product.productName);
        continue;
      }

      validItems.push({
        productId: product._id,
        quantity: item.quantity,
        price: product.salePrice,
        productName: product.productName
      });

      const itemTotal = item.quantity * product.salePrice;
      subtotal += itemTotal;

      // Apply product or category offer
      const productDiscount = product.offerPercentage ? (itemTotal * product.offerPercentage) / 100 : 0;
      const categoryDiscount = product.category.categoryOffer ? (itemTotal * product.category.categoryOffer) / 100 : 0;
      discount += Math.max(productDiscount, categoryDiscount);

      // Update product stock
      product.quantity -= item.quantity;
      if (product.quantity <= 0) {
        product.status = 'Out of Stock';
      }
      await product.save();
    }

    if (!validItems.length) {
      return { success: false, message: 'No valid items in order' };
    }

    tax = subtotal * 0.05;

    // Apply offer discount if available
    let offerDiscount = 0;
    if (appliedOffer) {
      offerDiscount = appliedOffer.discountAmount || 0;
    }

    const total = subtotal + tax + shipping - discount - offerDiscount;

    // Create order
    const order = new Order({
      userId,
      orderID: generateOrderID(),
      items: validItems,
      shippingAddress: {
        addressType: selectedAddr.addressType,
        fullName: selectedAddr.fullName,
        phone: selectedAddr.phone,
        secPhone: selectedAddr.secPhone,
        houseName: selectedAddr.houseName,
        city: selectedAddr.city,
        state: selectedAddr.state,
        pincode: selectedAddr.pincode,
        landMark: selectedAddr.landMark
      },
      paymentMethod,
      subtotal,
      tax,
      shipping,
      discount,
      offerDiscount: offerDiscount,
      appliedOffer: appliedOffer ? {
        code: appliedOffer.code,
        discountAmount: offerDiscount
      } : null,
      total,
      status: 'Pending',
      orderDate: new Date()
    });

    await order.save();

    // Track coupon usage if applied
    if (appliedOffer && appliedOffer.code) {
      try {
        await Coupon.findOneAndUpdate(
          { code: appliedOffer.code.toUpperCase() },
          {
            $push: {
              usedBy: {
                userId: userId,
                orderId: order._id,
                usedAt: new Date(),
                discountAmount: offerDiscount
              }
            },
            $set: { updatedAt: new Date() }
          }
        );
      } catch (error) {
        console.error('Error tracking coupon usage:', error);
      }
    }

    // Apply referral rewards if eligible
    try { await applyReferralRewards(order); } catch (e) { console.error('Referral reward error (Razorpay):', e); }

    return { success: true, orderId: order._id, orderNumber: order.orderID };
  } catch (error) {
    console.error('Error processing order:', error);
    return { success: false, message: 'Failed to process order' };
  }
}

exports.getCustomList = (req,res) =>{
    res.render('user/custom')
}

// Coming Soon Pages
exports.getCustomPage = (req, res) => {
    res.render('user/custom', {
        userName: req.session.userName || null
    });
};

exports.getAboutPage = (req, res) => {
    res.render('user/about', {
        userName: req.session.userName || null
    });
};

exports.getContactPage = (req, res) => {
    res.render('user/contact', {
        userName: req.session.userName || null
    });
};

// Apply offer during checkout
exports.applyOffer = async (req, res) => {
    try {
        const { offerCode } = req.body;
        const userId = req.session.userId;

        console.log('Apply offer request:', { offerCode, userId });

        if (!offerCode) {
            return res.status(400).json({ success: false, message: 'Please enter an offer code' });
        }

        // Get cart items or buy now product
        let cartItems = [];
        const isBuyNow = req.session.buyNowProduct;

        if (isBuyNow) {
            const buyNowData = req.session.buyNowProduct;
            const product = await Product.findById(buyNowData.productId).populate('category');
            if (product) {
                cartItems = [{
                    productId: product,
                    quantity: buyNowData.quantity
                }];
            }
        } else {
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (cart && cart.items.length > 0) {
                cartItems = cart.items.map(item => ({
                    productId: item.productId,
                    quantity: item.quantity
                }));
            }
        }

        if (!cartItems.length) {
            return res.status(400).json({ success: false, message: 'No items in cart to apply offer' });
        }

        // Validate and apply offer using admin controller function
        const result = await validateAndApplyOffer(offerCode, userId, cartItems);

        if (result.success) {
            // Store applied offer in session
            req.session.appliedOffer = {
                code: result.offer.code,
                discountAmount: result.discountAmount,
                eligibleTotal: result.eligibleTotal,
                eligibleItems: result.eligibleItems.map(item => item.productId._id.toString())
            };

            res.status(200).json({
                success: true,
                message: result.message,
                discountAmount: result.discountAmount,
                eligibleTotal: result.eligibleTotal
            });
        } else {
            res.status(400).json(result);
        }

    } catch (error) {
        console.error('Error applying offer:', error);
        res.status(500).json({ success: false, message: 'Failed to apply offer' });
    }
};

// Remove applied offer
exports.removeOffer = async (req, res) => {
    try {
        delete req.session.appliedOffer;
        res.status(200).json({ success: true, message: 'Offer removed successfully' });
    } catch (error) {
        console.error('Error removing offer:', error);
        res.status(500).json({ success: false, message: 'Failed to remove offer' });
    }
};

// Helper function to validate and apply offer
async function validateAndApplyOffer(offerCode, userId, cartItems) {
    try {
        // Find the coupon
        const offer = await Coupon.findOne({
            code: offerCode.toUpperCase(),
            isActive: true,
            isBlocked: false
        }).populate('applicableProducts applicableCategories');

        if (!offer) {
            return { success: false, message: 'Invalid offer code' };
        }

        // Check if offer is within date range
        const now = new Date();
        if (now < offer.startDate) {
            return { success: false, message: 'Offer is not yet active' };
        }
        if (now > offer.endDate) {
            return { success: false, message: 'Offer has expired' };
        }

        // Check global usage limit
        if (offer.usedBy.length >= offer.usageLimit) {
            return { success: false, message: 'Offer usage limit exceeded' };
        }

        // Check per-user usage limit
        const userUses = offer.usedBy.filter(usage => usage.userId && usage.userId.toString() === userId.toString()).length;
        if (typeof offer.perUserUse === 'number' && offer.perUserUse > 0 && userUses >= offer.perUserUse) {
            return { success: false, message: 'You have reached the usage limit for this offer' };
        }

        // Calculate eligible items and discount
        const eligibleItems = [];
        let eligibleTotal = 0;

        for (const item of cartItems) {
            const product = item.productId;
            let isEligible = false;

            if (offer.applicableType === 'all') {
                isEligible = true;
            } else if (offer.applicableType === 'products') {
                isEligible = offer.applicableProducts.some(p => p._id.toString() === product._id.toString());
            } else if (offer.applicableType === 'categories') {
                isEligible = offer.applicableCategories.some(c => c._id.toString() === product.category.toString());
            }

            if (isEligible) {
                const itemTotal = item.quantity * product.salePrice;
                eligibleItems.push({
                    ...item,
                    itemTotal
                });
                eligibleTotal += itemTotal;
            }
        }

        // Check minimum purchase requirement
        if (eligibleTotal < offer.minPurchase) {
            return {
                success: false,
                message: `Minimum purchase of ₹${offer.minPurchase} required for eligible items. Current eligible total: ₹${eligibleTotal}`
            };
        }

        // Calculate discount
        let discountAmount = 0;
        if (offer.discountType === 'percentage') {
            discountAmount = (eligibleTotal * offer.discountNumber) / 100;
        } else {
            discountAmount = offer.discountNumber;
        }

        // Apply maximum discount limit
        if (discountAmount > offer.maxDiscount) {
            discountAmount = offer.maxDiscount;
        }

        // Ensure discount doesn't exceed eligible total
        if (discountAmount > eligibleTotal) {
            discountAmount = eligibleTotal;
        }

        return {
            success: true,
            offer: offer,
            eligibleItems: eligibleItems,
            eligibleTotal: eligibleTotal,
            discountAmount: discountAmount,
            message: `Offer applied successfully! You saved ₹${discountAmount.toFixed(2)}`
        };

    } catch (error) {
        console.error('Error validating offer:', error);
        return { success: false, message: 'Failed to validate offer' };
    }
}

// Get available offers for user
async function getAvailableOffers(userId, cartItems) {
    try {
        const now = new Date();
        console.log('Getting available offers for user:', userId, 'at time:', now);

        // Find all active offers that are not expired and not blocked
        const offers = await Offer.find({
            isActive: true,
            isBlocked: false,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).populate('applicableProducts applicableCategories').lean();

        console.log('Found offers from database:', offers.length);
        offers.forEach(offer => {
            console.log(`Offer ${offer.code}: start=${offer.startDate}, end=${offer.endDate}, active=${offer.isActive}, blocked=${offer.isBlocked}`);
        });

        const availableOffers = [];

        for (const offer of offers) {
            // Check if user has already used this offer
            const userUsage = offer.usedBy.find(usage =>
                usage.userId && usage.userId.toString() === userId.toString()
            );

            if (userUsage) {
                continue; // Skip if user already used this offer
            }

            // Check if offer usage limit is reached
            if (offer.usedBy.length >= offer.usageLimit) {
                continue; // Skip if usage limit reached
            }

            // Check if user has eligible items for this offer
            let hasEligibleItems = false;
            let eligibleTotal = 0;

            for (const item of cartItems) {
                const product = item.productId;
                let isEligible = false;

                if (offer.applicableType === 'all') {
                    isEligible = true;
                } else if (offer.applicableType === 'products') {
                    isEligible = offer.applicableProducts.some(p =>
                        p._id.toString() === product._id.toString()
                    );
                } else if (offer.applicableType === 'categories') {
                    isEligible = offer.applicableCategories.some(c =>
                        c._id.toString() === product.category.toString()
                    );
                }

                if (isEligible) {
                    hasEligibleItems = true;
                    eligibleTotal += item.quantity * product.salePrice;
                }
            }

            if (hasEligibleItems) {
                // Calculate potential discount
                let potentialDiscount = 0;
                if (offer.discountType === 'percentage') {
                    potentialDiscount = (eligibleTotal * offer.discountNumber) / 100;
                } else {
                    potentialDiscount = offer.discountNumber;
                }

                // Apply maximum discount limit
                potentialDiscount = Math.min(potentialDiscount, offer.maxDiscount, eligibleTotal);

                // Check if minimum purchase requirement is met
                const meetsMinimum = eligibleTotal >= offer.minPurchase;

                availableOffers.push({
                    code: offer.code,
                    discountType: offer.discountType,
                    discountNumber: offer.discountNumber,
                    maxDiscount: offer.maxDiscount,
                    minPurchase: offer.minPurchase,
                    endDate: offer.endDate,
                    eligibleTotal: eligibleTotal,
                    potentialDiscount: potentialDiscount,
                    meetsMinimum: meetsMinimum,
                    applicableType: offer.applicableType,
                    usageRemaining: offer.usageLimit - offer.usedBy.length
                });
            }
        }

        return availableOffers;
    } catch (error) {
        console.error('Error getting available offers:', error);
        return [];
    }
}

// Apply referral rewards for the referee's first eligible order
async function applyReferralRewards(order) {
    try {
        if (!order || !order.userId) return;
        const user = await User.findById(order.userId);
        if (!user || !user.referredBy) return; // No referral associated

        // Ensure there is an active referral offer
        const now = new Date();
        const offer = await ReferralOffer.findOne({
            isActive: true,
            isBlocked: false,
            startDate: { $lte: now },
            endDate: { $gte: now }
        });
        if (!offer) return;

        // Check min purchase amount
        const orderTotal = order.total || 0;
        if (orderTotal < (offer.minPurchaseAmount || 0)) return;

        // Ensure this is the first eligible order for the referee
        const priorOrders = await Order.countDocuments({ userId: order.userId, _id: { $ne: order._id } });
        if (priorOrders > 0) return;

        // Check referrer limit
        const referrer = await User.findById(user.referredBy);
        if (!referrer) return;
        if (typeof offer.maxReferralsPerUser === 'number' && offer.maxReferralsPerUser >= 0) {
            if ((referrer.referralCount || 0) >= offer.maxReferralsPerUser) return;
        }

        // Helper to compute reward amount/points
        const computeReward = (type, value, maxCap, base) => {
            if (type === 'percentage') {
                const amt = (base * value) / 100;
                return Math.min(amt, maxCap || amt);
            } else if (type === 'amount') {
                return value;
            } else if (type === 'points') {
                return Math.max(0, Math.floor(value));
            }
            return 0;
        };

        // Calculate rewards
        const referrerType = offer.referrerRewardType;
        const referrerValue = offer.referrerRewardValue;
        const referrerMax = offer.referrerRewardType === 'percentage' ? offer.referrerMaxReward : undefined;
        const refereeType = offer.refereeRewardType;
        const refereeValue = offer.refereeRewardValue;
        const refereeMax = offer.refereeRewardType === 'percentage' ? offer.refereeMaxReward : undefined;

        const referrerReward = computeReward(referrerType, referrerValue, referrerMax, orderTotal);
        const refereeReward = computeReward(refereeType, refereeValue, refereeMax, orderTotal);

        // Credit referrer
        if (referrerType === 'points') {
            referrer.points = (referrer.points || 0) + referrerReward;
        } else {
            let refWallet = await Wallet.findOne({ userId: referrer._id });
            if (!refWallet) refWallet = new Wallet({ userId: referrer._id, balance: 0, transactions: [] });
            refWallet.balance += referrerReward;
            refWallet.transactions.push({
                type: 'credit',
                amount: referrerReward,
                description: `Referral reward (referrer) for order ${order.orderID}`,
                orderId: order._id
            });
            await refWallet.save();
        }

        // Credit referee
        if (refereeType === 'points') {
            user.points = (user.points || 0) + refereeReward;
        } else {
            let refWallet2 = await Wallet.findOne({ userId: user._id });
            if (!refWallet2) refWallet2 = new Wallet({ userId: user._id, balance: 0, transactions: [] });
            refWallet2.balance += refereeReward;
            refWallet2.transactions.push({
                type: 'credit',
                amount: refereeReward,
                description: `Referral reward (referee) for order ${order.orderID}`,
                orderId: order._id
            });
            await refWallet2.save();
        }

        // Update counts and tracking
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        await referrer.save();
        await user.save();

        offer.totalReferrals = (offer.totalReferrals || 0) + 1;
        const paid = (referrerType === 'points' ? 0 : referrerReward) + (refereeType === 'points' ? 0 : refereeReward);
        offer.totalRewardsPaid = (offer.totalRewardsPaid || 0) + paid;
        offer.updatedAt = new Date();
        await offer.save();

    } catch (err) {
        console.error('applyReferralRewards error:', err);
    }
}

// Helper to generate OTP
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000);
}

exports.handleLogout = (req,res) =>{
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.redirect('/home');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
}

// Wallet Management
// Generate or return the current user's referral code and share link
exports.getReferralCode = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (!user.referralCode) {
            const base = (user.fullName || 'USER').replace(/\s+/g, '').slice(0, 4).toUpperCase();
            let code;
            do {
                const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
                code = `${base}${rand}`;
            } while (await User.exists({ referralCode: code }));
            user.referralCode = code;
            await user.save();
        }

        const link = `${req.protocol}://${req.get('host')}/r/${user.referralCode}`;
        return res.json({ success: true, code: user.referralCode, link });
    } catch (error) {
        console.error('Error getting referral code:', error);
        return res.status(500).json({ success: false, message: 'Failed to get referral code' });
    }
};

exports.getWallet = async (req, res) => {
    try {
        const userId = req.session.userId;
        const categories = await Category.find({ isListed: true });

        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
            await wallet.save();
        }

        // Sort transactions by date (newest first)
        wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.render('user/wallet', {
            wallet,
            userName: req.session.userName || null,
            categories,
            error: null
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.render('user/wallet', {
            wallet: { balance: 0, transactions: [] },
            userName: req.session.userName || null,
            categories: await Category.find({ isListed: true }),
            error: 'Failed to load wallet information'
        });
    }
};

// Helper function to process wallet refund
exports.processWalletRefund = async function(userId, amount, description) {
    try {
        console.log(`Processing wallet refund: User ${userId}, Amount: ₹${amount}, Description: ${description}`);

        // Find or create wallet for user
        let wallet = await Wallet.findOne({ userId });
        console.log(`Existing wallet found:`, wallet ? `Balance: ₹${wallet.balance}, Transactions: ${wallet.transactions.length}` : 'No wallet found');

        if (!wallet) {
            console.log('Creating new wallet for user');
            wallet = new Wallet({
                userId: userId,
                balance: 0,
                transactions: []
            });
        }

        // Store old balance for logging
        const oldBalance = wallet.balance;

        // Add refund amount to wallet balance
        wallet.balance += amount;

        // Add transaction record
        const transaction = {
            type: 'credit',
            amount: amount,
            description: description,
            date: new Date()
        };

        wallet.transactions.push(transaction);
        console.log(`Transaction added:`, transaction);
        console.log(`Balance updated: ₹${oldBalance} → ₹${wallet.balance}`);

        // Save wallet
        const savedWallet = await wallet.save();
        console.log(`Wallet saved successfully. New balance: ₹${savedWallet.balance}, Total transactions: ${savedWallet.transactions.length}`);

        console.log(`Wallet refund successful: ₹${amount} added to user ${userId} wallet`);
        return { success: true, newBalance: wallet.balance };
    } catch (error) {
        console.error('Error processing wallet refund:', error);
        throw error;
    }
};

// Export the module
module.exports = exports;
