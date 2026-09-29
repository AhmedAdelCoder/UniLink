import dotenv from 'dotenv';

dotenv.config();

interface Env {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  mongodbUri: string;
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
  databaseUrl: getRequired('DATABASE_URL'),
  mongodbUri: getRequired('MONGODB_URI'),
};

export default env;