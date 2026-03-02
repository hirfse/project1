const express = require('express')

const router = express.Router()

const apiAuth = require('../controllers/api/apiAuth.controller')

router.post('/signup',apiAuth.handleAPISignup)
router.post('/verifyOTP',apiAuth.verifyOTP)

router.post('/login',apiAuth.handleAPILogin)
router.get('/home',apiAuth.getAPIHome)

module.exports = router;
