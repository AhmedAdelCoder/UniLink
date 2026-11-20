import prisma from "../../config/postgres.js";
import { AppError } from "../../utils/AppError.js";
import { sendOtpEmail } from "../../utils/Mailer.js";
import { generateOtp, hashOtp, isOtpMatch } from "../../utils/Otp.js";

const OTP_TTL_MS = 10 * 60 * 1000;   
const RESEND_COOLDOWN_MS = 60 * 1000; 
const MAX_ATTEMPTS = 5;               

type OtpPersistence = Pick<typeof prisma, "emailOtp" | "$transaction">;
type OtpMailer = (to: string, code: string) => Promise<void>;

export class OtpService  {

    constructor(
        private readonly mailer: OtpMailer = sendOtpEmail,
        private readonly persistence: OtpPersistence = prisma,
    ) {}

    async issueOtp(user : {id : string , email : string}) {

        const code = generateOtp() ;
        const codeHash = hashOtp(user.id , code) ;

        await this.persistence.$transaction(async (tx) => {
            // Serialize issuance for this user across app instances. The lock
            // is held through delivery and persistence so concurrent resends
            // cannot both pass the cooldown check.
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;

            const last = await tx.emailOtp.findFirst({
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

            try {
                await this.mailer(user.email , code) ;
            }
            catch {
                // Transaction rollback preserves the previous OTP and cooldown.
                throw new AppError("Could not send verification email. Try resending the code." , 502) ;
            }

            await tx.emailOtp.deleteMany({ where: { userId: user.id } });
            await tx.emailOtp.create({
                data: {
                    userId: user.id,
                    codeHash,
                    expiresAt: new Date(Date.now() + OTP_TTL_MS),
                },
            });
        }, { timeout: 30_000 });
    }

    async verifyOtp(userId : string , code : string){
        const otp = await this.persistence.emailOtp.findFirst({
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
            await this.persistence.emailOtp.update({
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
