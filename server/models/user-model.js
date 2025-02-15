import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const userSchema = new mongoose.Schema({

  name:{
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/
  },
  password:{
    type: String,
    required: true,
    minlength: [6, "Password must be at least 6 characters"],
    select: false
  },
  phone:{
    type: String,
  },
  accountVerified: {type: Boolean, default: false},
  verificationCode:Number,
  verificationCodeExpire: Date,
  resetPasswordToken:String,
  resetPasswordExpire:Date,
  createdAt:{
    type: Date,
    default: Date.now
  }
});

// Hashing Password
userSchema.pre('save', async function (next) {  // ✅ Use regular function
  // Check if the password is already hashed
  if (!this.isModified('password')) {
    return next(); // ✅ Return to prevent further execution
  }

  this.password = await bcrypt.hash(this.password, 10);
  next();
});
// Compare Password
userSchema.methods.comparePassword = async function(enteredPassword){
  return await bcrypt.compare(enteredPassword, this.password);
}

// Generate Verification Code
userSchema.methods.generateVerificationCode = function () {  // ✅ Use regular function
  function generateRandomFiveDigitNumber() {
    const firstDigit = Math.floor(Math.random() * 9) + 1;
    const remainingDigits = Math.floor(Math.random() * 10000).toString().padStart(4, '0'); // ✅ Ensure proper 5-digit format

    return parseInt(firstDigit + remainingDigits);
  }

  this.verificationCode = generateRandomFiveDigitNumber();  // ✅ Now `this` works
  this.verificationCodeExpire = Date.now() + 5 * 60 * 1000;

  return this.verificationCode; // ✅ Return the code if needed
};

userSchema.methods.generateResetPasswordToken = function () { 
  const resetToken = crypto.randomBytes(20).toString("hex");

  this.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

  return resetToken;
}



export const User =  mongoose.model('User', userSchema);
