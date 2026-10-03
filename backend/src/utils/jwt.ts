import jwt, { SignOptions } from 'jsonwebtoken' ;
import env from '../config/env.js';
import { Role } from '@prisma/client';

export interface AccessTokenPayload {
    userId : string ;
    role : Role
}

export const generateAccessToken = (payload : AccessTokenPayload) : string =>{
    const options : SignOptions = {
        expiresIn : env.jwtAccessExpiresIn as SignOptions["expiresIn"]
    }

    return jwt.sign(payload , env.jwtSecret! , options) ;
}