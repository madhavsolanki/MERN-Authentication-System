import mongoose from "mongoose";

export const connecteDb = (process.env.DB_URI, async()=>{
  try {
    await mongoose.connect(process.env.DB_URI);
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error.message);
    process.exit(1);
  }
}) ;

