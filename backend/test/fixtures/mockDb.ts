import { Types } from 'mongoose';
import Post, { ICleanupState } from '../../src/modules/feed/models/Post.js';
import Like from '../../src/modules/feed/models/Like.js';
import Comment from '../../src/modules/feed/models/Comment.js';
import prisma from '../../src/config/postgres.js';

export interface MockPostDoc {
  _id: Types.ObjectId;
  author_id: string;
  content: string;
  image_url: string | null;
  skills_tags: string[];
  like_count: number;
  comment_count: number;
  deleted_at: Date | null;
  cleanup_state?: ICleanupState | null;
  created_at: Date;
  updated_at: Date;
}

export interface MockCommentDoc {
  _id: Types.ObjectId;
  post_id: Types.ObjectId;
  author_id: string;
  parent_comment_id: Types.ObjectId | null;
  content: string;
  like_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface MockLikeDoc {
  _id: Types.ObjectId;
  user_id: string;
  post_id: Types.ObjectId | null;
  comment_id: Types.ObjectId | null;
  created_at: Date;
}

export interface MockUserDoc {
  id: string;
  fullName: string;
  photoUrl: string | null;
}

const emptyCleanupState = (): ICleanupState => ({
  status: 'pending',
  claimed_by: null,
  claim_token: null,
  lease_expires_at: null,
  attempt_count: 0,
  last_error: null,
  last_attempt_at: null,
  next_retry_at: null,
});

type ThenableChain<T extends object> = T & {
  then: (
    resolve?: (val: unknown) => void,
    reject?: (err: unknown) => void
  ) => Promise<unknown>;
  catch: (reject: (err: unknown) => unknown) => Promise<unknown>;
};

const withThenable = <T extends object>(
  chain: T,
  run: () => unknown
): ThenableChain<T> => {
  const thenable = chain as ThenableChain<T>;
  thenable.then = (resolve, reject) =>
    Promise.resolve()
      .then(run)
      .then(resolve, reject);
  thenable.catch = (reject) => thenable.then(undefined, reject);
  return thenable;
};

export class MockDatabaseFixture {
  posts = new Map<string, MockPostDoc>();
  comments = new Map<string, MockCommentDoc>();
  likes = new Map<string, MockLikeDoc>();
  users = new Map<string, MockUserDoc>();

  faults = new Map<string, Error>();

  private originalPostMethods: Record<string, unknown> = {};
  private originalLikeMethods: Record<string, unknown> = {};
  private originalCommentMethods: Record<string, unknown> = {};
  private originalPrismaUserMethods: Record<string, unknown> = {};

  install() {
    this.originalPostMethods = {
      find: Post.find,
      findOne: Post.findOne,
      findById: Post.findById,
      exists: Post.exists,
      create: Post.create,
      findOneAndUpdate: Post.findOneAndUpdate,
      findByIdAndUpdate: Post.findByIdAndUpdate,
      findByIdAndDelete: Post.findByIdAndDelete,
    };

    this.originalLikeMethods = {
      find: Like.find,
      create: Like.create,
      findOneAndDelete: Like.findOneAndDelete,
      deleteMany: Like.deleteMany,
      deleteOne: Like.deleteOne,
    };

    this.originalCommentMethods = {
      find: Comment.find,
      findOne: Comment.findOne,
      findById: Comment.findById,
      create: Comment.create,
      findByIdAndUpdate: Comment.findByIdAndUpdate,
      deleteMany: Comment.deleteMany,
      deleteOne: Comment.deleteOne,
    };

    this.originalPrismaUserMethods = {
      findUnique: prisma.user.findUnique,
      findMany: prisma.user.findMany,
    };

    this.installPostMocks();
    this.installLikeMocks();
    this.installCommentMocks();
    this.installPrismaMocks();
  }

  restore() {
    Object.assign(Post, this.originalPostMethods);
    Object.assign(Like, this.originalLikeMethods);
    Object.assign(Comment, this.originalCommentMethods);
    Object.assign(prisma.user, this.originalPrismaUserMethods);
  }

  reset() {
    this.posts.clear();
    this.comments.clear();
    this.likes.clear();
    this.users.clear();
    this.faults.clear();
  }

  setFault(point: string, error: Error) {
    this.faults.set(point, error);
  }

  clearFault(point: string) {
    this.faults.delete(point);
  }

  private checkFault(point: string) {
    if (this.faults.has(point)) {
      throw this.faults.get(point)!;
    }
  }

  private cloneDoc<T>(doc: T): T {
    return JSON.parse(JSON.stringify(doc), (key, val) => {
      if (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) {
        return new Types.ObjectId(val);
      }
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
        return new Date(val);
      }
      return val;
    });
  }

  // --- Post Mock Implementations ---
  private installPostMocks() {
    const self = this;

    (Post as unknown as { find: unknown }).find = (filter: Record<string, unknown> = {}) => {
      self.checkFault('Post.find');

      let sortFn: ((a: MockPostDoc, b: MockPostDoc) => number) | null = null;
      let limitCount: number | null = null;

      const chain = withThenable(
        {
          select() {
            return chain;
          },
          sort(sortObj: Record<string, number>) {
            if (sortObj.created_at === -1) {
              sortFn = (a, b) => b.created_at.getTime() - a.created_at.getTime();
            }
            return chain;
          },
          limit(n: number) {
            limitCount = n;
            return chain;
          },
          lean() {
            return chain;
          },
        },
        () => {
          self.checkFault('Post.find');
          let rows = Array.from(self.posts.values()).filter((p) => self.matchesPostFilter(p, filter));
          if (sortFn) rows.sort(sortFn);
          if (limitCount !== null) rows = rows.slice(0, limitCount);
          return rows.map((r) => self.cloneDoc(r));
        }
      );
      return chain;
    };

    (Post as unknown as { findOne: unknown }).findOne = (filter: Record<string, unknown> = {}) => {
      self.checkFault('Post.findOne');

      const chain = withThenable(
        {
          select() { return chain; },
          session() { return chain; },
          lean() { return chain; },
        },
        () => {
          self.checkFault('Post.findOne');
          const found = Array.from(self.posts.values()).find((p) => self.matchesPostFilter(p, filter));
          return found ? self.cloneDoc(found) : null;
        }
      );
      return chain;
    };

    (Post as unknown as { exists: unknown }).exists = async (filter: Record<string, unknown> = {}) => {
      self.checkFault('Post.exists');
      const found = Array.from(self.posts.values()).find((p) => self.matchesPostFilter(p, filter));
      return found ? { _id: found._id } : null;
    };

    (Post as unknown as { findById: unknown }).findById = (id: unknown) => {
      return (Post as unknown as { findOne: (f: Record<string, unknown>) => unknown }).findOne({
        _id: id,
      });
    };

    (Post as unknown as { create: unknown }).create = async (doc: Record<string, unknown>) => {
      self.checkFault('Post.create');
      const id = new Types.ObjectId();
      const now = new Date();
      const newPost: MockPostDoc = {
        _id: id,
        author_id: String(doc.author_id),
        content: String(doc.content),
        image_url: (doc.image_url as string | null) ?? null,
        skills_tags: (doc.skills_tags as string[]) ?? [],
        like_count: Number(doc.like_count) || 0,
        comment_count: Number(doc.comment_count) || 0,
        deleted_at: (doc.deleted_at as Date | null) ?? null,
        cleanup_state: (doc.cleanup_state as ICleanupState | null) ?? null,
        created_at: now,
        updated_at: now,
      };
      self.posts.set(String(id), newPost);
      return self.cloneDoc(newPost);
    };

    (Post as unknown as { findOneAndUpdate: unknown }).findOneAndUpdate = (
      filter: Record<string, unknown>,
      update: Record<string, unknown> | Array<Record<string, unknown>>,
      _options?: Record<string, unknown>
    ) => {
      self.checkFault('Post.findOneAndUpdate');

      const chain = withThenable(
        {
          select() { return chain; },
          session() { return chain; },
          lean() { return chain; },
        },
        () => {
          self.checkFault('Post.findOneAndUpdate');
          const target = Array.from(self.posts.values()).find((p) => self.matchesPostFilter(p, filter));
          if (!target) {
            return null;
          }
          self.applyPostUpdate(target, update);
          return self.cloneDoc(target);
        }
      );
      return chain;
    };

    (Post as unknown as { findByIdAndUpdate: unknown }).findByIdAndUpdate = (
      id: unknown,
      update: Record<string, unknown> | Array<Record<string, unknown>>,
      options?: Record<string, unknown>
    ) => {
      return (Post as unknown as {
        findOneAndUpdate: (
          f: Record<string, unknown>,
          u: unknown,
          o?: unknown
        ) => unknown;
      }).findOneAndUpdate({ _id: id }, update, options);
    };

    (Post as unknown as { findByIdAndDelete: unknown }).findByIdAndDelete = async (id: unknown) => {
      self.checkFault('Post.findByIdAndDelete');
      const key = String(id);
      const post = self.posts.get(key);
      if (post) {
        self.posts.delete(key);
        return self.cloneDoc(post);
      }
      return null;
    };
  }

  // --- Like Mock Implementations ---
  private installLikeMocks() {
    const self = this;

    (Like as unknown as { find: unknown }).find = (filter: Record<string, unknown>) => {
      self.checkFault('Like.find');
      const chain = withThenable(
        {
          select() { return chain; },
          lean() { return chain; },
        },
        () => {
          self.checkFault('Like.find');
          const result = Array.from(self.likes.values()).filter((l) => self.matchesLikeFilter(l, filter));
          return result.map((r) => self.cloneDoc(r));
        }
      );
      return chain;
    };

    (Like as unknown as { create: unknown }).create = async (
      input: Record<string, unknown> | Array<Record<string, unknown>>
    ) => {
      self.checkFault('Like.create');
      const docs = Array.isArray(input) ? input : [input];
      const created: MockLikeDoc[] = [];

      for (const d of docs) {
        const userId = String(d.user_id);
        const postId = d.post_id ? String(d.post_id) : null;
        const commentId = d.comment_id ? String(d.comment_id) : null;

        for (const existing of self.likes.values()) {
          if (existing.user_id === userId) {
            if (postId && String(existing.post_id) === postId) {
              const err = new Error('E11000 duplicate key error collection: likes index: user_id_1_post_id_1 dup key');
              (err as unknown as { code: number }).code = 11000;
              throw err;
            }
            if (commentId && String(existing.comment_id) === commentId) {
              const err = new Error('E11000 duplicate key error collection: likes index: user_id_1_comment_id_1 dup key');
              (err as unknown as { code: number }).code = 11000;
              throw err;
            }
          }
        }

        const id = new Types.ObjectId();
        const likeDoc: MockLikeDoc = {
          _id: id,
          user_id: userId,
          post_id: postId ? new Types.ObjectId(postId) : null,
          comment_id: commentId ? new Types.ObjectId(commentId) : null,
          created_at: new Date(),
        };
        self.likes.set(String(id), likeDoc);
        created.push(likeDoc);
      }

      return Array.isArray(input) ? created.map((c) => self.cloneDoc(c)) : self.cloneDoc(created[0]);
    };

    (Like as unknown as { findOneAndDelete: unknown }).findOneAndDelete = (filter: Record<string, unknown>) => {
      self.checkFault('Like.findOneAndDelete');
      const chain = withThenable(
        {
          session() { return chain; },
        },
        () => {
          self.checkFault('Like.findOneAndDelete');
          const target = Array.from(self.likes.values()).find((l) => self.matchesLikeFilter(l, filter));
          if (!target) {
            return null;
          }
          self.likes.delete(String(target._id));
          return self.cloneDoc(target);
        }
      );
      return chain;
    };

    (Like as unknown as { deleteMany: unknown }).deleteMany = async (filter: Record<string, unknown>) => {
      self.checkFault('Like.deleteMany');
      let count = 0;
      for (const [key, like] of Array.from(self.likes.entries())) {
        if (self.matchesLikeFilter(like, filter)) {
          self.likes.delete(key);
          count++;
        }
      }
      return { deletedCount: count };
    };

    (Like as unknown as { deleteOne: unknown }).deleteOne = async (filter: Record<string, unknown>) => {
      self.checkFault('Like.deleteOne');
      for (const [key, like] of Array.from(self.likes.entries())) {
        if (self.matchesLikeFilter(like, filter)) {
          self.likes.delete(key);
          return { deletedCount: 1 };
        }
      }
      return { deletedCount: 0 };
    };
  }

  // --- Comment Mock Implementations ---
  private installCommentMocks() {
    const self = this;

    (Comment as unknown as { find: unknown }).find = (filter: Record<string, unknown> = {}) => {
      self.checkFault('Comment.find');

      let limitCount: number | null = null;
      let sortFn: ((a: MockCommentDoc, b: MockCommentDoc) => number) | null = null;

      const chain = {
        select() { return chain; },
        sort(sortObj: Record<string, number>) {
          if (sortObj.created_at === 1) {
            sortFn = (a, b) => a.created_at.getTime() - b.created_at.getTime();
          }
          return chain;
        },
        limit(n: number) {
          limitCount = n;
          return chain;
        },
        lean() { return chain; },
        then(resolve: (val: unknown) => void, reject?: (err: unknown) => void) {
          try {
            self.checkFault('Comment.find');
            let rows = Array.from(self.comments.values()).filter((c) => self.matchesCommentFilter(c, filter));
            if (sortFn) rows.sort(sortFn);
            if (limitCount !== null) rows = rows.slice(0, limitCount);
            resolve(rows.map((r) => self.cloneDoc(r)));
          } catch (e) {
            if (reject) reject(e);
            else throw e;
          }
        },
        catch(reject: (err: unknown) => void) {
          return chain.then(undefined as any, reject);
        },
      };
      return chain;
    };

    (Comment as unknown as { findOne: unknown }).findOne = (filter: Record<string, unknown> = {}) => {
      self.checkFault('Comment.findOne');
      const chain = {
        select() { return chain; },
        session() { return chain; },
        lean() { return chain; },
        then(resolve: (val: unknown) => void, reject?: (err: unknown) => void) {
          try {
            const target = Array.from(self.comments.values()).find((c) => self.matchesCommentFilter(c, filter));
            resolve(target ? self.cloneDoc(target) : null);
          } catch (e) {
            if (reject) reject(e);
            else throw e;
          }
        },
        catch(reject: (err: unknown) => void) {
          return chain.then(undefined as any, reject);
        },
      };
      return chain;
    };

    (Comment as unknown as { findById: unknown }).findById = (id: unknown) => {
      return (Comment as unknown as { findOne: (f: Record<string, unknown>) => unknown }).findOne({
        _id: id,
      });
    };

    (Comment as unknown as { create: unknown }).create = async (
      input: Record<string, unknown> | Array<Record<string, unknown>>
    ) => {
      self.checkFault('Comment.create');
      const docs = Array.isArray(input) ? input : [input];
      const created: MockCommentDoc[] = [];

      for (const d of docs) {
        const id = new Types.ObjectId();
        const now = new Date();
        const commentDoc: MockCommentDoc = {
          _id: id,
          post_id: new Types.ObjectId(String(d.post_id)),
          author_id: String(d.author_id),
          parent_comment_id: d.parent_comment_id ? new Types.ObjectId(String(d.parent_comment_id)) : null,
          content: String(d.content),
          like_count: Number(d.like_count) || 0,
          created_at: now,
          updated_at: now,
        };
        self.comments.set(String(id), commentDoc);
        created.push(commentDoc);
      }

      return Array.isArray(input) ? created.map((c) => self.cloneDoc(c)) : self.cloneDoc(created[0]);
    };

    (Comment as unknown as { findByIdAndUpdate: unknown }).findByIdAndUpdate = (
      id: unknown,
      update: Record<string, unknown> | Array<Record<string, unknown>>,
      _options?: Record<string, unknown>
    ) => {
      self.checkFault('Comment.findByIdAndUpdate');
      const chain = {
        select() { return chain; },
        session() { return chain; },
        lean() { return chain; },
        then(resolve: (val: unknown) => void, reject?: (err: unknown) => void) {
          try {
            self.checkFault('Comment.findByIdAndUpdate');
            const target = self.comments.get(String(id));
            if (!target) {
              resolve(null);
              return;
            }
            self.applyCommentUpdate(target, update);
            resolve(self.cloneDoc(target));
          } catch (e) {
            if (reject) reject(e);
            else throw e;
          }
        },
        catch(reject: (err: unknown) => void) {
          return chain.then(undefined as any, reject);
        },
      };
      return chain;
    };

    (Comment as unknown as { deleteMany: unknown }).deleteMany = async (filter: Record<string, unknown>) => {
      self.checkFault('Comment.deleteMany');
      let count = 0;
      for (const [key, comment] of Array.from(self.comments.entries())) {
        if (self.matchesCommentFilter(comment, filter)) {
          self.comments.delete(key);
          count++;
        }
      }
      return { deletedCount: count };
    };

    (Comment as unknown as { deleteOne: unknown }).deleteOne = async (filter: Record<string, unknown>) => {
      self.checkFault('Comment.deleteOne');
      for (const [key, comment] of Array.from(self.comments.entries())) {
        if (self.matchesCommentFilter(comment, filter)) {
          self.comments.delete(key);
          return { deletedCount: 1 };
        }
      }
      return { deletedCount: 0 };
    };
  }

  // --- Prisma Mocks ---
  private installPrismaMocks() {
    const self = this;

    (prisma.user as unknown as { findUnique: unknown }).findUnique = async ({
      where,
    }: {
      where: { id: string };
    }) => {
      self.checkFault('prisma.user.findUnique');
      const user = self.users.get(where.id);
      return user ? self.cloneDoc(user) : null;
    };

    (prisma.user as unknown as { findMany: unknown }).findMany = async ({
      where,
    }: {
      where?: { id?: { in?: string[] } };
    }) => {
      self.checkFault('prisma.user.findMany');
      const ids = where?.id?.in ?? [];
      const result: MockUserDoc[] = [];
      for (const id of ids) {
        const u = self.users.get(id);
        if (u) result.push(self.cloneDoc(u));
      }
      return result;
    };
  }

  // --- Filter Matching Helpers ---
  private matchesPostFilter(post: MockPostDoc, filter: Record<string, unknown>): boolean {
    if ('$and' in filter && Array.isArray(filter.$and)) {
      if (!filter.$and.every((sub) => this.matchesPostFilter(post, sub as Record<string, unknown>))) {
        return false;
      }
    }

    if ('$or' in filter && Array.isArray(filter.$or)) {
      if (!filter.$or.some((sub) => this.matchesPostFilter(post, sub as Record<string, unknown>))) {
        return false;
      }
    }

    if ('_id' in filter && String(post._id) !== String(filter._id)) {
      return false;
    }
    if ('author_id' in filter && post.author_id !== filter.author_id) {
      return false;
    }
    if ('deleted_at' in filter) {
      if (filter.deleted_at === null) {
        if (post.deleted_at !== null && post.deleted_at !== undefined) return false;
      } else if (
        typeof filter.deleted_at === 'object' &&
        filter.deleted_at !== null &&
        '$ne' in filter.deleted_at
      ) {
        if (post.deleted_at === null || post.deleted_at === undefined) return false;
      }
    }

    // Cleanup state filters
    if ('cleanup_state.status' in filter) {
      const val = filter['cleanup_state.status'];
      const status = post.cleanup_state?.status;
      if (typeof val === 'object' && val !== null && '$ne' in val) {
        if (status === (val as { $ne: unknown }).$ne) return false;
      } else if (status !== val) {
        return false;
      }
    }

    if ('cleanup_state.lease_expires_at' in filter) {
      const val = filter['cleanup_state.lease_expires_at'];
      const exp = post.cleanup_state?.lease_expires_at;
      if (val === null) {
        if (exp != null) return false;
      } else if (typeof val === 'object' && val !== null) {
        if ('$exists' in val && !(val as { $exists: boolean }).$exists) {
          if (exp != null) return false;
        }
        if ('$lte' in val) {
          const lteDate = (val as { $lte: Date }).$lte;
          if (!exp || exp.getTime() > lteDate.getTime()) return false;
        }
      }
    }

    if ('cleanup_state.next_retry_at' in filter) {
      const val = filter['cleanup_state.next_retry_at'];
      const nextRetry = post.cleanup_state?.next_retry_at;
      if (val === null) {
        if (nextRetry != null) return false;
      } else if (typeof val === 'object' && val !== null) {
        if ('$exists' in val && !(val as { $exists: boolean }).$exists) {
          if (nextRetry != null) return false;
        }
        if ('$lte' in val) {
          const lteDate = (val as { $lte: Date }).$lte;
          if (!nextRetry || nextRetry.getTime() > lteDate.getTime()) return false;
        }
      }
    }

    // Ownership: a worker may only touch a claim it owns (claimed_by + claim_token)
    for (const f of ['claimed_by', 'claim_token'] as const) {
      const key = `cleanup_state.${f}`;
      if (key in filter && post.cleanup_state?.[f] !== filter[key]) return false;
    }

    // Attempt-count eligibility ($lt in claim, $gte in reaper)
    if ('cleanup_state.attempt_count' in filter) {
      const val = filter['cleanup_state.attempt_count'];
      const count = post.cleanup_state?.attempt_count;
      if (val === null) {
        if (count != null) return false;
      } else if (typeof val === 'object' && val !== null) {
        const v = val as { $lt?: number; $gte?: number; $exists?: boolean };
        if ('$exists' in v && (v.$exists ? count === undefined : count !== undefined)) return false;
        if ('$lt' in v && !(count != null && count < v.$lt!)) return false;
        if ('$gte' in v && !(count != null && count >= v.$gte!)) return false;
      }
    }

    return true;
  }

  private matchesLikeFilter(like: MockLikeDoc, filter: Record<string, unknown>): boolean {
    if ('user_id' in filter && like.user_id !== filter.user_id) {
      return false;
    }
    if ('post_id' in filter) {
      const val = filter.post_id;
      if (typeof val === 'object' && val !== null && '$in' in val) {
        const arr = (val as { $in: unknown[] }).$in.map(String);
        if (!like.post_id || !arr.includes(String(like.post_id))) return false;
      } else if (String(like.post_id) !== String(val)) {
        return false;
      }
    }
    if ('comment_id' in filter) {
      const val = filter.comment_id;
      if (typeof val === 'object' && val !== null && '$in' in val) {
        const arr = (val as { $in: unknown[] }).$in.map(String);
        if (!like.comment_id || !arr.includes(String(like.comment_id))) return false;
      } else if (String(like.comment_id) !== String(val)) {
        return false;
      }
    }
    return true;
  }

  private matchesCommentFilter(comment: MockCommentDoc, filter: Record<string, unknown>): boolean {
    if ('_id' in filter) {
      const val = filter._id;
      if (typeof val === 'object' && val !== null && '$in' in val) {
        const arr = (val as { $in: unknown[] }).$in.map(String);
        if (!arr.includes(String(comment._id))) return false;
      } else if (String(comment._id) !== String(val)) {
        return false;
      }
    }
    if ('post_id' in filter && String(comment.post_id) !== String(filter.post_id)) {
      return false;
    }
    if ('parent_comment_id' in filter) {
      if (filter.parent_comment_id === null) {
        if (comment.parent_comment_id !== null) return false;
      } else if (String(comment.parent_comment_id) !== String(filter.parent_comment_id)) {
        return false;
      }
    }
    return true;
  }

  // --- Update Application Helpers ---
  private applyPostUpdate(
    post: MockPostDoc,
    update: Record<string, unknown> | Array<Record<string, unknown>>
  ) {
    if (Array.isArray(update)) {
      for (const stage of update) {
        if ('$set' in stage) {
          const s = stage.$set as Record<string, unknown>;
          if (s.like_count && typeof s.like_count === 'object' && '$max' in s.like_count) {
            post.like_count = Math.max(0, post.like_count - 1);
          }
        }
      }
      return;
    }

    const ensureCleanupState = (): ICleanupState => {
      if (!post.cleanup_state) {
        post.cleanup_state = emptyCleanupState();
      }
      return post.cleanup_state;
    };

    if (update.$inc) {
      const inc = update.$inc as Record<string, number>;
      if (inc.like_count) post.like_count += inc.like_count;
      if (inc.comment_count) post.comment_count += inc.comment_count;
      if (inc['cleanup_state.attempt_count']) {
        ensureCleanupState().attempt_count += inc['cleanup_state.attempt_count'];
      }
    }

    if (update.$set) {
      const set = update.$set as Record<string, unknown>;
      if ('deleted_at' in set) post.deleted_at = set.deleted_at as Date;
      if ('content' in set) post.content = String(set.content);
      if ('image_url' in set) post.image_url = set.image_url as string | null;
      if ('skills_tags' in set) post.skills_tags = set.skills_tags as string[];
      if ('cleanup_state' in set) post.cleanup_state = set.cleanup_state as ICleanupState;

      // Nested cleanup_state dot notation (generic: any cleanup_state.<field>)
      const cleanupKeys = Object.keys(set).filter((k) => k.startsWith('cleanup_state.'));
      if (cleanupKeys.length > 0) {
        const state = ensureCleanupState() as unknown as Record<string, unknown>;
        for (const key of cleanupKeys) {
          state[key.slice('cleanup_state.'.length)] = set[key];
        }
      }
    }
  }

  private applyCommentUpdate(
    comment: MockCommentDoc,
    update: Record<string, unknown> | Array<Record<string, unknown>>
  ) {
    if (Array.isArray(update)) {
      for (const stage of update) {
        if ('$set' in stage) {
          const s = stage.$set as Record<string, unknown>;
          if (s.like_count && typeof s.like_count === 'object' && '$max' in s.like_count) {
            comment.like_count = Math.max(0, comment.like_count - 1);
          }
        }
      }
      return;
    }

    if (update.$inc) {
      const inc = update.$inc as Record<string, number>;
      if (inc.like_count) comment.like_count += inc.like_count;
    }
  }
}