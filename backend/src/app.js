import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

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
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "UniLink Backend is running ",
  });
});

export default app;