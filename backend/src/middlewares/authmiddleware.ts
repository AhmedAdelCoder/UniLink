import jwt from 'jsonwebtoken' ;
import { Request , Response , NextFunction } from 'express';
import { Role } from '@prisma/client';
import env from '../config/env.js';

export interface jwtpayload {
    userId : string ;
    role : Role ;
}

export const authMiddleware = (roles : Role[] = []) =>{
    return (req : Request , res : Response , next : NextFunction) =>{
        const authHeader = req.headers.authorization ;

        if(!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                msg : "Unauthorized"
            });
        }

        const token = authHeader.split(' ')[1] ;

        try {
            const decoded = jwt.verify(token , env.jwtSecret as string) as jwtpayload ;

            req.user = decoded ;

            if(roles.length && !roles.includes(decoded.role as Role)) {
                return res.status(403).json({
                    msg : "Forbidden"
                });
            }

            next() ;
        }
        catch(arr : any) {
            res.status(401).json({
                msg : "Invalid token"
            });
        }
    }
}