
import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { AppError } from "../utils/AppError.js";
import {
  verifyTokenPayload,
  type AuthTokenPayload,
} from "../utils/jwt.js";

// Keep existing imports working
export type { AuthTokenPayload };

export const authMiddleware = (roles: Role[] = []) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return next(new AppError("Unauthorized", 401));
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return next(new AppError("Unauthorized", 401));
    }

    let payload: AuthTokenPayload;

    try {
      payload = verifyTokenPayload(token);
    } catch (error) {
      return next(error);
    }

    if (roles.length > 0 && !roles.includes(payload.role)) {
      return next(new AppError("Forbidden", 403));
    }

    req.user = { userId: payload.userId, role: payload.role };

    next();
  };
};
