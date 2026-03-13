
const Product = require('../../models/product.model')
const User = require('../../models/user.model')
const Wishlist = require('../../models/wishlist.model')
const mongoose = require('mongoose')

exports.getWishlist = async (req,res) => {
    try{
        const userId = req.params.userId
        
        console.log('Wishlist API is called ...! ')

        const wishlist = await Wishlist
        .findOne({ userId })
        .populate("products");

        return res.status(200).json({
        success: true,
        wishlist: wishlist ? wishlist.products : []
        });

    }catch(error){
        console.log(error)
    }
};

exports.addToWishlist = async (req,res) => {
    try{
        const {userId,productId} = req.body

        console.log('Add to Wishlist API is called ... !');

        const user = await User.findById(userId)
        const product = await Product.findById(productId)

        if(!user || !product){
            return res.status(404).json({
                success: false,
                message: 'User or Product is not valid'
            })
        }

        const updatedWishlist = await Wishlist.findOneAndUpdate(
            {userId},
            {
                $addToSet: {products:productId}
            },
            {
                new:true,
                upsert:true
            }

        )


        return res.status(201).json({
            success:true,
            message:' Product Added to Wishlist successfully...!',
            wishlist: updatedWishlist
        })


    }catch(error){
        console.log('There is a error while action add to wishlist...!!',error)

        return res.status(500).json({
            success:false,
            message: 'Error while adding to wishlist'
        })
    }
}