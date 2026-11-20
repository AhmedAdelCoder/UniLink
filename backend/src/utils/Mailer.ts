import nodemailer, { type Transporter } from "nodemailer";
import env from "../config/env.js";

type MailConfig = {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string;
};

type MailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

type MailTransport = Pick<Transporter, "sendMail">;

export function createEmailService(config: MailConfig, transport?: MailTransport) {
  const configuredTransport = transport ?? (config.host
    ? nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user && config.pass
          ? { user: config.user, pass: config.pass }
          : undefined,
      })
    : undefined);

  return {
    async sendVerificationEmail(to: string, code: string): Promise<void> {
      if (!config.host || !config.from || !config.user || !config.pass || !configuredTransport) {
        throw new Error("Email delivery is not configured");
      }
      if (!/^\d{6}$/.test(code)) {
        throw new Error("Verification code must contain exactly six digits");
      }

      const message: MailMessage = {
        from: config.from,
        to,
        subject: "Verify your UniLink email",
        text: `Your UniLink verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
        html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033">
  <div style="max-width:560px;margin:32px auto;padding:0 16px">
    <div style="background:#ffffff;border:1px solid #e5e9f0;border-radius:16px;overflow:hidden">
      <div style="padding:28px 32px;background:#173b72;color:#ffffff">
        <div style="font-size:23px;font-weight:700;letter-spacing:.3px">UniLink</div>
        <div style="margin-top:8px;font-size:14px;color:#dbeafe">Connect with your university community</div>
      </div>
      <div style="padding:32px">
        <h1 style="margin:0 0 12px;font-size:22px;color:#172033">Verify your email</h1>
        <p style="margin:0 0 24px;line-height:1.6;color:#4b5565">Enter this verification code in UniLink to finish setting up your account.</p>
        <div style="padding:18px;text-align:center;background:#f3f6fb;border:1px solid #e4eaf3;border-radius:12px;font-size:32px;font-weight:700;letter-spacing:9px;color:#173b72">${code}</div>
        <p style="margin:20px 0 0;line-height:1.6;color:#4b5565">This code expires in <strong>10 minutes</strong>. For your security, do not share it with anyone.</p>
        <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#737d8c">If you did not request this email, you can safely ignore it.</p>
      </div>
    </div>
    <p style="margin:16px 0;text-align:center;font-size:12px;color:#8b94a3">© UniLink</p>
  </div>
</body></html>`,
      };

      await configuredTransport.sendMail(message);
    },
  };
}

const emailService = createEmailService({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpSecure,
  user: env.smtpUser,
  pass: env.smtpPass,
  from: env.mailFrom,
});

export const sendOtpEmail = emailService.sendVerificationEmail;
