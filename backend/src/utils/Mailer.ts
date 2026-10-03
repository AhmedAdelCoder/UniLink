import nodemailer from "nodemailer";
import env from "../config/env.js";

const transporter = env.smtpHost
    ? nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpPort === 465,
        auth: { user: env.smtpUser, pass: env.smtpPass },
    })
    : null;

export async function sendOtpEmail(to: string, code: string) {

    if (!env.isProd) {
        console.log(`[DEV] OTP for ${to}: ${code}`);
    }

    if (!transporter) {
        if (env.isProd) throw new Error("SMTP is not configured");
        return;
    }

    await transporter.sendMail({
    from: env.mailFrom,
    to,
    subject: "UniLink verification code",
    text: `Your UniLink verification code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your UniLink verification code is:</p>
            <h2 style="letter-spacing:4px">${code}</h2>
            <p>It expires in 10 minutes. If you did not request it, ignore this email.</p>`,
    });
}