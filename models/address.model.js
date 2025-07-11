const mongoose = require('mongoose')

const addressSchema = new mongoose.Schema({
    userId:{
        type: mongoose.Types.ObjectId,
        ref:'User',
        required:true
    },
    address:[{
        addressType:{
            type:String,
            enum:['home', 'office', 'work'],
            required:true
        },
        fullName:{
            type:String,
            required:true
        },
        phone:{
            type: Number,
            required:true
        },
        secPhone:{
            type:Number
        },
        houseName:{
            type:String,
            required:true
        },
        city:{
            type:String,
            required:true
        },
        state:{
            type:String,
            required:true
        },
        pincode:{
            type:Number,
            required: true
        },
        landMark:{
            type:String,
            required:true
        }
    }]
    
},
{timestamps:true})


module.exports = mongoose.model("Address",addressSchema)