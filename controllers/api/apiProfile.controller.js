const User = require('../../models/user.model')
const Address = require('../../models/address.model')

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

        return res.status(500).json({
            success:false,
            message:"failed to load the profile..!"
        })
    }
}

exports.getAddress = async (req, res) => {
    try{
        const userId = req.params.userId
        const user = await User.findById(userId)

        console.log('address API is callled... !')

        if (!user) return res.status(404).json({success:false, messgae:'User not found'})
        
        const address = await Address.findOne({userId:userId})

        return res.status(200).json({success:true, message:'Address fetched successfullly..',address})
    }catch(error){
        console.log('Error while fecting address..!',error)
        return res.status(500).json({
            success:false,
            message:'Failed to load address...!'
        })
    }
}

exports.addAddress = async (req, res) => {
    try{

        const userId = req.params.userId
        const {addressType, fullName, phone, houseName, city, state, pincode, landMark} = req.body
        const user = await User.findById(userId)

        if(!user){
            return res.status(404).json({
                success:false,
                messgae:'User not Fond'
            })
        }

        

        const updatedAddress = await Address.findOneAndUpdate(
        { userId },
        {
            $push: {
            address: {
                addressType,
                fullName,
                phone,
                houseName,
                city,
                state,
                pincode,
                landMark
            }
            }
        },
        {
            new: true,
            upsert: true
        }
        );

        return res.status(200).json({
        success: true,
        message: "Address added successfully",
        address: updatedAddress
        });


    }catch(error){
        console.log('There is error while adding the address..!',error)
        return res.status(500).json({
            success: false,
            message:'Error while adding address'
            })
    }
}

exports.deleteAddress = async (req, res) => {
    try {
        const { userId } = req.params
        const { addressId } = req.body

        if (!userId || !addressId) {
            return res.status(400).json({
                success: false,
                message: 'userId and addressId are required'
            })
        }

        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            })
        }

        const addressDoc = await Address.findOne({ userId })
        if (!addressDoc) {
            return res.status(404).json({
                success: false,
                message: 'Address document not found'
            })
        }

        // Check if address exists
        const addressExists = addressDoc.address.some(addr => addr._id.toString() === addressId)
        if (!addressExists) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            })
        }

        // Remove the address
        const updatedAddress = await Address.findOneAndUpdate(
            { userId },
            {
                $pull: {
                    address: { _id: addressId }
                }
            },
            { new: true }
        )

        return res.status(200).json({
            success: true,
            message: 'Address deleted successfully',
            address: updatedAddress
        })

    } catch (error) {
        console.log('Error while deleting address..!', error)
        return res.status(500).json({
            success: false,
            message: 'Error while deleting address'
        })
    }
}

exports.editProfile = async (req, res) => {
    try {
        const { userId } = req.params
        const { fullName, phone, profileImage } = req.body

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId is required'
            })
        }

        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            })
        }

        // Build update object with only provided fields
        const updateFields = {}
        if (fullName !== undefined) updateFields.fullName = fullName
        if (phone !== undefined) updateFields.phone = phone
        if (profileImage !== undefined) updateFields.profileImage = profileImage
        
        // Add updated timestamp
        updateFields.updatedAt = new Date()

        // Validate phone number if provided
        if (phone !== undefined && phone && !/^\d{10}$/.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Phone number must be 10 digits'
            })
        }

        // Update user profile
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateFields,
            { new: true, runValidators: true }
        )

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        })

    } catch (error) {
        console.log('Error while editing profile..!', error)
        
        // Handle duplicate email error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Email already exists'
            })
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message)
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            })
        }

        return res.status(500).json({
            success: false,
            message: 'Error while updating profile'
        })
    }
}