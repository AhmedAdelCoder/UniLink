import type { ChatSocket } from "./chat.events.js";
import { verifyTokenPayload, type AuthTokenPayload } from "../../../utils/jwt.js";
import { getActiveAuthUser } from "../../../utils/authUser.js";

// Reads the expiry (ms epoch) from an ALREADY VERIFIED token. The signature was checked by
// verifyTokenPayload, so decoding the payload segment here is safe.
// Returns undefined if the claim is missing, so the sweeper simply skips the expiry check.
const readExpiresAt = (token: string): number | undefined => {
  try {
    const segment = token.split(".")[1];
    if (!segment) return undefined;

    const { exp } = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return typeof exp === "number" ? exp * 1000 : undefined; // JWT exp is in seconds
  } catch {
    return undefined;
  }
};

export const socketAuth = async (
  socket: ChatSocket,
  next: (err?: Error) => void
): Promise<void> => {
  const token = socket.handshake.auth?.token;

  if (typeof token !== "string" || !token.trim()) {
    return next(new Error("Unauthorized"));
  }

  // Verify the signature and expiry first, so invalid tokens never reach the database.
  let payload: AuthTokenPayload;

  try {
    payload = verifyTokenPayload(token);
  } catch {
    return next(new Error("Unauthorized"));
  }

  try {
    // A valid token is not enough: the account may have been deleted since it was issued.
    const user = await getActiveAuthUser(payload.userId);

    if (!user) return next(new Error("Unauthorized"));

    // The role comes from the database, not from the token.
    socket.data.user = {
      userId: user.id,
      role: user.role,
      expiresAt: readExpiresAt(token),
    };

    next();
  } catch (err) {
    // Not "Unauthorized": a database outage must not make clients think their token is invalid.
    console.error("Socket auth lookup failed:", err);
    next(new Error("Internal error"));
  }
};