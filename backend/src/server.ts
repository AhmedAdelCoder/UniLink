import { createServer } from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";

import app from "./app.js";
import env from "./config/env.js";
import connectMongoDB from "./config/mongodb.js";
import prisma from "./config/postgres.js";
import { verifyTokenPayload } from "./utils/jwt.js";
import { startCleanupWorker, stopCleanupWorker } from "./modules/feed/cleanup.worker.js";

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*", // TODO: Restrict origins when web client is configured
    methods: ["GET", "POST"],
  },
});

// Authenticate Socket.IO connections using the shared JWT verifier.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (typeof token !== "string" || !token.trim()) {
    return next(new Error("Unauthorized"));
  }

  try {
    const payload = verifyTokenPayload(token);

    socket.data.user = {
      userId: payload.userId,
      role: payload.role,
    };

    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.data.user.userId}`);

  socket.on("disconnect", (reason) => {
    console.log(`Socket disconnected: ${socket.data.user.userId}`, reason);
  });
});

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

    // Start background post cleanup recovery worker after MongoDB connects
    startCleanupWorker({
      intervalMs: env.cleanupWorkerIntervalMs,
      batchSize: env.cleanupWorkerBatchSize,
      commentBatchSize: env.cleanupWorkerCommentBatchSize,
      leaseDurationMs: env.cleanupWorkerLeaseMs,
      maxAttempts: env.cleanupWorkerMaxAttempts,
    });

    httpServer.listen(env.port, () => {
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
