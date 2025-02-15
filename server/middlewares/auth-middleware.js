import { User } from "../models/user-model.js";
import { catchAsyncError } from "./catchAsyncError.js";
import ErrorHandler from "./error-middleware.js";
import jwt from "jsonwebtoken";

export const isAuthenticated = catchAsyncError(async(req, res, next)=>{

  const {token} = req.cookies;

  if(!token){
    return next(new ErrorHandler("User not authenticated", 401));
  }
  
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  req.user = await User.findById(decoded.id);

  next();


});