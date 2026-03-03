const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const morgan = require('morgan')
const fs = require('fs');
const nocache = require("nocache");
const Razorpay = require('razorpay')
require('dotenv').config();
require('./config/passport-config'); // Import Passport configuration

const PORT = process.env.PORT;

//api router
const apiRouter = require('./routes/api.routes.js')

const userRouter = require('./routes/user.routes');
const adminRouter = require('./routes/admin.routes.js');
const connectDB = require('./config/db');

connectDB();

const app = express();

// app.use(morgan('dev'));
app.use(nocache())
// Prevent caching
// app.use((req, res, next) => {
//     res.set("Cache-Control", "no-store");
//     next();
// });
app.use(express.json()); // Required for JSON requests
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.urlencoded({ extended: true }));

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, 'public/uploads/product-images');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}


app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URI,
            collectionName: 'sessions'
        }),
        cookie: {
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        }
    })
);

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Export Razorpay instance for use in controllers
global.razorpayInstance = razorpay;

app.use(passport.initialize());
app.use(passport.session());
app.use(morgan('dev'))

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// Expose session role/info to all templates for conditional script loading
app.use((req, res, next) => {
    res.locals.role = req.session && req.session.role ? req.session.role : null;
    res.locals.userRole = req.session && req.session.userRole ? req.session.userRole : null;
    res.locals.isAdmin = req.session && req.session.role === 'admin';
    res.locals.isUser = req.session && req.session.userRole === 'user';
    if (!res.locals.userName && req.session) res.locals.userName = req.session.userName;
    if (!res.locals.userEmail && req.session) res.locals.userEmail = req.session.userEmail;
    next();
});

//api route
app.use('/api', apiRouter)

app.use('/admin', adminRouter);
app.use('/', userRouter);

// 404 Handler - Must be after all other routes
const { notFound, errorHandler } = require('./middlewares/errorHandler.middleware');
app.use(notFound);

// Error Handler - Must be the last middleware
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    // Close server & exit process
    server.close(() => process.exit(1));
});

console.log(
  "STATIC DIR =>",
  path.join(__dirname, "public/uploads/product-images")
);

const server = app.listen(PORT, () => console.log(`Server started @ port ${PORT}`));
