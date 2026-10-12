import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import env from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export interface AuthTokenPayload {
  userId: string;
  role: Role;
}

const isAuthTokenPayload = (value: unknown): value is AuthTokenPayload => {
  if (typeof value !== "object" || value === null) return false;

  const { userId, role } = value as Record<string, unknown>;

  return (
    typeof userId === "string" &&
    Object.values(Role).includes(role as Role)
  );
};

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

    let payload: unknown;

    try {
      payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    } catch (error) {
     
      if (error instanceof jwt.TokenExpiredError) {
        return next(new AppError("Token expired", 401));
      }

      return next(new AppError("Invalid token", 401));
    }

    if (!isAuthTokenPayload(payload)) {
      return next(new AppError("Invalid token payload", 401));
    }

    if (roles.length > 0 && !roles.includes(payload.role)) {
      return next(new AppError("Forbidden", 403));
    }

    req.user = { userId: payload.userId, role: payload.role };

    next();
  };
};