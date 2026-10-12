import { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: Role;
      };
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};