const mongoose = require('mongoose');
const User = require('../models/user.model');

exports.checkUserStatus = async (req, res, next) => {
  if (req.session.userId) {
    try {
      // Ensure userId is valid before querying
      if (!mongoose.isValidObjectId(req.session.userId)) {
        console.warn('Invalid userId in session:', req.session.userId);
        req.session.destroy(() => {
          return res.redirect('/login?error=Invalid session');
        });
        return;
      }

      // Check user status for all users
      const user = await User.findById(req.session.userId);
      if (!user) {
        req.session.destroy(() => {
          return res.redirect('/login?error=User not found');
        });
        return;
      }

      if (user.status === 'blocked') {
        req.session.destroy(() => {
          return res.redirect('/login?error=Your account has been blocked by admin');
        });
        return;
      }
    } catch (error) {
      console.error('Error checking user status:', error);
      return next();
    }
  }
  next();
};


exports.preventBackAfterLogout = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

// For regular users
exports.checkUserSession = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

// For admins
exports.checkAdminSession = (req, res, next) => {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.redirect('/admin/adminLogin');
  }
  next();
};