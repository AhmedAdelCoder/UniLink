import mongoose from 'mongoose';
import env from './env.js';

const connectMongoDB = async (): Promise<void> => {
  try {
    await mongoose.connect(env.mongodbUri);

    console.log('MongoDB connected successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('MongoDB connection failed:', message);

    process.exit(1);
  }
};

export default connectMongoDB;