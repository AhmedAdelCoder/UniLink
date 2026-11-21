import type { Server, Socket } from "socket.io";
import type { MessageDto } from "../services/chat.service.js";

// Centralized event names to prevent silent spelling mistakes.
export const ClientEvents = {
  ChatJoin: "chat:join",
  ChatLeave: "chat:leave",
  MessageSend: "message:send",
  MessageRead: "message:read",
  PresenceQuery: "presence:query",
} as const;

export const ServerEvents = {
  MessageNew: "message:new",
  MessageRead: "message:read",
  AuthExpired: "auth:expired",
  PresenceUpdate: "presence:update",
} as const;

// Centralized error codes for consistent client-side error handling.
export const SocketErrorCode = {
  Unauthorized: "UNAUTHORIZED",
  ValidationError: "VALIDATION_ERROR",
  ChatNotFound: "CHAT_NOT_FOUND",
  NotConnected: "NOT_CONNECTED",
  InternalError: "INTERNAL_ERROR",
} as const;

export type SocketErrorCode =
  (typeof SocketErrorCode)[keyof typeof SocketErrorCode];

export interface SocketError {
  code: SocketErrorCode;
  message: string;
}

export interface PresenceInfo {
  userId: string;
  online: boolean;
  lastSeen: string | null; // ISO string; null while online
}

// Unified acknowledgment structure for successful and failed operations.
export type SocketAck<T> =
  | { ok: true; data: T }
  | { ok: false; error: SocketError };

type AckFn<T> = (res: SocketAck<T>) => void;

// Client payloads are untrusted and must be validated at runtime using Zod.
export interface ClientToServerEvents {
  "chat:join": (payload: unknown, ack?: AckFn<{ chatId: string }>) => void;
  "chat:leave": (payload: unknown, ack?: AckFn<{ chatId: string }>) => void;
  "message:send": (
    payload: unknown,
    ack?: AckFn<{ message: MessageDto; created: boolean }>
  ) => void;
  "message:read": (payload: unknown, ack?: AckFn<{ updated: boolean }>) => void;
  "presence:query": (
    payload: unknown,
    ack?: AckFn<{ users: PresenceInfo[] }>
  ) => void;
}

export interface ServerToClientEvents {
  "message:new": (payload: { message: MessageDto }) => void;
  "message:read": (payload: { chatId: string; readerId: string }) => void;
  "auth:expired": () => void;
  "presence:update": (payload: PresenceInfo) => void;
}

// Defines the authenticated user data attached to each socket.
export interface SocketData {
  user: {
    userId: string;
    role: string;
    expiresAt?: number;
  };
}

// Centralized room naming helpers.
export const userRoom = (userId: string) => `user:${userId}`;
export const chatRoom = (chatId: string) => `chat:${chatId}`;

type InterServerEvents = Record<string, never>;

// Typed server and socket: gives every handler autocomplete and compile-time checks
// on event names, payloads, acks, and socket.data.
export type ChatServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type ChatSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;