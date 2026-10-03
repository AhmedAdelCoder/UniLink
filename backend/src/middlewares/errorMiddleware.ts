import { Request , Response , NextFunction } from "express";
import { AppError } from "../utils/AppError.js";

export const errorMiddleware = (err : Error , req : Request , res : Response , next : NextFunction) =>{

    if(err instanceof AppError) {
        return res.status(err.statusCode).json({
            msg : err.message
        });
    }

    console.log(err) ;

    return res.status(500).json({
        msg : "Internal Server Error"
    });
}