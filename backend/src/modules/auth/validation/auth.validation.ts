import {z} from 'zod' ;

export const registerSchema = z.object({
    fullName : z.string().min(2 , {message : "fullName must be at least 3 characters"}) ,
    email : z.string().email("Invalid email format") ,
    password : z.string().min(8  , {message : "Password must be at least 8 characters"}) ,
    role : z.enum(["student" , "recruiter"]) ,
});

export const loginSchema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(1, 'Password is required'),
});

export const refreshAccessTokenSchema = z.object({
    refreshToken : z.string().min(1 , "Refresh token is required")
});

export const logoutSchema = z.object({
    refreshToken : z.string().min(1 , "Refresh token is required")
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email"),

  code: z
    .string()
    .regex(/^\d{6}$/, "Code must be 6 digits"),

  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});