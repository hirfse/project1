const User = require('../../models/user.model')

exports.getProfile = async (req,res) => {
    try{
        const userId = req.params.userId

        const user =  await User.findById(userId)

        if(!user){
            return res.status(401).json({
                success:false,
                message:" User not Found..!"
            })
        }

        return res.status(200).json({
            success:true,
            message:'User found..!',
            user
        })
        

    }catch(error){

    }
}