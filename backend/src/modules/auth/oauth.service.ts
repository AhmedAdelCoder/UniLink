import { Role, OAuthProvider } from "@prisma/client";

import prisma from "../../config/postgres.js";

import { generateAccessToken } from "../../utils/jwt.js";

import {
  generateRefreshToken,
  hashRefreshToken,
} from "../../utils/refreshToken.js";

import env from "../../config/env.js";

import { OAuth2Client } from "google-auth-library";

import { AppError } from "../../utils/AppError.js";

const googleClient = new OAuth2Client(env.googleClientId);

export interface OAuthProfile {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  fullName: string;
}

export interface OAuthLoginResult {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
  };
  accessToken: string;
  refreshToken: string;
}

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "UniLink-Backend",
};

export class oAuthService {

    async googleLogin(idToken : string , role? : Role) : Promise<OAuthLoginResult>{
        const profile = await this.verifyGoogleIdToken(idToken) ;
        return this.oauthLogin(profile , role) ;
    }

    async githubLogin(code : string , role? : Role) : Promise<OAuthLoginResult> {
        const githubAccessToken = await this.exchangeGitHubCode(code) ;
        const profile = await this.getGitHubProfile(githubAccessToken) ;
        return this.oauthLogin(profile , role) ;
    }   

    private async createAuthTokens( user : {id : string , role : Role}) {   

        const accessToken = generateAccessToken({
            userId : user.id ,
            role : user.role
        });

        const refreshToken = generateRefreshToken() ;
        const refreshTokenHash = hashRefreshToken(refreshToken) ;

        const refreshTokenExpiresAt  = new Date() ;

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
            accessToken ,
            refreshToken
        }
    }

    private async verifyGoogleIdToken  (idToken : string) {
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken ,
                audience : env.googleClientId
            });

            const payload = ticket.getPayload() ;

            if(!payload) {
                throw new AppError("Invalid Google ID token" , 401) ;
            }

            if(!payload.sub) {
                throw new AppError("Google account ID is missing" , 401) ;
            }

            if(!payload.email) {
                throw new AppError("Google email is missing" , 401) ;
            }

            if (!payload.email_verified) {
                throw new AppError('Google email is not verified', 400);
            }
            return {
                provider : OAuthProvider.google,
                providerAccountId: payload.sub,
                email: payload.email,
                fullName: payload.name || payload.email.split('@')[0],                
            }
        }  
        catch(error) {
            if(error instanceof AppError) {
                throw error ;
            }

            throw new AppError("Invalid Google ID token" , 401) ;
        }
    }

    private async exchangeGitHubCode(code : string) {
        if(! env.githubClientId || ! env.githubClientSecret) {
            throw new AppError("GitHub OAuth is not configured" , 500) ;
        }

        let response ;

        try {
            response = await fetch(
                "https://github.com/login/oauth/access_token" ,
                {
                method : "POST" ,
                headers : {
                Accept : "application/json" ,
                "Content-Type" : "application/json",
                'User-Agent' : GITHUB_HEADERS["User-Agent"]
                } ,
                body : JSON.stringify({
                client_id : env.githubClientId ,
                client_secret : env.githubClientSecret ,
                code                                                                                                                       
                })
                }
            )
        }
        catch{
            throw new AppError("Could not reach GitHub", 502);
        }


        if(!response.ok) {
            throw new AppError("Failed to exchange GitHub authorization code", 401);
        }

        const data = (await response.json()) as {
            access_token?: string;
            error?: string;
        }

        if(!data.access_token) {
            throw new AppError("Invalid GitHub authorization code", 401);
        }

        return data.access_token ;
    }

    private async getGitHubProfile(githubAccessToken : string) {

        const headers = {
            ...GITHUB_HEADERS , Authorization: `Bearer ${githubAccessToken}`,
        }
        
        const [userRes , emailRes] = await Promise.all([
            fetch("https://api.github.com/user" ,{headers}) ,
            fetch("https://api.github.com/user/emails" , {headers})
        ]).catch(() =>{
            throw new AppError("Could not reach GitHub", 502) ;
        });



        if(!userRes.ok) {
            throw new AppError("Failed to fetch GitHub user profile" , 401) ;
        }

        if(!emailRes.ok){
            throw new AppError("Failed to fetch GitHub emails" , 401) ;
        }

        const profile = (await userRes.json()) as {
            id : number ,
            login : string ,
            name : string | null ,
            email : string | null
        }

        const emails = (await emailRes.json()) as {
            email : string ,
            primary : boolean ,
            verified : boolean
        }[] ;

        if(!profile.id) {
            throw new AppError("GitHub account ID is missing" , 401) ;
        }

        const verifiedEmail = emails.find(
            (item) => item.primary && item.verified
        );

        if(!verifiedEmail) {
            throw new AppError("No verified primary email found in GitHub account" , 400) ;
        }

        const email = verifiedEmail.email ;

        return {
            provider : OAuthProvider.github ,
            providerAccountId : String(profile.id ),
            email ,
            fullName : profile.name || profile.login 
        }
    }

    private async oauthLogin(profile : OAuthProfile , role?: Role){
        const { provider, providerAccountId, email, fullName } = profile;

        const linked = await prisma.oAuthAccount.findUnique({
            where : {
                provider_providerAccountId : { provider , providerAccountId}
            } ,
            include : {
                user : true
            }
        });

        let user = linked?.user ;

        if(!user) {
            const existingUser = await prisma.user.findUnique({
                where : {
                    email
                }
            });

            if(existingUser) {
                await prisma.$transaction( async(tx) =>{
                    if(!existingUser.emailVerified) {
                        await tx.user.update({
                            where : {
                                id : existingUser.id
                            } ,
                            data : {
                                emailVerified : true
                            }
                        }) ;

                        await tx.refreshToken.deleteMany({
                            where : {
                                userId : existingUser.id
                            }
                        });

                        await tx.emailOtp.deleteMany({
                            where : {
                                userId : existingUser.id
                            }
                        });                        
                    }

                    await tx.oAuthAccount.create({
                        data : {
                            userId : existingUser.id ,
                            provider , providerAccountId
                        }
                    });       
                });

                user = existingUser ;
            }
            else {

                if(!role){
                    throw new AppError("Role is required when creating an account with OAuth" , 400) ;
                }

                user = await prisma.user.create({
                    data : {
                        email : email ,
                        fullName : fullName ,
                        role : role ,
                        passwordHash : null , // عشان هسجل ب google بس
                        emailVerified : true ,
                        oauthAccounts : {
                            create : {
                                provider : provider ,
                                providerAccountId : providerAccountId
                            }
                        }

                    }
                });
            }
        }

        if(user.deletedAt) {
            throw new AppError("This account has been deleted" , 403) ;
        }

        const tokens = await this.createAuthTokens(user) ;

        return {
            user : {
                id : user.id,
                fullName : user.fullName,
                email : user.email ,
                role : user.role
            } ,
            ...tokens
        }
    }
}