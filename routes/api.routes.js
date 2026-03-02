const express = require('express')

const router = express.Router()

const apiAuth = require('../controllers/api/apiAuth.controller')

const apiGoogleAuth = require('../controllers/api/apiGoogleAuth.controller');


router.post('/signup',apiAuth.handleAPISignup)
router.post('/verifyOTP',apiAuth.verifyOTP)
router.post('/resendOTP',apiAuth.resendOTP)
router.post('/auth/google', apiGoogleAuth.apiGoogleLogin);

router.post('/login',apiAuth.handleAPILogin)
router.get('/home',apiAuth.getAPIHome)

module.exports = router;
