import crypto from 'crypto' ;
import env from '../config/env.js';

export const generateOtp = () : string =>{
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
} 

export const hashOtp = (userId : string , code : string) : string => {
    return crypto
        .createHmac("sha256", env.otpSecret)
        .update(`${userId}:${code}`)
        .digest("hex");
}

export const isOtpMatch = (expectedHash : string , userId : string , code : string) : boolean =>{
    const actual = Buffer.from(hashOtp(userId, code));
    const expected = Buffer.from(expectedHash);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}