const Product = require('../../models/cart.model')
const Cart = require('../../models/cart.model')


// this will not work accroding to cart model
// exports.addToCart = async (req,res) => {
//     try{
//         const id = req.params.id
        
//         const cart = {
//             productId:id,
//             quantity:1
//         }

//         await Cart.save(cart)
//         return res.status(201).json({
//             success:true,
//             message:"Successfully added to cart"
//         })

//     }catch(error){
//         console.error(`Error while adding to cart ${error}`)
//         return res.status(500).json({
//             success:false,
//             error:'Failed , add to cart!'
//         })
//     }
// } 