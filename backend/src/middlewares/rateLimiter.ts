import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
    windowMs : 15 * 60 * 1000 ,
    max : 10 ,
    message : {msg : "Too many attempts, please try again later"}
});