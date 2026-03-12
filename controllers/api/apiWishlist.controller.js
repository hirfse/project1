const Product = require('../../models/product.model')
const User = require('../../models/user.model')
const Wishlist = require('../../models/wishlist.model')
const mongoose = require('mongoose')

exports.getWishlist = async (req,res) => {
    try{
        const userId = req.params.userId
        
        console.log('Wishlist API is called ...! ')

        const wishlist = await Wishlist.find({userId})
        
        return res.status(200).json({
            success: true,
            wishlist
        })



    }catch(error){
        console.log(error)
    }
};