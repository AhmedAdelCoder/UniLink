import dotenv from 'dotenv';
import { parseBoundedInt } from './parseBoundedInt.js';

dotenv.config();

interface Env {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  mongodbUri: string;

  // JWT
  jwtSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: number;

  // OAuth
  googleClientId: string | undefined;
  githubClientId: string | undefined;
  githubClientSecret: string | undefined;

  // OTP
  otpSecret: string;

  // SMTP
  smtpHost: string | undefined;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | undefined;
  smtpPass: string | undefined;
  mailFrom: string | undefined;

  // Cleanup Recovery Worker
  cleanupWorkerIntervalMs: number;
  cleanupWorkerBatchSize: number;
  cleanupWorkerCommentBatchSize: number;
  cleanupWorkerLeaseMs: number;
  cleanupWorkerMaxAttempts: number;

  isProd: boolean;
}

const getRequired = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
const hasAnySmtpSetting = smtpKeys.some((key) => process.env[key] !== undefined && process.env[key] !== '');
const smtpConfig = hasAnySmtpSetting
  ? (() => {
      const values = Object.fromEntries(smtpKeys.map((key) => [key, getRequired(key)])) as Record<string, string>;
      const port = Number(values.SMTP_PORT);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('SMTP_PORT must be an integer between 1 and 65535');
      }
      const secureValue = values.SMTP_SECURE.toLowerCase();
      if (secureValue !== 'true' && secureValue !== 'false') {
        throw new Error('SMTP_SECURE must be true or false');
      }
      return {
        host: values.SMTP_HOST,
        port,
        secure: secureValue === 'true',
        user: values.SMTP_USER,
        pass: values.SMTP_PASS,
        from: values.SMTP_FROM,
      };
    })()
  : { host: undefined, port: 587, secure: false, user: undefined, pass: undefined, from: undefined };

const env: Env = {
  port: Number(process.env.PORT) || 5000,

  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: getRequired('DATABASE_URL'),
  mongodbUri: getRequired('MONGODB_URI'),

  // JWT
  jwtSecret: getRequired('JWT_SECRET'),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: Number(process.env.JWT_REFRESH_EXPIRES_IN) || 7,

  // OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,

  // OTP
  otpSecret: getRequired('OTP_SECRET'),

  // SMTP
  smtpHost: smtpConfig.host,
  smtpPort: smtpConfig.port,
  smtpSecure: smtpConfig.secure,
  smtpUser: smtpConfig.user,
  smtpPass: smtpConfig.pass,
  mailFrom: smtpConfig.from,

  // Cleanup Recovery Worker (Defaults: 30s interval, 10 posts/batch, 500 comments/chunk, 2m lease, 5 attempts)
  cleanupWorkerIntervalMs: parseBoundedInt('CLEANUP_WORKER_INTERVAL_MS', 30_000, 1_000, 3_600_000),
  cleanupWorkerBatchSize: parseBoundedInt('CLEANUP_WORKER_BATCH_SIZE', 10, 1, 100),
  cleanupWorkerCommentBatchSize: parseBoundedInt(
    'CLEANUP_WORKER_COMMENT_BATCH_SIZE',
    500,
    1,
    5_000
  ),
  cleanupWorkerLeaseMs: parseBoundedInt('CLEANUP_WORKER_LEASE_MS', 120_000, 1_000, 1_800_000),
  cleanupWorkerMaxAttempts: parseBoundedInt('CLEANUP_WORKER_MAX_ATTEMPTS', 5, 1, 50),

  isProd: process.env.NODE_ENV === 'production',
};

export default env;
