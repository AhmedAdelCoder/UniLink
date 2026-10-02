import { Request  , Response } from "express";
import { authService, IUser, login_data } from "../services/auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { success } from "zod";

const auth_service = new authService() ;

export const register = asyncHandler(
    async(req : Request , res : Response) =>{
        const data : IUser = req.body ;

        const user = await auth_service.register(data) ;

        res.status(201).json({
            msg : "User registered successfully" ,
            data : user
        });
    }
)

export const verifyEmail = asyncHandler(
    async(req : Request , res : Response) =>{
        const {email , code} = req.body ;
        
        await auth_service.verifyEmail(email , code) ;

        res.status(200).json({
            success : true ,
            msg : "Email verified successfully. You can login now"
        });
    }
)

export const resendOtp = asyncHandler(
    async(req : Request , res : Response) =>{
        const {email} = req.body ;

        await auth_service.resendOtp(email) ;

        res.status(200).json({
            success : true ,
            msg : "If the account exists and is not verified, a new code was sent"
        });
    }
)

export const login = asyncHandler(
    async(req : Request , res : Response) =>{
        const data : login_data = req.body ;

        const result = await auth_service.login(data) ;

        res.status(200).json({
            success : true ,
            msg : "Login successful" ,
            data : result
        });
    }
)

export const refreshAccessToken = asyncHandler(
    async(req : Request , res : Response) =>{
        const {refreshToken} = req.body ;

        const accessToken = await auth_service.refreshAccessToken(refreshToken) ;

        res.status(200).json({
            success : true ,
            msg : "Access token refreshed successfully" ,
            data : accessToken ,            
        });
    }
) 

export const logout = asyncHandler(
    async(req : Request , res : Response) =>{
        const {refreshToken} = req.body ;

        await auth_service.logout(refreshToken) ;

        res.status(200).json({
            success : true ,
            msg : "Logout successfully"
        });
    }
)

export const forgetPassword = asyncHandler(
    async(req : Request , res : Response) =>{
        const {email} = req.body ;

        await auth_service.forgotPassword(email) ;

        res.status(200).json({
            success : true ,
            msg : "If an account exists, a reset code has been sent"
        })
    }
)

export const resetPassword = asyncHandler(
    async(req : Request , res : Response) =>{
        const {email , code , newPassword} = req.body ;

        await auth_service.resetPassword(email , code , newPassword) ;

        res.status(200).json({
            success : true ,
            msg : "Password reset successfully. You can login now"
        })
    }
)