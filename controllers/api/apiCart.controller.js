const cartService = require('../../services/cartService');


exports.addToCart = async (req,res) => {
    try{
        const {userId, productId, quantity} = req.body
        console.log(req.body,userId, productId, quantity, 'Add To Cart API is called...!')

        const result =  await cartService.addToCart(userId,productId,quantity)

        console.log(result)

        if(!result.success){
            return res.status(404).json({
                success:false,
                message:'Error while adding the product'
            })

        }

        return res.status(201).json(result)

    }catch(error){

    console.error("ADD TO CART API ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
    }
}

exports.getCart = async (req, res) => {
    try{

        const userId = req.params.userId

        console.log('Cart API is called .... ')

        const result = await cartService.getCartData(userId)

        if(!result.success){
            return res.json(404).json(result)
        }

        return res.status(200).json(result)

    }catch(error){

    console.error(" CART API ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
    }
}

exports.removeCart = async (req,res) => {
    try{

        const {userId , productId} = req.body
        const result = await cartService.removeFromCart(userId,productId)

        console.log(result)

        if(!result.success){
            return res.status(404).json({
                success:false,
                message:'Error while adding the product'
            })

        }

        return res.status(201).json(result)
    }catch(error){

    console.error(" CART API ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
    }
        
    
}