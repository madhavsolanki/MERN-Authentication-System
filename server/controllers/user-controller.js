import ErrorHandler from "../middlewares/error-middleware.js";
import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { User } from "../models/user-model.js";
import { sendEmail } from "../utils/sendEmail.js";
import twilio from "twilio";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// Registrer Controller
export const register = catchAsyncError(async (req, res, next) => {
  try {
    const { name, email, phone, password, verificationMethod } = req.body;

    if (!name || !email || !phone || !password || !verificationMethod) {
      return next(new ErrorHandler("All Fields Are required", 400));
    }

    function validatePhoneNumber(phone) {
      const regex = /^\+91\s?\d{10}$/;

      return regex.test(phone);
    }

    if (!validatePhoneNumber(phone)) {
      return next(new ErrorHandler("Invalid phone number", 400));
    }

    const existingUser = await User.findOne({
      $or: [
        {
          email,
          accountVerified: true,
        },
        {
          phone,
          accountVerified: true,
        },
      ],
    });

    if (existingUser) {
      return next(new ErrorHandler("Email or Phone already registered", 409));
    }

    const registrationAttemptsByUser = await User.find({
      $or: [
        { phone, accountVerified: false },
        { email, accountVerified: false },
      ],
    });

    if (registrationAttemptsByUser.length > 3) {
      return next(
        new ErrorHandler(
          "Too many failed login attempts (3). Please try again after 1 hour",
          429
        )
      );
    }

    const userData = {
      name,
      email,
      phone,
      password,
    };

    const user = await User.create(userData);

    const verificationCode = await user.generateVerificationCode();
    await user.save();  

    // ✅ Generate JWT Token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    // ✅ Store token in HTTP-Only Cookie
    res.cookie("token", token, {
      httpOnly: true,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    sendVerificationCode(verificationMethod, verificationCode, name, email, phone, res);
  } catch (error) {
    next(error);
  }
});

async function sendVerificationCode(
  verificationMethod,
  verificationCode,
  name,
  email,
  phone,
  res
) {
 try {
  if (verificationMethod === "email") {
    const message = generateEmailTemplate(verificationCode);
    await sendEmail({ email, subject: "Your Verification Code", message });
    res.status(200).json({
      success: true,
      message: `Verification Code Sent to ${name}`,
    });
  } else if (verificationMethod === "phone") {
    const verificationCodeWithSpace = verificationCode
      .toString()
      .split("")
      .join(" ");

    await client.calls.create({
      twiml: `<?xml version="1.0" encoding="UTF-8"?>
              <Response>
                  <Say voice="alice">Hello from Madhav's IT Hub! Your verification code is ${verificationCodeWithSpace}. Repeat, your verification code is ${verificationCodeWithSpace}.</Say>
              </Response>`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone  
    });

    res.status(200).json({
      success: true,
      message: `OTP Sent to ${phone}`,
    });
  } else {
    res.status(400).json({
      success: false,
      message: `Invalid Verification Method`,
    });
  }
 } catch (error) {
  console.error("Twilio Error:", error.message);
  res.status(500).json({
    success: false,
    message: "Verification Code Failed to Send",
    error: error.message,
  });
 }
}


function generateEmailTemplate(verificationCode) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
      <h2 style="color: #4CAF50; text-align: center;">Verification Code</h2>
      <p style="font-size: 16px; color: #333;">Dear User,</p>
      <p style="font-size: 16px; color: #333;">Your verification code is:</p>
      <div style="text-align: center; margin: 20px 0;">
        <span style="display: inline-block; font-size: 24px; font-weight: bold; color: #4CAF50; padding: 10px 20px; border: 1px solid #4CAF50; border-radius: 5px; background-color: #e8f5e9;">
          ${verificationCode}
        </span>
      </div>
      <p style="font-size: 16px; color: #333;">Please use this code to verify your email address. The code will expire in 10 minutes.</p>
      <p style="font-size: 16px; color: #333;">If you did not request this, please ignore this email.</p>
      <footer style="margin-top: 20px; text-align: center; font-size: 14px; color: #999;">
        <p>Thank you,<br>Your Company Team</p>
        <p style="font-size: 12px; color: #aaa;">This is an automated message. Please do not reply to this email.</p>
      </footer>
    </div>
  `;
}

// Verify OTP Controller
export const verifyOTP = catchAsyncError(async (req, res, next) => {

  const {email, otp, phone} = req.body;

  function validatePhoneNumber(phone) {
    const regex = /^\+91\s?\d{10}$/;

    return regex.test(phone);
  }

  if (!validatePhoneNumber(phone)) {
    return next(new ErrorHandler("Invalid phone number", 400));
  }

  try {
    const userAllEntries = await User.find({
      $or:[
        {
          email,
          accountVerified: false,
        },
        {
          phone,
          accountVerified: false,
        }
      ]
    }).sort({createdAt : -1});

    if(!userAllEntries){
      return next(new ErrorHandler("No user found with this email or phone number",404));
    }

    let user;

    if(userAllEntries.length > 1){

      user = userAllEntries[0];

      await User.deleteMany({
        _id:{ $ne: user._id },
        $or:[
          {phone, accountVerified:false},
          {email, accountVerified:false}
        ],
      });

    }else{
      user = userAllEntries[0];
    }

    if(user.verificationCode !== Number(otp)){
      return  next(new ErrorHandler("Invalid OTP",401))
     
    }


    const currentTime  = Date.now();

    const verificationCodeExpire = new Date(user.verificationCodeExpire).getTime();
    
    console.log(currentTime);
    console.log(verificationCodeExpire);

    if(currentTime > verificationCodeExpire){
      return next(new ErrorHandler("OTP Expired", 400));
    }
    
    user.accountVerified = true;
    user.verificationCode = null;

    user.verificationCodeExpire = null;

    await user.save({validateModifiedOnly : true});


    sendToken(user, 200, "Accout Verified", res);

  } catch (error) {
    return next(new ErrorHandler("Internal Server Error",500));    
  }

}); 

// Login User Controller
export const login  = catchAsyncError(async (req, res, next) => {

  const {email, password} = req.body;

  if(!email || !password){
    return next(new ErrorHandler("Email and Password are required",400));
  }


  try {
    const user = await User.findOne({email, accountVerified:true}).select("+password");
    
    if(!user ){
      return next(new ErrorHandler("Invalid Credentials",401));
    }
    
    const isMatch = await user.comparePassword(password);
    
    if(!isMatch){
      return next(new ErrorHandler("Invalid Credentials",401));
    }
    
   // ✅ Generate JWT Token
   const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

   // ✅ Store token in HTTP-Only Cookie
   res.cookie("token", token, {
     httpOnly: true,
     secure: process.env.NODE_ENV === "production",
     sameSite: "strict",
     expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
   });

   res.status(200).json({
     success: true,
     message: "Login successful",
     token, // Sending the token in response as well
     user: {
       id: user._id,
       name: user.name,
       email: user.email,
       phone: user.phone,
     },
   });


    
  } catch (error) {
    return next(new ErrorHandler("Internal Server Error",500));    
  }


});

// Logout User Controller
export const logout = catchAsyncError(async(req, res, next) => {
  res.status(200).cookie("token", "",{
    expires: new Date(Date.now()),
    httpOnly: true
  }).json({
    success: true,
    message: "Logged Out Successfully",
  });
});

// Get User Profile Controller
export const getUser = catchAsyncError(async(req, res, next) => {

  const user = req.user;  

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    },
  });

});


export const forgotPassword = catchAsyncError(async(req, res, next) => {
  const user = await User.findOne({email:req.body.email, accountVerified:true});

  if(!user){
    return next(new ErrorHandler("User Not Found", 404));
    }

    const resetToken = user.generateResetPasswordToken();

    await user.save({validateBeforeSave:false});

    const resetPasswordUrl = `${process.env.CLIENT_URL}/password/reset/${resetToken}`;

    const message = `Your Reset Password Token is \n\n ${resetPasswordUrl} \n\n If you have not requested this email then please ignore it`;

    try {
      sendEmail({email:user.email, subject:"MERN Authentication System Reset Password", message});

      res.status(200).json({
        success: true,
        message: `Reset Password Link Sent to Your Email ${user.email}`,
      });

    } catch (error) {
      user.resetPasswordToken=undefined;
      user.resetPasswordExpire=undefined;

      await user.save({validateBeforeSave: false});

      return next(new ErrorHandler(error.message || "Cannot Send Reset a Password Token", 500))
    }

});

export const resetPassword = catchAsyncError(async(req, res, next) => {
  const {token} = req.params;

  const resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: {$gt: Date.now()},
  });

  if(!user){
    return next(new ErrorHandler("Invalid or Expired Reset Password Token", 400));
  }

  if(req.body.password !== req.body.confirmPassword){
    return next(new ErrorHandler("Password & Confirm Password do not match", 400));
  }

  user.password = req.body.password;

  user.resetPasswordToken=undefined;
  user.resetPasswordExpire=undefined;

  await user.save();

  // ✅ Generate JWT Token
  const authToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

  // ✅ Store token in HTTP-Only Cookie
  res.cookie("token", authToken, {
    httpOnly: true,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  res.status(200).json({
    success: true,
    message: "Password Reset Successfully",
    authToken, // Sending the token in response as well
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    },
  });


});
