const mongoose = require('mongoose')
require('dotenv').config()
const connectDB =  async () =>{
    try{
        const conn = await mongoose.connect(process.env.MONGO_URI)
        console.log(`Database connected ${conn.connection.host}`)
    }
    catch(error){
        console.error('There were an issue while coonnecting DB ',error)
        process.exit(1)
    }
}

module.exports = connectDB