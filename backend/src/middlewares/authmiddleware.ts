
import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import { AppError } from "../utils/AppError.js";
import { getActiveAuthUser } from "../utils/authUser.js";
import type { ActiveAuthUser } from "../utils/authUser.js";
import {
  verifyTokenPayload,
  type AuthTokenPayload,
} from "../utils/jwt.js";

// Keep existing imports working
export type { AuthTokenPayload };

export const authMiddleware = (roles: Role[] = []) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
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
      next(error);
      return;
    }

    let user: ActiveAuthUser | null;
    try {
      user = await getActiveAuthUser(payload.userId);
      if (!user) {
        next(new AppError("Unauthorized", 401));
        return;
      }
    } catch (error) {
      next(error);
      return;
    }

    if (roles.length > 0 && !roles.includes(user.role)) {
      return next(new AppError("Forbidden", 403));
    }

    req.user = { userId: user.id, role: user.role };

    next();
  };
};
