
import jwt, { SignOptions } from "jsonwebtoken";
import env from "../config/env.js";
import { Role } from "@prisma/client";
import { AppError } from "./AppError.js";

export interface AccessTokenPayload {
  userId: string;
  role: Role;
}

// Same shape for signing and verification
export type AuthTokenPayload = AccessTokenPayload;

export const generateAccessToken = (payload: AccessTokenPayload): string => {
  const options: SignOptions = {
    expiresIn: env.jwtAccessExpiresIn as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, env.jwtSecret, options);
};

const isAuthTokenPayload = (value: unknown): value is AuthTokenPayload => {
  if (typeof value !== "object" || value === null) return false;

  const { userId, role } = value as Record<string, unknown>;

  return (
    typeof userId === "string" &&
    Object.values(Role).includes(role as Role)
  );
};

export const verifyTokenPayload = (token: string): AuthTokenPayload => {
  let payload: unknown;

  try {
    payload = jwt.verify(token, env.jwtSecret, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError("Token expired", 401);
    }

    throw new AppError("Invalid token", 401);
  }

  if (!isAuthTokenPayload(payload)) {
    throw new AppError("Invalid token payload", 401);
  }

  return payload;
};
