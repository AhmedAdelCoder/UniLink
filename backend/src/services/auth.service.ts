import prisma from "../config/postgres.js";
import { AppError } from "../utils/AppError.js";
import { generateAccessToken } from "../utils/jwt.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { generateRefreshToken , hashRefreshToken} from "../utils/refreshToken.js";
import env from "../config/env.js";
import { Role } from "@prisma/client";
import { OtpService } from "./Otp.service.js";

export interface IUser {
    fullName : string ;
    email : string ;
    password : string ;
    role : Role ;
}

export interface login_data {
    email : string ;
    password : string ;
}

const publicUserSelect = {
    id: true,
    email: true,
    fullName: true,
    role: true,
} as const ;

const otpService = new OtpService();

export class authService {

    async register(data : IUser) {
        const existing = await prisma.user.findUnique({
            where : {
                email : data.email
            }
        });

        if(existing?.emailVerified) {
            throw new AppError("User already registered" , 409) ;
        }

        const passwordHash = await hashPassword(data.password) ;  

        let user ;

        if(existing) {
            user = await prisma.user.update({
                where : {
                    id : existing.id
                } ,
                data : {
                    fullName : data.fullName,
                    passwordHash
                } ,
                select : publicUserSelect
            });

            await prisma.refreshToken.deleteMany({
                where : {
                    userId : existing.id
                }
            })
        }
        else {
            user = await prisma.user.create({
                data : {
                    fullName : data.fullName ,
                    email : data.email ,
                    passwordHash : passwordHash ,
                    skills : [] ,  
                    role : data.role              
                } ,
                select : publicUserSelect
            });
        }
        
        await otpService.issueOtp(user) ;

        return user ;
    }

    async verifyEmail(email : string , code : string) {
        const user = await prisma.user.findUnique({
            where : {email}
        });

        if(!user || user.emailVerified) {
            throw new AppError("Invalid or expired code" , 400) ;
        }

        await otpService.verifyOtp(user.id  , code) ;

        await prisma.$transaction([ 
            prisma.user.update({
                where : {
                    id : user.id
                } ,
                data : {
                    emailVerified : true
                }
            }) ,
            prisma.emailOtp.deleteMany({
                where : {
                    userId : user.id
                }
            })
        ]);
    }

    async resendOtp(email : string) {
        const user = await prisma.user.findUnique({
            where : {email}
        });

        if(!user || user.emailVerified) return ;

        await otpService.issueOtp(user) ;
    }

    async login(data : login_data) {
        const user = await prisma.user.findUnique({
            where : {
                email : data.email
            }
        });

        if(!user || !user.passwordHash) {
            throw new AppError("Invalid email or password" , 401) ;
        }

        const isPasswordValid = await comparePassword(data.password , user.passwordHash!) ;

        if(!isPasswordValid) {
            throw new AppError("Invalid email or password" , 401) ;
        }

        if(!user.emailVerified) {
            throw new AppError("Please verify your email first" , 403) ;
        }

        if(user.deletedAt) {
            throw new AppError("This account has been deleted", 403);
        }

        const accessToken = generateAccessToken({
            userId : user.id ,
            role : user.role
        });

        const refreshToken = generateRefreshToken() ;
        const refreshTokenHash = hashRefreshToken(refreshToken);
        const refreshTokenExpiresAt = new Date() ;

        refreshTokenExpiresAt.setDate(
            refreshTokenExpiresAt.getDate() + env.jwtRefreshExpiresIn
        )

        await prisma.refreshToken.create({
            data : {
                userId : user.id ,
                tokenHash : refreshTokenHash ,
                expiresAt : refreshTokenExpiresAt
            }
        });

        return {
            user : {
                id : user.id ,
                email : user.email ,
                fullName : user.fullName ,
                role : user.role
            } ,
            accessToken ,
            refreshToken ,
        }
    }

    async refreshAccessToken (refreshToken : string) {
        const tokenHash = hashRefreshToken(refreshToken) ;

        const storedToken = await prisma.refreshToken.findFirst({
            where : {
                tokenHash : tokenHash
            } ,
            include : {
                user : {
                    select : {
                        id : true ,
                        role : true ,
                    }
                }
            }
        });

        if(!storedToken) {
            throw new AppError("Invalid refresh token" , 401) ;
        }

        if(storedToken.revokedAt) {
            throw new AppError('Refresh token has been revoked', 401);
        }

        if(storedToken.expiresAt <= new Date()){
            throw new AppError('Refresh token expired', 401);
        }

        const accessToken = generateAccessToken({
            userId : storedToken.user.id ,
            role : storedToken.user.role
        });

        return {
            accessToken ,
        }
    }

    async logout(refreshToken : string) {
        const tokenHash = hashRefreshToken(refreshToken) ;

        const storedToken = await prisma.refreshToken.findFirst({
            where : {
                tokenHash
            }
        });

        if(!storedToken){
            throw new AppError("Invalid refresh token" , 401);
        }

        if(storedToken.revokedAt){
            throw new AppError("Refresh token already revoked" , 401);
        }

        await prisma.refreshToken.update({
            where : {
                id : storedToken.id
            } , 
            data :{
                revokedAt : new Date()
            }
        });
    }

    async forgotPassword(email : string) {
        const user = await prisma.user.findUnique({
            where : {email}
        });

        if(!user || !user.emailVerified || user.deletedAt) return ;

        await otpService.issueOtp(user) ;
    }

    async resetPassword(email : string , code : string , newpassword : string) {
        const user = await prisma.user.findUnique({
            where : {email}
        });

        if(!user || !user.emailVerified || user.deletedAt) {
            throw new AppError("Invalid or expired code" , 400) ;
        }

        await otpService.verifyOtp(user.id , code) ;

        const passwordHash = await hashPassword(newpassword) ;

        await prisma.$transaction([
            prisma.user.update({
                where : {
                    id : user.id
                } ,
                data : {
                    passwordHash
                }
            }) ,

            prisma.emailOtp.deleteMany({
                where : {
                    userId : user.id
                }
            }) ,

            prisma.refreshToken.updateMany({
                where : {
                    userId : user.id , 
                    revokedAt : null
                } ,
                data : {
                    revokedAt : new Date()
                }
            })
        ])
    }
}

