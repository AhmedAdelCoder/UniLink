import dotenv from 'dotenv';

dotenv.config();

const env = {
  port: Number(process.env.PORT) || 5000,

  nodeEnv: process.env.NODE_ENV || 'development',

  databaseUrl: process.env.DATABASE_URL,

  mongodbUri: process.env.MONGODB_URI,

  jwtSecret: process.env.JWT_SECRET,

  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',

  jwtRefreshExpiresIn: Number(process.env.JWT_REFRESH_EXPIRES_IN) || 7 ,

  googleClientId: process.env.GOOGLE_CLIENT_ID as string,

  otpSecret: process.env.OTP_SECRET!, 

  smtpHost: process.env.SMTP_HOST, 

  smtpPort: Number(process.env.SMTP_PORT) || 587,

  smtpUser: process.env.SMTP_USER,

  smtpPass: process.env.SMTP_PASS,

  mailFrom: process.env.MAIL_FROM ,

  isProd: process.env.NODE_ENV === "production",
};

export default env;