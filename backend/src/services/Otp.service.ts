import prisma from "../config/postgres.js";
import { AppError } from "../utils/AppError.js";
import { sendOtpEmail } from "../utils/Mailer.js";
import { generateOtp, hashOtp, isOtpMatch } from "../utils/Otp.js";


const OTP_TTL_MS = 10 * 60 * 1000;   
const RESEND_COOLDOWN_MS = 60 * 1000; 
const MAX_ATTEMPTS = 5;               

export class OtpService  {

    async issueOtp(user : {id : string , email : string}) {

        const last = await prisma.emailOtp.findFirst({
            where : {
                userId : user.id
            } ,
            orderBy : {
                createdAt : "desc"
            }
        });

        if(last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
            throw new AppError("Please wait a minute before requesting another code" , 429) ;
        }

        const code = generateOtp() ;
        const codeHash = hashOtp(user.id , code) ;

        await prisma.$transaction([
            prisma.emailOtp.deleteMany({
                where : {
                    userId : user.id
                }
            }) ,
            prisma.emailOtp.create({
                data : {
                    userId : user.id ,
                    codeHash : codeHash ,
                    expiresAt : new Date(Date.now() + OTP_TTL_MS)
                },
            }),
        ]);

        try {
            await sendOtpEmail(user.email , code) ;
        }
        catch(err) {
            throw new AppError("Could not send verification email. Try resending the code." , 502) ;
        }
    }

    async verifyOtp(userId : string , code : string){
        const otp = await prisma.emailOtp.findFirst({
            where : {
                userId : userId
            } ,
            orderBy : {
                createdAt : "desc"
            }
        });

        if(!otp) {
            throw new AppError("Invalid or expired code" , 400) ;
        }

        if(otp.expiresAt <= new Date()) {
            throw new AppError("Invalid or expired code" , 400) ;
        }

        if(otp.attempts >= MAX_ATTEMPTS) {
            throw new AppError("Too many attempts. Please request a new code" , 429) ;
        }

        if(!isOtpMatch(otp.codeHash , userId , code)){
            await prisma.emailOtp.update({
                where : {
                    id : otp.id
                } ,
                data : {
                    attempts : { increment : 1}
                }
            });

            throw new AppError("Invalid or expired code" , 400) ;
        }
    }

}