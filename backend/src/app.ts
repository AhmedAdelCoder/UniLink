import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import authRoutes from "./modules/auth/auth.route.js";
import feedRoutes from "./modules/feed/feed.route.js";

const app = express();

// Security
app.use(helmet());

// CORS
app.use(cors());

// Parse JSON requests
app.use(express.json());

// Request logger
app.use(morgan("dev"));

// Health Check
app.get("/api/v1/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "UniLink Backend is running",
  });
});

//! ===== feauther ====
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/feed", feedRoutes);


//errorMiddleware
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorMiddleware);



export default app;