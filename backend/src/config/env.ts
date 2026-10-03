import dotenv from 'dotenv';

dotenv.config();

interface Env {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  mongodbUri: string;

  // JWT
  jwtSecret: string | undefined;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: number;

  // OAuth
  googleClientId: string | undefined;

  // OTP
  otpSecret: string;

  // SMTP
  smtpHost: string | undefined;
  smtpPort: number;
  smtpUser: string | undefined;
  smtpPass: string | undefined;
  mailFrom: string | undefined;

  isProd: boolean;
}

const getRequired = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const env: Env = {
  port: Number(process.env.PORT) || 5000,

  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: getRequired('DATABASE_URL'),
  mongodbUri: getRequired('MONGODB_URI'),

  // JWT
  jwtSecret: process.env.JWT_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: Number(process.env.JWT_REFRESH_EXPIRES_IN) || 7,

  // OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID,

  // OTP
  otpSecret: getRequired('OTP_SECRET'),

  // SMTP
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  mailFrom: process.env.MAIL_FROM,

  isProd: process.env.NODE_ENV === 'production',
};

export default env;