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
    const message = error instanceof Error ? error.message : String(error);
    console.error('Server startup failed:', message);
    process.exit(1);
  }
};

startServer();