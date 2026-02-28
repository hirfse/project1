const HTTP_STATUS = require('../../constants/httpStatus');
const MESSAGES = require('../../constants/messages');
const User = require('../../models/user.model')
const Product = require('../../models/product.model')
const authService = require('../../services/authService');


exports.handleAPILogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await authService.authenticate(email, password);

        // ❌ Login Failed
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

        // ✅ Login success
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
