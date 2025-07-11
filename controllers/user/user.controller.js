// user.controller.js
const User = require('../../models/user.model');
const Product = require('../../models/product.model');
const Review = require('../../models/review.model');
const bcrypt = require('bcrypt');
const Category = require('../../models/category.model');
const Order = require('../../models/order.model'); // New Order model
const mongoose = require('mongoose');


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
            const newUser = new User({
                fullName,
                email,
                phone,
                password: hashedPassword,
                role: 'user',
                status: 'active'
            });
            await newUser.save();

            req.session.userId = newUser._id.toString();
            req.session.userEmail = newUser.email;
            req.session.userRole = newUser.role;
            req.session.userName = newUser.fullName;

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

        req.session.userId = user._id.toString();
        req.session.userEmail = user.email;
        req.session.userRole = user.role;
        req.session.userName = user.fullName;
        
        res.redirect('/home');
    } catch (error) {
        console.error(error);
        res.render('user/login', { error: 'Error occurred. Please try again.' });
    }
};


 //forgot page contoller

const nodemailer = require('nodemailer')//for sending otp
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
        const { page = 1, category, sort, search, minPrice, maxPrice } = req.query;
        const itemsPerPage = 8;

        // Only include products whose category is listed (not blocked)
        const query = { isBlocked: false };
        if (category) query.category = category;
        if (search) query.productName = { $regex: search, $options: 'i' };
        if (minPrice || maxPrice) {
            query.salePrice = {};
            if (minPrice) query.salePrice.$gte = parseFloat(minPrice);
            if (maxPrice) query.salePrice.$lte = parseFloat(maxPrice);
        }

        // Find all listed categories
        const listedCategories = await Category.find({ isListed: true }).select('_id');
        const listedCategoryIds = listedCategories.map(cat => cat._id);

        // Only show products whose category is listed
        query.category = query.category
            ? query.category
            : { $in: listedCategoryIds };

        let sortOption = {};
        if (sort === 'price_asc') sortOption.salePrice = 1;
        else if (sort === 'price_desc') sortOption.salePrice = -1;
        else if (sort === 'name_asc') sortOption.productName = 1;
        else if (sort === 'name_desc') sortOption.productName = -1;
        else if (sort === 'ratings') sortOption.averageRating = -1;
        else if (sort === 'newest') sortOption.createdAt = -1;
        else if (sort === 'featured') sortOption.isFeatured = -1;

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / itemsPerPage);

        const products = await Product.find(query)
            .populate('category')
            .sort(sortOption)
            .skip((page - 1) * itemsPerPage)
            .limit(itemsPerPage);

        // Filter out products whose category is not listed (in case of inconsistent data)
        const filteredProducts = products.filter(
            p => p.category && p.category.isListed
        );

        const categories = await Category.find();

        res.render('user/productList', {
            products: filteredProducts,
            userName: req.session.userName || null,
            error: req.query.error || null,
            currentPage: parseInt(page),
            totalPages,
            categories,
            selectedCategory: category || '',
            sort: sort || '',
            searchQuery: search || '',
            minPrice: minPrice || '',
            maxPrice: maxPrice || ''
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
        
        res.render('user/productDetails', {
            product,
            relatedProducts: filteredRelated,
            userName: req.session.userName || null
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

        console.log('Product data retrieved:', {
            _id: product._id,
            productName: product.productName,
            quantity: product.quantity,
            isBlocked: product.isBlocked,
            category: product.category ? {
                _id: product.category._id,
                name: product.category.name,
                isListed: product.category.isListed
            } : null
        });

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

        console.log('addToCart called with:', { productId, userId, quantity });

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.warn('Invalid product ID:', productId);
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        if (!quantity || isNaN(quantity) || quantity < 1) {
            console.warn('Invalid quantity:', quantity);
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
            newQuantity = cartItem.quantity + quantity;
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
            if (quantity > product.quantity) {
                console.warn('Requested quantity exceeds stock:', { requested: quantity, available: product.quantity });
                return res.status(400).json({ success: false, message: 'Insufficient stock' });
            }
            if (quantity > MAX_QUANTITY_PER_PRODUCT) {
                console.warn('Requested quantity exceeds max limit:', { requested: quantity, max: MAX_QUANTITY_PER_PRODUCT });
                return res.status(400).json({ success: false, message: `Cannot add more than ${MAX_QUANTITY_PER_PRODUCT} units of this product` });
            }
            cart.items.push({ productId, quantity });
            newQuantity = quantity;
            console.log('Added new item to cart:', { productId, quantity });
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
        res.status(500).json({ success: false, message: 'Failed to add to cart' });
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
      }
    }

    // Update cart if any items were invalid
    if (validItems.length !== cart.items.length) {
      cart.items = validItems;
      await cart.save();
    }

    res.render('user/cart', {
      cart: { items: validItems },
      userName: req.session.userName || null,
      error: null,
      categories
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

// Update Cart Quantity (Increment/Decrement)
exports.updateCartQuantity = async (req, res) => {
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

        // Fix: validProducts can be empty if all products are filtered out
        let validProducts = [];
        if (wishlist && wishlist.products && wishlist.products.length) {
            validProducts = wishlist.products.filter(product =>
                product &&
                !product.isBlocked &&
                product.category &&
                product.category.isListed &&
                product.quantity > 0 &&
                product.status !== 'Out of Stock'
            );

            // Remove invalid products from wishlist
            if (validProducts.length !== wishlist.products.length) {
                wishlist.products = validProducts.map(p => p._id);
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


// Checkout Page
exports.getCheckout = async (req, res) => {
    try {
        const userId = req.session.userId;
        const addressDoc = await Address.findOne({ userId });
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        const categories = await Category.find({ isListed: true });

        // Initialize default values
        let addresses = addressDoc ? addressDoc.address : [];
        let selectedAddress = null;
        let subtotal = 0;
        let tax = 0;
        let shipping = 50; // Flat shipping rate
        let discount = 0;
        let total = 0;

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

        // Calculate cart totals
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
            tax = subtotal * 0.05; // 5% tax
            total = subtotal + tax + shipping - discount;
        }

        res.render('user/checkout', {
            addresses,
            selectedAddress,
            cart: cart || { items: [] },
            userName: req.session.userName || null,
            error: cart && cart.items.length === 0 ? 'Your cart is empty' : null,
            categories,
            subtotal,
            tax,
            shipping,
            discount,
            total
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

        // Calculate totals and validate stock
        let subtotal = 0;
        let tax = 0;
        let shipping = 50;
        let discount = 0;
        const validItems = [];

        for (const item of cart.items) {
            const product = await Product.findById(item.productId._id).populate('category');
            if (!product) {
                console.warn('Product not found in cart:', item.productId);
                continue;
            }
            if (product.quantity < item.quantity) {
                return res.render('user/checkout', {
                    addresses: addressDoc.address,
                    selectedAddress: addressDoc.address.find(addr => addr._id.toString() === selectedAddress),
                    cart,
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
                console.warn('Invalid product in cart:', product.productName);
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
            product.quantity -= item.quantity;
            if (product.quantity <= 0) {
                product.status = 'Out of Stock';
            }
            await product.save();
        }

        if (validItems.length !== cart.items.length) {
            cart.items = validItems;
            await cart.save();
        }

        if (!validItems.length) {
            return res.render('user/checkout', {
                addresses: addressDoc.address,
                selectedAddress: addressDoc.address.find(addr => addr._id.toString() === selectedAddress),
                cart: { items: [] },
                userName: req.session.userName || null,
                error: 'No valid items in cart',
                categories: await Category.find({ isListed: true }),
                subtotal: 0,
                tax: 0,
                shipping: 0,
                discount: 0,
                total: 0
            });
        }

        tax = subtotal * 0.05;
        const total = subtotal + tax + shipping - discount;

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
            total,
            status: 'Pending',
            orderDate: new Date()
        });
        await order.save();

        // Clear cart
        cart.items = [];
        await cart.save();

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

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.render('user/orderError', {
                message: 'Invalid order ID',
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
                product.status = product.quantity > 0 ? 'In Stock' : product.status;
                await product.save();
            }
        }

        order.status = 'Canceled';
        order.cancelReason = cancelReason || 'No reason provided';
        order.updatedAt = new Date();
        await order.save();

        res.status(200).json({ success: true, message: 'Order canceled successfully' });
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
            product.status = product.quantity > 0 ? 'In Stock' : product.status;
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

        order.subtotal -= item.price * item.quantity;
        order.tax = order.subtotal * 0.05;
        order.total = order.subtotal + order.tax + order.shipping - order.discount;
        order.updatedAt = new Date();
        await order.save();

        res.status(200).json({ success: true, message: 'Order item canceled successfully' });
    } catch (error) {
        console.error('Error canceling order item:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel order item' });
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
           .text(`$${item.price.toFixed(2)}`, 320, yPosition, { width: 90, align: 'right' })
           .text(`$${itemTotal}`, 420, yPosition, { width: 90, align: 'right' })
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
       .text(`$${order.subtotal.toFixed(2)}`, 420, yPosition + 30, { width: 90, align: 'right' });
    
    doc.text('TAX (5%):', rightColumn, yPosition + 50, { width: 90, align: 'right' })
       .text(`$${order.tax.toFixed(2)}`, 420, yPosition + 50, { width: 90, align: 'right' });
    
    doc.text('SHIPPING:', rightColumn, yPosition + 70, { width: 90, align: 'right' })
       .text(`$${order.shipping.toFixed(2)}`, 420, yPosition + 70, { width: 90, align: 'right' });
    
    doc.text('DISCOUNT:', rightColumn, yPosition + 90, { width: 90, align: 'right' })
       .text(`-$${order.discount.toFixed(2)}`, 420, yPosition + 90, { width: 90, align: 'right' });
    
    doc.moveTo(leftColumn, yPosition + 110)
       .lineTo(pageWidth - leftColumn, yPosition + 110)
       .lineWidth(1)
       .stroke();
    
    doc.fontSize(14)
       .text('TOTAL:', rightColumn, yPosition + 120, { width: 90, align: 'right' })
       .text(`$${order.total.toFixed(2)}`, 420, yPosition + 120, { width: 90, align: 'right', underline: true });
    
    // Payment Method
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('PAYMENT METHOD:', leftColumn, yPosition + 150)
       .font('Helvetica')
       .text(order.paymentMethod.toUpperCase(), leftColumn + 120, yPosition + 150);
    
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

        if (cartItem) {
            // Update quantity if product is already in cart
            const newQuantity = quantity; // Use the requested quantity directly
            if (newQuantity > product.quantity) {
                console.warn('Insufficient stock:', { requested: newQuantity, available: product.quantity });
                return res.status(400).json({ success: false, message: 'Insufficient stock' });
            }
            cartItem.quantity = newQuantity;
            console.log('Updated cart item quantity:', cartItem.quantity);
        } else {
            // Add new item to cart
            cart.items.push({ productId, quantity });
            console.log('Added new item to cart:', { productId, quantity });
        }

        // Remove from wishlist if exists
        await Wishlist.updateOne(
            { userId },
            { $pull: { products: productId } }
        );
        console.log('Wishlist updated: Removed product if present');

        await cart.save();
        console.log('Cart saved successfully');

        // Redirect to checkout page
        res.redirect('/checkout');
    } catch (error) {
        console.error('Error in buyNow:', error.message, error.stack);
        res.status(500).render('user/productError', { 
            message: 'Failed to process buy now', 
            userName: req.session.userName || null 
        });
    }
};


exports.getCustomList = (req,res) =>{
    res.render('user/customListing')
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