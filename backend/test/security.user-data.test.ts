import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../src/config/postgres.js';
import { Role, OAuthProvider } from '@prisma/client';
import { authService } from '../src/modules/auth/auth.service.js';
import { oAuthService } from '../src/modules/auth/oauth.service.js';
import { hashPassword } from '../src/utils/password.js';
import { MockDatabaseFixture } from './fixtures/mockDb.js';
import { createPost, createComment, getFeed, getComments } from '../src/modules/feed/feed.service.js';

const forbiddenKeys = new Set(['isOnline', 'lastSeen', 'passwordHash']);
const assertNoSensitiveKeys = (value: unknown): void => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach(assertNoSensitiveKeys);
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbiddenKeys.has(key), false, `response leaked ${key}`);
    assertNoSensitiveKeys(child);
  }
};

const modulesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/modules');
const listTypeScriptFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : [];
  }));
  return nested.flat();
};

const callHasSelect = (source: string, openParen: number): boolean => {
  let depth = 1;
  let quote = '';
  for (let i = openParen + 1; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote && source[i - 1] !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '(') depth++;
    if (char === ')' && --depth === 0) return /\bselect\s*:/.test(source.slice(openParen + 1, i));
  }
  return false;
};

describe('user data response security', () => {
  const db = new MockDatabaseFixture();
  const authorId = 'author-security-test';
  let postId: string;

  before(() => db.install());
  after(() => db.restore());
  beforeEach(async () => {
    db.reset();
    db.users.set(authorId, {
      id: authorId,
      fullName: 'Sensitive Author',
      photoUrl: null,
      isOnline: true,
      lastSeen: new Date('2025-01-02T03:04:05.000Z'),
      passwordHash: 'test-hash-must-not-leak',
    });
    const post = await createPost(authorId, { content: 'security post' });
    postId = String(post.id);
    await createComment(authorId, postId, { content: 'security comment' });
    db.prismaUserFindUniqueCalls = [];
    db.prismaUserFindManyCalls = [];
  });

  it('maps feed mutation authors to public fields and selects those fields', async () => {
    const post = await createPost(authorId, { content: 'another security post' });
    const comment = await createComment(authorId, postId, { content: 'another security comment' });
    const expectedSelect = { id: true, fullName: true, photoUrl: true };
    assert.deepEqual((db.prismaUserFindUniqueCalls[0] as any).select, expectedSelect);
    assert.deepEqual((db.prismaUserFindUniqueCalls[1] as any).select, expectedSelect);
    assertNoSensitiveKeys(post);
    assertNoSensitiveKeys(comment);
  });

  it('maps feed authors to public fields and selects only those fields', async () => {
    const result = await getFeed('viewer-security-test', 10);
    const args = db.prismaUserFindManyCalls[0] as { select?: Record<string, unknown> };
    assert.deepEqual(args.select, { id: true, fullName: true, photoUrl: true });
    assertNoSensitiveKeys(result);
  });

  it('maps comment authors to public fields and selects only those fields', async () => {
    const result = await getComments('viewer-security-test', postId, 10);
    const args = db.prismaUserFindManyCalls[0] as { select?: Record<string, unknown> };
    assert.deepEqual(args.select, { id: true, fullName: true, photoUrl: true });
    assertNoSensitiveKeys(result);
  });

  it('guards module prisma.user.find* calls against missing selects', async () => {
    const findings: string[] = [];
    for (const file of await listTypeScriptFiles(modulesRoot)) {
      const source = await readFile(file, 'utf8');
      const pattern = /\bprisma\s*\.\s*user\s*\.\s*(find\w*)\s*\(/g;
      for (const match of source.matchAll(pattern)) {
        const openParen = (match.index ?? 0) + match[0].lastIndexOf('(');
        if (!callHasSelect(source, openParen)) {
          findings.push(`${path.relative(modulesRoot, file)}:${source.slice(0, openParen).split('\n').length} ${match[1]}`);
        }
      }
    }
    // No allowlisted find calls: every current match has been inspected and explicitly selects its needed columns.
    assert.deepEqual(findings, []);
  });

  it('keeps the password hash out of the login response while selecting only required account fields', async () => {
    const originalFindUnique = prisma.user.findUnique;
    const originalRefreshCreate = prisma.refreshToken.create;
    const passwordHash = await hashPassword('security-test-password');
    let query: unknown;
    (prisma.user as any).findUnique = async (args: unknown) => {
      query = args;
      return {
        id: authorId, email: 'author@example.test', fullName: 'Sensitive Author', role: Role.student,
        passwordHash, emailVerified: true, deletedAt: null, isOnline: true,
        lastSeen: new Date('2025-01-02T03:04:05.000Z'),
      };
    };
    (prisma.refreshToken as any).create = async () => ({});
    try {
      const response = await new authService().login({ email: 'author@example.test', password: 'security-test-password' });
      const args = query as { select: Record<string, unknown> };
      assert.deepEqual(args.select, {
        id: true, email: true, fullName: true, role: true,
        passwordHash: true, emailVerified: true, deletedAt: true,
      });
      assertNoSensitiveKeys(response);
    } finally {
      (prisma.user as any).findUnique = originalFindUnique;
      (prisma.refreshToken as any).create = originalRefreshCreate;
    }
  });

  it('limits the OAuth user relation and returns no sensitive user columns', async () => {
    const originalOAuthFind = prisma.oAuthAccount.findUnique;
    const originalRefreshCreate = prisma.refreshToken.create;
    let query: unknown;
    (prisma.oAuthAccount as any).findUnique = async (args: unknown) => {
      query = args;
      return { user: {
        id: authorId, email: 'author@example.test', fullName: 'Sensitive Author', role: Role.student,
        deletedAt: null, isOnline: true, lastSeen: new Date('2025-01-02T03:04:05.000Z'), passwordHash: 'must-not-return',
      } };
    };
    (prisma.refreshToken as any).create = async () => ({});
    try {
      const response = await (new oAuthService() as any).oauthLogin({
        provider: OAuthProvider.google, providerAccountId: 'provider-account',
        email: 'author@example.test', fullName: 'Sensitive Author',
      });
      const args = query as { include: { user: { select: Record<string, unknown> } } };
      assert.deepEqual(args.include.user.select, {
        id: true, email: true, fullName: true, role: true, deletedAt: true,
      });
      assertNoSensitiveKeys(response);
    } finally {
      (prisma.oAuthAccount as any).findUnique = originalOAuthFind;
      (prisma.refreshToken as any).create = originalRefreshCreate;
    }
  });
});
