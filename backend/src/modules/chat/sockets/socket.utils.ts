import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError } from "../../../utils/AppError.js";
import { SocketErrorCode, type SocketAck, type SocketError } from "./chat.events.js";
import { getActiveAuthUser } from "../../../utils/authUser.js";

// Converts any thrown value into the unified socket error shape.
// Unexpected errors become INTERNAL_ERROR without leaking details to the client.
export function toSocketError(err: unknown): SocketError {
  if (err instanceof ZodError) {
    return {
      code: SocketErrorCode.ValidationError,
      message: err.issues[0]?.message ?? "Invalid payload",
    };
  }

  if (err instanceof AppError) {
    // 403 maps to NOT_CONNECTED because the chat service uses it only for that rule.
    // If another 403 reason is added later, give it its own code.
    const code =
      err.statusCode === 400 ? SocketErrorCode.ValidationError :
      err.statusCode === 401 ? SocketErrorCode.Unauthorized :
      err.statusCode === 403 ? SocketErrorCode.NotConnected :
      err.statusCode === 404 ? SocketErrorCode.ChatNotFound :
      SocketErrorCode.InternalError;

    if (code === SocketErrorCode.InternalError) {
      console.error("Socket handler failed:", err);
    }
    return { code, message: err.message };
  }

  console.error("Unhandled socket error:", err);
  return { code: SocketErrorCode.InternalError, message: "Internal server error" };
}

// Wraps a handler: validates the payload, runs it, and always answers with a SocketAck.
// Handlers stay free of repeated try/catch blocks.
export function handle<S extends ZodTypeAny, T>(
  schema: S,
  fn: (input: z.infer<S>) => Promise<T>,
) {
  return async (payload: unknown, ack?: (res: SocketAck<T>) => void): Promise<void> => {
    let res: SocketAck<T>;
    try {
      res = { ok: true, data: await fn(schema.parse(payload)) };
    } catch (err) {
      res = { ok: false, error: toSocketError(err) };
    }

    // The client may not pass a callback, so never call ack blindly.
    if (typeof ack === "function") ack(res);
  };
}

export const assertActiveUser = async (userId: string): Promise<void> => {
  if (!(await getActiveAuthUser(userId))) throw new AppError("Unauthorized", 401);
};