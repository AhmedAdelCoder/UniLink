import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError.js";

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Validation error",
      errors: err.issues,
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ success: false, message: "Invalid identifier" });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ success: false, message: "Validation error" });
    return;
  }

  // body-parser errors: malformed JSON (400), payload too large (413)
  const status = (err as { status?: unknown })?.status;

  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({
      success: false,
      message: status === 413 ? "Payload too large" : "Bad request",
    });
    return;
  }

  console.error(err);

  res.status(500).json({ success: false, message: "Internal server error" });
};