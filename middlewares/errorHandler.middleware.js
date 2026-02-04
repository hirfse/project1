/**
 * Error handling middleware for Express
 * This should be the last middleware in the middleware chain
 */

const HTTP_STATUS = require('../constants/httpStatus');
const logger = require('../config/logger');

const errorHandler = (err, req, res, _next) => {
    // Mark _next as used to satisfy ESLint without changing behavior
    void _next;
    logger.error('Error:', { message: err.message, stack: err.stack, url: req.originalUrl, method: req.method });

    // Default error status and message
    const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const message = err.message || 'Internal Server Error';

    // Send JSON response for API errors
    if (req.xhr || req.originalUrl.startsWith('/api')) {
        return res.status(statusCode).json({
            success: false,
            error: message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }

    // Render error page for regular requests
    res.status(statusCode).render('error', {
        status: statusCode,
        message: message,
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
};

// 404 Not Found middleware
const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.statusCode = HTTP_STATUS.NOT_FOUND;
    next(error);
};

module.exports = {
    errorHandler,
    notFound
};
