const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    fullName:{
        type:String,
        required:true,
        trim:true
    },
    phone:{
        type:String,
        match:[/^\d{10}$/,'Phone number must be 10 digits']
    },
    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
        trim:true,
        match:[/^\S+@\S+\.\S+$/, 'Invalid email format']
    },
    password:{
        type:String,
    },

    password: { 
        type: String 
    }, // Optional for Google users
    googleId: { 
        type: String, unique: true 
    }, // For Google Authentication
    
    status:{
        type:String,
        enum:['active','blocked','unblocked']
    },
    role: {
        type:String,
        enum:['user','admin'],
        default:'user'
    },
    createdAt:{
        type: Date,
        default: Date.now
    },
    updatedAt:{
        type: Date,
        default: Date.now
    },
    profileImage: { type: String } // stores only the filename, not the full path
})

const User = mongoose.model('User',userSchema)
module.exports = User

