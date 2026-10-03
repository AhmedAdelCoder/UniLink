import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import authRoutes from "./routes/auth.route.js";

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

//auth
app.use('/api/auth' , authRoutes) ;

//errorMiddleware
app.use(errorMiddleware);

export default app;