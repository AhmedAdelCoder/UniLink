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
//auth
app.use('/api/auth' , authRoutes) ;
//Feed
app.use("/api/feed", feedRoutes);

//errorMiddleware
app.use(errorMiddleware);

export default app;