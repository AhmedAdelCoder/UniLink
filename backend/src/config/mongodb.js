import mongoose from 'mongoose';
import env from './env.js';

const connectMongoDB = async () => {
  try {
    await mongoose.connect(env.mongodbUri);

    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

export default connectMongoDB;