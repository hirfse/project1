const express = require('express')

const router = express.Router()

const apiAuth = require('../controllers/api/apiAuth.controller')

router.get('/login',(req,res)=>{
    res.status(200).json({message:"success"})
})


router.post('/login',apiAuth.handleAPILogin)
router.get('/home',apiAuth.getAPIHome)

module.exports = router;
