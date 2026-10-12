import { Request, Response, NextFunction } from "express";
import { ZodType } from "zod";

type ValidationTarget = "body" | "query" | "params";

export const validate = <T>(
  schema: ZodType<T>,
  target: ValidationTarget = "body"
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Validation error",
        errors: result.error.issues,
      });
      return;
    }

    if (target === "body") {
      req.body = result.data;
    } else {
      req.validated = { ...(req.validated ?? {}), [target]: result.data };
    }

    next();
  };
};