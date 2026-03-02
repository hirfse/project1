const HTTP_STATUS = require('../../constants/httpStatus');
const MESSAGES = require('../../constants/messages');
const User = require('../../models/user.model')
const Product = require('../../models/product.model')
const authService = require('../../services/authService');


exports.handleAPISignup = async (req,res) => {
    try{
        const {fullName, email, password} = req.body
        const nameRule = /^[A-Za-z ]{3,}$/
        const passRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+{|[\]\\:";'<>?,./]).{4,}$/;
        const emailRule = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

        if (!fullName || !email || !password){
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                message : MESSAGES.INVALID_CREDENTIALS
            })
        }

        if( !nameRule.test(fullName) ){
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                message : "Invalid name format"
            })
        }
        if ( !passRule.test(password) ) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                message : "Password must contian min 4 char, one UpperCase , one Lower case and one Special "
            })
        }

        if( !emailRule.test(email) ){
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                message : "Invalid email format"
            })
        }

        const existingUser = await User.findOne({email})

        if(existingUser){
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                message: "User already registerd with this email"
            })
        }

        const {otp} = await authService.generateSignupOTP(email)
        console.log(otp)

        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "OTP sent",
            data: {
                email,
                otp_dev_only: otp   // ⚠ remove in production
            }
        });

    }catch(error){
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            error: MESSAGES.SERVER.INTERNAL_ERROR
        })
    }
}

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp, fullName, phone, password } = req.body;

    if (!email || !otp || !fullName || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing fields"
      });
    }

    // 🔐 Verify OTP
    const verification = authService.verifySignupOTP(email, otp);

    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.reason === 'expired'
          ? "OTP expired"
          : "Invalid OTP"
      });
    }

    // 🔒 Hash password
    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash(password, 10);

    // 💾 Create user
    const user = new User({
      fullName,
      email,
      phone,
      password: hashedPassword,
      role: "user"
    });

    await user.save();

    return res.status(201).json({
      success: true,
      message: "Signup successful",
      userId: user._id
    });

  } catch (err) {
    return res.status(500).json({ success:false, message:"Server error" });
  }
};

exports.handleAPILogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await authService.authenticate(email, password);

       
        if (!result.success) {
            const code = result.code;

            if (code === 'ACCOUNT_BLOCKED') {
                return res.status(403).json({
                    success: false,
                    type: 'error',
                    code: 'ACCOUNT_BLOCKED',
                    message: MESSAGES.AUTH.ACCOUNT_BLOCKED
                });
            }

            if (code === 'USE_GOOGLE_AUTH') {
                return res.status(401).json({
                    success: false,
                    type: 'error',
                    code: 'USE_GOOGLE_AUTH',
                    message: MESSAGES.AUTH.USE_GOOGLE_AUTH
                });
            }

            return res.status(401).json({
                success: false,
                type: 'error',
                code: 'INVALID_CREDENTIALS',
                message: MESSAGES.AUTH.INVALID_CREDENTIALS
            });
        }

       
        return res.status(200).json({
        success: true,
        message: "Login successful",
        redirect: "/home",   // for app navigation logic
        user: {
            id: result.user._id,
            fullName: result.user.fullName,
            email: result.user.email,
            role: result.user.role
        }
        });

    } catch (error) {
        console.error('API Login Error:', error);
        return res.status(500).json({
            success: false,
            type: 'error',
            code: 'SERVER_ERROR',
            message: 'Internal server error. Please try again.'
        });
    }
};


exports.getAPIHome = async (req, res) => {
  try {
    const products = await Product.find({ isBlocked: false })
      .populate('category')
      .limit(20)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Home data fetched",
      data: {
        products
      }
    });

  } catch (error) {
    console.error("Home API Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load home data"
    });
  }
};
