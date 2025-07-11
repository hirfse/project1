const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const morgan = require('morgan')
const fs = require('fs');
const nocache = require("nocache");
require('dotenv').config();
require('./config/passport-config'); // Import Passport configuration

const PORT = process.env.PORT;
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
app.use(express.static('public'));
app.use('/images',express.static(path.join(__dirname,'folder')))
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

app.use(passport.initialize());
app.use(passport.session());
app.use(morgan('dev'))

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.use('/admin', adminRouter);
app.use('/', userRouter);


app.listen(PORT, () => console.log(`Server started @ port ${PORT}`));
