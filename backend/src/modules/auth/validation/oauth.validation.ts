import { z } from "zod";

export const googleLoginSchema = z.object({
    idToken: z.string().min(1),
    role: z.enum(["student", "recruiter"]).optional()
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const resendOtpSchema = z.object({
  email: z.string().email(),
});