import app from './app.js';
import env from './config/env.js';
import connectMongoDB from './config/mongodb.js';
import prisma from './config/postgres.js';

const startServer = async (): Promise<void> => {
  try {
    // Test PostgreSQL
    await prisma.$queryRaw`SELECT 1`;
    console.log('PostgreSQL connected successfully');

    // Connect MongoDB
    await connectMongoDB();

    app.listen(env.port, () => {
      console.log(`UniLink Backend running on port ${env.port}`);
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error('Server startup failed:', error.message);
    } else {
      console.error('Server startup failed:', error);
    }

    process.exit(1);
  }
};

startServer();