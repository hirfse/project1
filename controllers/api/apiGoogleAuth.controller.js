const { OAuth2Client } = require('google-auth-library');
const User = require('../../models/user.model');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.apiGoogleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "idToken is required"
      });
    }

    // ✅ Verify token with Google
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    const {
      sub: googleId,
      email,
      name,
      picture
    } = payload;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Google account has no email"
      });
    }

    // 🔍 Check if user exists
    let user = await User.findOne({
      $or: [
        { googleId },
        { email }
      ]
    });

    // 🆕 If user not exist → create
    if (!user) {
      user = new User({
        fullName: name,
        email,
        googleId,
        role: 'user',
        status: 'active',
        profileImage: picture || null
      });

      await user.save();
    }

    // 🔁 If user exists but googleId missing → link account
    if (!user.googleId) {
      user.googleId = googleId;
      await user.save();
    }

    // ✅ Send response to mobile
    return res.status(200).json({
      success: true,
      message: "Google login successful",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage
      }
    });

  } catch (error) {
    console.error("Google API Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Google authentication failed"
    });
  }
};
