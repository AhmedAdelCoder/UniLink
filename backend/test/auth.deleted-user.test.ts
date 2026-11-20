import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import prisma from "../src/config/postgres.js";
import env from "../src/config/env.js";
import { authMiddleware } from "../src/middlewares/authmiddleware.js";
import { errorMiddleware } from "../src/middlewares/errorMiddleware.js";
import { generateAccessToken } from "../src/utils/jwt.js";

const activeId = "11111111-1111-4111-8111-111111111111";
const deletedId = "22222222-2222-4222-8222-222222222222";
const missingId = "33333333-3333-4333-8333-333333333333";
const malformedId = "not-a-uuid";

describe("authentication middleware database identity and roles", () => {
  const originalFindUnique = prisma.user.findUnique;
  const users = new Map<string, { id: string; deletedAt: Date | null; role: Role }>([
    [activeId, { id: activeId, deletedAt: null, role: Role.student }],
    [deletedId, { id: deletedId, deletedAt: new Date("2026-01-01T00:00:00.000Z"), role: Role.student }],
  ]);
  const queries: unknown[] = [];
  let failure: Error | null = null;

  before(() => {
    (prisma.user as any).findUnique = async (args: unknown) => {
      queries.push(args);
      if (failure) throw failure;
      const id = (args as any).where.id as string;
      return users.get(id) ?? null;
    };
  });

  after(() => {
    (prisma.user as any).findUnique = originalFindUnique;
  });

  const dispatch = async (token: string, roles: Role[] = []) => {
    let status = 200;
    let body: unknown = { success: true };
    let forwarded: unknown;
    let protectedCalls = 0;
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } } as unknown as Response;
    const next: NextFunction = (error?: unknown) => { forwarded = error; };
    await authMiddleware(roles)(req, res, next);
    if (forwarded) {
      const originalConsoleError = console.error;
      console.error = () => undefined;
      try { errorMiddleware(forwarded, req, res, (() => undefined) as NextFunction); }
      finally { console.error = originalConsoleError; }
    } else {
      protectedCalls += 1;
    }
    return { status, body, protectedCalls, user: req.user };
  };

  const token = (userId = activeId, role: Role = Role.student) => generateAccessToken({ userId, role });
  const authError = (message: string) => ({ success: false, message });

  beforeEach(() => {
    failure = null;
    queries.length = 0;
    users.set(activeId, { id: activeId, deletedAt: null, role: Role.student });
  });

  it("authenticates an active user using one minimal database lookup", async () => {
    const result = await dispatch(token());
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { success: true });
    assert.equal(result.protectedCalls, 1);
    assert.deepEqual(result.user, { userId: activeId, role: Role.student });
    assert.deepEqual(queries, [{ where: { id: activeId }, select: { id: true, deletedAt: true, role: true } }]);
  });

  it("rejects soft-deleted and missing users with the existing 401 contract", async () => {
    for (const userId of [deletedId, missingId]) {
      const result = await dispatch(token(userId));
      assert.equal(result.status, 401);
      assert.deepEqual(result.body, authError("Unauthorized"));
      assert.equal(result.protectedCalls, 0);
    }
  });

  it("rejects a signed malformed UUID without querying Prisma", async () => {
    const result = await dispatch(token(malformedId));
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, authError("Unauthorized"));
    assert.equal(result.protectedCalls, 0);
    assert.equal(queries.length, 0);
  });

  it("preserves invalid-signature and expired-token responses", async () => {
    const invalidSignature = jwt.sign({ userId: activeId, role: Role.student }, "not-the-secret");
    const expired = jwt.sign({ userId: activeId, role: Role.student }, env.jwtSecret, { expiresIn: -1 });
    const badSignature = await dispatch(invalidSignature);
    assert.equal(badSignature.status, 401);
    assert.deepEqual(badSignature.body, authError("Invalid token"));
    const expiredResult = await dispatch(expired);
    assert.equal(expiredResult.status, 401);
    assert.deepEqual(expiredResult.body, authError("Token expired"));
    assert.equal(badSignature.protectedCalls + expiredResult.protectedCalls, 0);
    assert.equal(queries.length, 0);
  });

  it("authorizes with the current database role instead of the JWT role", async () => {
    users.set(activeId, { id: activeId, deletedAt: null, role: Role.recruiter });
    const jwtSaysStudent = await dispatch(token(activeId, Role.student), [Role.recruiter]);
    assert.equal(jwtSaysStudent.status, 200);
    assert.deepEqual(jwtSaysStudent.user, { userId: activeId, role: Role.recruiter });

    const jwtSaysRecruiter = await dispatch(token(activeId, Role.recruiter), [Role.student]);
    assert.equal(jwtSaysRecruiter.status, 403);
    assert.deepEqual(jwtSaysRecruiter.body, authError("Forbidden"));
    assert.equal(jwtSaysRecruiter.protectedCalls, 0);
  });

  it("does not preserve privileges after the database role changes", async () => {
    const oldToken = token(activeId, Role.recruiter);
    users.set(activeId, { id: activeId, deletedAt: null, role: Role.student });
    const recruiterRoute = await dispatch(oldToken, [Role.recruiter]);
    assert.equal(recruiterRoute.status, 403);
    assert.deepEqual(recruiterRoute.body, authError("Forbidden"));
    const studentRoute = await dispatch(oldToken, [Role.student]);
    assert.equal(studentRoute.status, 200);
    assert.deepEqual(studentRoute.user, { userId: activeId, role: Role.student });
  });

  it("fails closed and preserves the server-error contract on Prisma failure", async () => {
    failure = new Error("database unavailable");
    const result = await dispatch(token());
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, authError("Internal server error"));
    assert.equal(result.protectedCalls, 0);
  });
});
