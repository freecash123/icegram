import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  blocks,
  contacts,
  conversationMembers,
  conversations,
  iceboxItems,
  InsertUser,
  messages,
  notifications,
  reports,
  stories,
  userSessions,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

function makeIcegramId() {
  const part = () => Math.floor(1000 + Math.random() * 9000).toString();
  return `ICE-${part()}-${part()}`;
}

export async function ensureUserIdentity(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!existing[0]) throw new Error("User not found");
  if (existing[0].icegramId) return existing[0];
  const identity = makeIcegramId();
  await db.update(users).set({ icegramId: identity, displayName: existing[0].displayName ?? existing[0].name ?? "Icegram user" }).where(eq(users.id, userId));
  const updated = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return updated[0];
}

export async function findUsers(query: string, currentUserId: number) {
  const db = await getDb();
  if (!db || !query.trim()) return [];
  const term = `%${query.trim().replace(/[%_]/g, "\\$&")}%`;
  return db.select({
    id: users.id,
    name: users.name,
    displayName: users.displayName,
    username: users.username,
    icegramId: users.icegramId,
    avatarUrl: users.avatarUrl,
    bio: users.bio,
  }).from(users).where(and(eq(users.id, users.id), or(like(users.username, term), like(users.icegramId, term), like(users.displayName, term), like(users.name, term)))).limit(20);
}

export async function getConversationForUser(conversationId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({ conversation: conversations, membership: conversationMembers }).from(conversations)
    .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
    .where(and(eq(conversations.id, conversationId), eq(conversationMembers.userId, userId))).limit(1);
  return rows[0];
}

export async function getOrCreateDirectConversation(userId: number, otherUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const directKey = [userId, otherUserId].sort((a, b) => a - b).join(":");
  const existing = await db.select().from(conversations).where(eq(conversations.directKey, directKey)).limit(1);
  if (existing[0]) return existing[0];
  const result = await db.insert(conversations).values({ kind: "direct", directKey, ownerId: userId, title: "Direct chat" });
  const conversationId = Number(result[0].insertId);
  await db.insert(conversationMembers).values([
    { conversationId, userId, role: "owner" },
    { conversationId, userId: otherUserId, role: "member" },
  ]);
  return (await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1))[0];
}

export async function listConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ conversation: conversations, membership: conversationMembers })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(eq(conversationMembers.userId, userId))
    .orderBy(desc(conversations.updatedAt));
  const result = [];
  for (const row of rows) {
    const members = await db.select({ id: users.id, displayName: users.displayName, name: users.name, username: users.username, avatarUrl: users.avatarUrl })
      .from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(eq(conversationMembers.conversationId, row.conversation.id)).limit(8);
    const latest = await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id)).orderBy(desc(messages.createdAt)).limit(1);
    result.push({ ...row.conversation, membership: row.membership, members, latest: latest[0] ?? null });
  }
  return result;
}

export async function listMessages(conversationId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const access = await getConversationForUser(conversationId, userId);
  if (!access) throw new Error("Conversation access denied");
  return db.select({ message: messages, sender: { id: users.id, name: users.name, displayName: users.displayName, username: users.username, avatarUrl: users.avatarUrl } })
    .from(messages).innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt).limit(200);
}

export async function markConversationRead(conversationId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(conversationMembers).set({ lastReadAt: new Date() }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
  await db.update(messages).set({ status: "read" }).where(and(eq(messages.conversationId, conversationId), sql`${messages.senderId} <> ${userId}`, sql`${messages.status} <> 'read'`));
}

export async function addNotification(userId: number, kind: string, title: string, body: string, href?: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values({ userId, kind, title, body, href });
}

export async function isBlockedEitherWay(userId: number, otherUserId: number) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(blocks).where(or(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, otherUserId)), and(eq(blocks.blockerId, otherUserId), eq(blocks.blockedId, userId)))).limit(1);
  return Boolean(rows[0]);
}

export async function upsertSession(userId: number, deviceName: string, userAgent?: string) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(userSessions).where(and(eq(userSessions.userId, userId), eq(userSessions.deviceName, deviceName))).limit(1);
  if (existing[0]) {
    await db.update(userSessions).set({ lastSeenAt: new Date(), userAgent }).where(eq(userSessions.id, existing[0].id));
  } else {
    await db.insert(userSessions).values({ userId, deviceName, userAgent });
  }
}

export async function listIceboxItems(userId: number, query?: string, favoritesOnly = false) {
  const db = await getDb();
  if (!db) return [];
  const term = query?.trim() ? `%${query.trim().replace(/[%_]/g, "\\$&")}%` : null;
  const filters = [eq(iceboxItems.userId, userId)];
  if (favoritesOnly) filters.push(eq(iceboxItems.favorite, true));
  if (term) filters.push(or(like(iceboxItems.title, term), like(iceboxItems.body, term), like(iceboxItems.tags, term))!);
  return db.select().from(iceboxItems).where(and(...filters)).orderBy(desc(iceboxItems.updatedAt)).limit(100);
}

export async function createIceboxItem(input: typeof iceboxItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.insert(iceboxItems).values(input);
  return (await db.select().from(iceboxItems).where(eq(iceboxItems.id, Number(result[0].insertId))).limit(1))[0];
}

export async function updateIceboxItem(userId: number, id: number, patch: Partial<typeof iceboxItems.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await db.update(iceboxItems).set(patch).where(and(eq(iceboxItems.id, id), eq(iceboxItems.userId, userId)));
  return (await db.select().from(iceboxItems).where(and(eq(iceboxItems.id, id), eq(iceboxItems.userId, userId))).limit(1))[0];
}

export async function deleteIceboxItem(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await db.delete(iceboxItems).where(and(eq(iceboxItems.id, id), eq(iceboxItems.userId, userId)));
  return { success: true } as const;
}
