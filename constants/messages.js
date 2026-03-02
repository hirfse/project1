/**
 * Application response messages
 * Organized by feature/domain
 */

const AUTH = {
    INVALID_CREDENTIALS: 'Invalid credentials',
    LOGIN_FAILED: 'Login failed. Please try again.',
    SIGNUP_REQUIRED_FIELDS: 'All fields are required',
    SIGNUP_PASSWORD_MISMATCH: 'Password and confirm password do not match',
    SIGNUP_EMAIL_EXISTS: 'Email already exists',
    VERIFICATION_FAILED: 'OTP Verification failed',
    ACCOUNT_BLOCKED: 'Your account has been blocked. Please contact support.',
    USE_GOOGLE_AUTH: 'Please log in using Google Authentication',
    SIGNUP_PHONE_EXISTS: 'Phone number already registered',
    INVALID_OTP: 'Invalid OTP',
    OTP_EXPIRED: 'OTP has expired',
    SESSION_EXPIRED: 'Your session has expired. Please login again.',
    UNAUTHORIZED: 'You are not authorized to access this resource',
    FORGOT_PASSWORD_EMAIL_SENT: 'Password reset instructions sent to your email',
    PASSWORD_RESET_SUCCESS: 'Password reset successful. You can now login with your new password.'
};

const USER = {
    PROFILE_UPDATE_SUCCESS: 'Profile updated successfully',
    ADDRESS_ADDED: 'Address added successfully',
    ADDRESS_UPDATED: 'Address updated successfully',
    ADDRESS_DELETED: 'Address deleted successfully',
    ADDRESS_NOT_FOUND: 'Address not found',
    WALLET_TRANSACTION_SUCCESS: 'Transaction completed successfully',
    INSUFFICIENT_BALANCE: 'Insufficient wallet balance'
};

const PRODUCT = {
    NOT_FOUND: 'Product not found',
    OUT_OF_STOCK: 'Product is out of stock',
    ADDED_TO_CART: 'Product added to cart',
    REMOVED_FROM_CART: 'Product removed from cart',
    CART_UPDATED: 'Cart updated successfully',
    WISHLIST_ADDED: 'Added to wishlist',
    WISHLIST_REMOVED: 'Removed from wishlist'
};

const ORDER = {
    ORDER_PLACED: 'Order placed successfully',
    ORDER_NOT_FOUND: 'Order not found',
    ORDER_CANCELLED: 'Order cancelled successfully',
    ORDER_RETURNED: 'Return request submitted successfully',
    INVALID_ORDER_STATUS: 'Invalid order status for this operation',
    PAYMENT_SUCCESS: 'Payment successful',
    PAYMENT_FAILED: 'Payment failed. Please try again.'
};

const VALIDATION = {
    INVALID_EMAIL: 'Please enter a valid email address',
    INVALID_PHONE: 'Please enter a valid phone number',
    INVALID_PASSWORD: 'Password must be at least 6 characters long',
    REQUIRED_FIELD: 'This field is required',
    INVALID_INPUT: 'Invalid input provided'
};

const SERVER = {
    INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
    MAIL_SEND_ERROR: 'Error sending email. Please try again.',
    FILE_UPLOAD_ERROR: 'Error uploading file',
    ROUTE_NOT_FOUND: 'The requested resource was not found',
    MAINTENANCE_MODE: 'Service temporarily unavailable for maintenance'
};

module.exports = {
    AUTH,
    USER,
    PRODUCT,
    ORDER,
    VALIDATION,
    SERVER
};
