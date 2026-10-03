import { Request , Response } from "express";
import { oAuthService } from "../services/oauth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";


const oauth = new oAuthService() ;

export const googleLogin = asyncHandler(
    async(req : Request , res : Response) =>{
        const {idToken , role} = req.body ;
        
        const result = await oauth.googleLogin(idToken , role) ;

        res.status(200).json({
            success : true ,
            msg : "Login with google successfully" ,
            data : result
        });
    }
)