import { createServer } from "node:http";
import mongoose from "mongoose";

import app from "./app.js";
import env from "./config/env.js";
import connectMongoDB from "./config/mongodb.js";
import prisma from "./config/postgres.js";
import { startCleanupWorker, stopCleanupWorker } from "./modules/feed/cleanup.worker.js";
import Chat from "./modules/chat/models/Chat.js";
import Message from "./modules/chat/models/Message.js";
import { initSocket } from "./modules/chat/sockets/index.js";
import { resetAllPresence } from "./modules/chat/repositories/presence.repository.js";


const httpServer = createServer(app);

// Socket.IO setup (auth + chat handlers) lives in the chat module.
const io = initSocket(httpServer);

let shuttingDown = false;

const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Received ${signal}. Shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  // Socket.IO closes its clients and the underlying HTTP server.
  io.close(async () => {
    try {
      console.log("Socket.IO and HTTP server closed.");

      // Stop background post cleanup recovery worker
      await stopCleanupWorker(8_000);

      await prisma.$disconnect();
      console.log("PostgreSQL disconnected.");

      await mongoose.connection.close();
      console.log("MongoDB disconnected.");

      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  });
};

const startServer = async (): Promise<void> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("PostgreSQL connected successfully");

    await connectMongoDB();

    await resetAllPresence(); 

    // Build the unique indexes before accepting traffic.
    await Promise.all([Chat.init(), Message.init()]);

    // Start background post cleanup recovery worker after MongoDB connects
    startCleanupWorker({
      intervalMs: env.cleanupWorkerIntervalMs,
      batchSize: env.cleanupWorkerBatchSize,
      commentBatchSize: env.cleanupWorkerCommentBatchSize,
      leaseDurationMs: env.cleanupWorkerLeaseMs,
      maxAttempts: env.cleanupWorkerMaxAttempts,
    });

    httpServer.listen(env.port, "0.0.0.0", () => {
      console.log(`UniLink Backend running on port ${env.port}`);
    });
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Server startup failed:", message);

    process.exit(1);
  }
};

startServer();