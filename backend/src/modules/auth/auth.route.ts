import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshAccessTokenSchema,
  registerSchema,
  resetPasswordSchema,
} from "./validation/auth.validation.js";

import {
  githubLoginSchema,
  googleLoginSchema,
  resendOtpSchema,
  verifyEmailSchema,
} from "./validation/oauth.validation.js";

import {
  forgetPassword,
  login,
  logout,
  refreshAccessToken,
  register,
  resendOtp,
  resetPassword,
  verifyEmail,
} from "./auth.controller.js";

import { githubLogin, googleLogin } from "./Oauth.controller.js";
import { Router } from "express";
import { authLimiter } from "../../middlewares/rateLimiter.js";
import { validate } from "../../middlewares/validation.js";

const authRoutes = Router() ;

authRoutes.post('/register' , authLimiter , validate(registerSchema) , register) ;
authRoutes.post('/verify_email' , authLimiter , validate(verifyEmailSchema) , verifyEmail);
authRoutes.post('/resend-otp' , authLimiter , validate(resendOtpSchema) , resendOtp);

authRoutes.post('/login' , authLimiter , validate(loginSchema) , login) ;
authRoutes.post('/refresh' , authLimiter , validate(refreshAccessTokenSchema) , refreshAccessToken) ;
authRoutes.post('/logout' , authLimiter , validate(logoutSchema) , logout) ;

authRoutes.post('/google' , authLimiter , validate(googleLoginSchema) , googleLogin) ;
authRoutes.post('/github' , authLimiter , validate(githubLoginSchema) , githubLogin) ;

authRoutes.post('/forgot-password' , authLimiter , validate(forgotPasswordSchema) , forgetPassword) ;
authRoutes.post('/reset-password' , authLimiter , validate(resetPasswordSchema) , resetPassword) ;


export default authRoutes ;