const Order = require('../../models/order.model')
const Product = require('../../models/product.model')
const User = require('../../models/user.model')


exports.orderHandling = async(req,res) => {
    try{
        const {userId, porductId} = req.body
        
        const user = await User.findById(userId)
        console.log(userId, productId)
        if(!user){
            return res.status(404).json({
                success: false,
                message: "User Not Found..!"
            })
        }

        const product = await Product.findById(porductId)


        if(!product){
            return res.status(404).json({
                success: false,
                message: "Product Not Found..!"
            })
        }

        

    }catch(error){
        console.log('Error while handling order...!',error)
        return res.status(500).json({msg:'Error while handling order'})
    }
}