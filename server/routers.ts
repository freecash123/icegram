import { COOKIE_NAME } from "@shared/const";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { blocks, contacts, conversationMembers, conversations, messages, notifications, reports, stories, userSessions, users } from "../drizzle/schema";
import { storagePut } from "./storage";
import { addNotification, ensureUserIdentity, findUsers, getConversationForUser, getDb, getOrCreateDirectConversation, isBlockedEitherWay, listConversations, listMessages, markConversationRead, upsertSession } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const usernameSchema = z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers, and underscores");
const base64Schema = z.string().min(1).max(28_000_000);

export function isSupportedMediaType(mimeType: string) {
  return /^(image\/(png|jpe?g|gif|webp)|audio\/(webm|ogg|mpeg|wav)|video\/mp4|application\/pdf|text\/plain|application\/zip)$/i.test(mimeType);
}

function requireDb<T>(db: T | null): T {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not configured" });
  return db;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  profile: router({
    me: protectedProcedure.query(async ({ ctx }) => ensureUserIdentity(ctx.user.id)),
    update: protectedProcedure.input(z.object({
      displayName: z.string().trim().min(1).max(80).optional(),
      username: usernameSchema.optional(),
      bio: z.string().trim().max(240).optional(),
      avatarUrl: z.string().url().or(z.string().startsWith("/manus-storage/")).optional(),
      phoneVisibility: z.enum(["everyone", "contacts", "nobody"]).optional(),
      onlineStatus: z.enum(["online", "away", "invisible"]).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      if (input.username) {
        const duplicate = await db.select({ id: users.id }).from(users).where(and(eq(users.username, input.username.toLowerCase()), sql`${users.id} <> ${ctx.user.id}`)).limit(1);
        if (duplicate[0]) throw new TRPCError({ code: "CONFLICT", message: "That username is already taken" });
      }
      await db.update(users).set({ ...input, username: input.username?.toLowerCase() }).where(eq(users.id, ctx.user.id));
      return ensureUserIdentity(ctx.user.id);
    }),
  }),

  search: router({
    users: protectedProcedure.input(z.object({ query: z.string().trim().min(1).max(80) })).query(({ ctx, input }) => findUsers(input.query, ctx.user.id)),
  }),

  chat: router({
    list: protectedProcedure.query(({ ctx }) => listConversations(ctx.user.id)),
    start: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot start a chat with yourself" });
      if (await isBlockedEitherWay(ctx.user.id, input.userId)) throw new TRPCError({ code: "FORBIDDEN", message: "This conversation is unavailable" });
      return getOrCreateDirectConversation(ctx.user.id, input.userId);
    }),
    messages: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await markConversationRead(input.conversationId, ctx.user.id);
      return listMessages(input.conversationId, ctx.user.id);
    }),
    markRead: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).mutation(({ ctx, input }) => markConversationRead(input.conversationId, ctx.user.id)),
    send: protectedProcedure.input(z.object({
      conversationId: z.number().int().positive(),
      body: z.string().max(10_000).optional(),
      type: z.enum(["text", "image", "file", "voice"]).default("text"),
      mediaUrl: z.string().startsWith("/manus-storage/").optional(),
      mediaKey: z.string().optional(),
      fileName: z.string().max(255).optional(),
      mimeType: z.string().max(160).optional(),
      fileSize: z.number().int().nonnegative().max(20_000_000).optional(),
    })).mutation(async ({ ctx, input }) => {
      if (!input.body?.trim() && !input.mediaUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Message cannot be empty" });
      const db = requireDb(await getDb());
      const access = await getConversationForUser(input.conversationId, ctx.user.id);
      if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "Conversation access denied" });
      const members = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, input.conversationId));
      for (const member of members) {
        if (member.userId !== ctx.user.id && await isBlockedEitherWay(ctx.user.id, member.userId)) throw new TRPCError({ code: "FORBIDDEN", message: "This conversation is unavailable" });
      }
      const inserted = await db.insert(messages).values({ ...input, senderId: ctx.user.id, body: input.body?.trim() || null, status: "delivered" });
      await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
      await Promise.all(members.filter(member => member.userId !== ctx.user.id).map(member => addNotification(member.userId, "message", "New message", input.type === "text" ? (input.body ?? "New message") : `New ${input.type} message`, `/app?chat=${input.conversationId}`)));
      return (await db.select().from(messages).where(eq(messages.id, Number(inserted[0].insertId))).limit(1))[0];
    }),
    createGroup: protectedProcedure.input(z.object({ title: z.string().trim().min(2).max(100), description: z.string().trim().max(280).optional(), memberIds: z.array(z.number().int().positive()).max(100).default([]) })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const inserted = await db.insert(conversations).values({ kind: "group", title: input.title, description: input.description, ownerId: ctx.user.id });
      const conversationId = Number(inserted[0].insertId);
      const memberIds = Array.from(new Set([ctx.user.id, ...input.memberIds]));
      await db.insert(conversationMembers).values(memberIds.map(userId => ({ conversationId, userId, role: userId === ctx.user.id ? "owner" as const : "member" as const })));
      return (await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1))[0];
    }),
    createChannel: protectedProcedure.input(z.object({ title: z.string().trim().min(2).max(100), description: z.string().trim().max(280).optional() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const inserted = await db.insert(conversations).values({ kind: "channel", title: input.title, description: input.description, ownerId: ctx.user.id });
      const conversationId = Number(inserted[0].insertId);
      await db.insert(conversationMembers).values({ conversationId, userId: ctx.user.id, role: "owner" });
      return (await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1))[0];
    }),
    setMemberRole: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), memberUserId: z.number().int().positive(), role: z.enum(["admin", "member"]) })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const owner = await db.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, ctx.user.id), or(eq(conversationMembers.role, "owner"), eq(conversationMembers.role, "admin")))).limit(1);
      if (!owner[0]) throw new TRPCError({ code: "FORBIDDEN", message: "Only group admins can manage permissions" });
      await db.update(conversationMembers).set({ role: input.role }).where(and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, input.memberUserId)));
      return { success: true };
    }),
  }),

  media: router({
    upload: protectedProcedure.input(z.object({ fileName: z.string().trim().min(1).max(180), mimeType: z.string().max(160), data: base64Schema })).mutation(async ({ ctx, input }) => {
      if (!isSupportedMediaType(input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "This file type is not supported" });
      const buffer = Buffer.from(input.data, "base64");
      if (buffer.byteLength > 20_000_000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Files must be 20 MB or smaller" });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const stored = await storagePut(`icegram/${ctx.user.id}/${safeName}`, buffer, input.mimeType);
      return { ...stored, fileName: input.fileName, mimeType: input.mimeType, fileSize: buffer.byteLength };
    }),
  }),

  contacts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = requireDb(await getDb());
      return db.select({ contact: contacts, user: { id: users.id, name: users.name, displayName: users.displayName, username: users.username, icegramId: users.icegramId, avatarUrl: users.avatarUrl, bio: users.bio } }).from(contacts).innerJoin(users, eq(users.id, contacts.contactUserId)).where(eq(contacts.ownerId, ctx.user.id)).orderBy(desc(contacts.createdAt));
    }),
    add: protectedProcedure.input(z.object({ userId: z.number().int().positive(), label: z.string().max(120).optional() })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "You are already in your contacts" });
      const db = requireDb(await getDb());
      await db.insert(contacts).values({ ownerId: ctx.user.id, contactUserId: input.userId, label: input.label }).onDuplicateKeyUpdate({ set: { label: input.label ?? null } });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      await db.delete(contacts).where(and(eq(contacts.ownerId, ctx.user.id), eq(contacts.contactUserId, input.userId)));
      return { success: true };
    }),
  }),

  stories: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = requireDb(await getDb());
      return db.select({ story: stories, user: { id: users.id, displayName: users.displayName, name: users.name, username: users.username, avatarUrl: users.avatarUrl } }).from(stories).innerJoin(users, eq(users.id, stories.userId)).where(and(gt(stories.expiresAt, new Date()), or(eq(stories.visibility, "public"), eq(stories.userId, ctx.user.id)))).orderBy(desc(stories.createdAt)).limit(80);
    }),
    create: protectedProcedure.input(z.object({ type: z.enum(["text", "image", "video"]).default("text"), body: z.string().max(500).optional(), mediaUrl: z.string().startsWith("/manus-storage/").optional(), mediaKey: z.string().optional(), visibility: z.enum(["public", "contacts", "closeFriends"]).default("contacts") })).mutation(async ({ ctx, input }) => {
      if (!input.body?.trim() && !input.mediaUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Story cannot be empty" });
      const db = requireDb(await getDb());
      await db.insert(stories).values({ ...input, userId: ctx.user.id, body: input.body?.trim(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
      return { success: true };
    }),
  }),

  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = requireDb(await getDb());
      return db.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(50);
    }),
    markRead: protectedProcedure.input(z.object({ id: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      if (input.id) await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));
      else await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
      return { success: true };
    }),
  }),

  privacy: router({
    block: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      await db.insert(blocks).values({ blockerId: ctx.user.id, blockedId: input.userId }).onDuplicateKeyUpdate({ set: { createdAt: new Date() } });
      return { success: true };
    }),
    unblock: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      await db.delete(blocks).where(and(eq(blocks.blockerId, ctx.user.id), eq(blocks.blockedId, input.userId)));
      return { success: true };
    }),
    listBlocked: protectedProcedure.query(async ({ ctx }) => {
      const db = requireDb(await getDb());
      return db.select({ block: blocks, user: { id: users.id, name: users.name, displayName: users.displayName, username: users.username, avatarUrl: users.avatarUrl } }).from(blocks).innerJoin(users, eq(users.id, blocks.blockedId)).where(eq(blocks.blockerId, ctx.user.id)).orderBy(desc(blocks.createdAt));
    }),
    report: protectedProcedure.input(z.object({ targetUserId: z.number().int().positive().optional(), conversationId: z.number().int().positive().optional(), reason: z.string().trim().min(3).max(255) })).mutation(async ({ ctx, input }) => {
      if (!input.targetUserId && !input.conversationId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose something to report" });
      const db = requireDb(await getDb());
      await db.insert(reports).values({ reporterId: ctx.user.id, targetUserId: input.targetUserId, conversationId: input.conversationId, reason: input.reason });
      return { success: true };
    }),
  }),

  sessions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await upsertSession(ctx.user.id, "Current browser", ctx.req.headers["user-agent"]);
      const db = requireDb(await getDb());
      return db.select().from(userSessions).where(eq(userSessions.userId, ctx.user.id)).orderBy(desc(userSessions.lastSeenAt));
    }),
    revoke: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      await db.delete(userSessions).where(and(eq(userSessions.id, input.id), eq(userSessions.userId, ctx.user.id)));
      return { success: true };
    }),
  }),

  admin: router({
    overview: adminProcedure.query(async () => {
      const db = requireDb(await getDb());
      const [userCount, reportCount, conversationCount, messageCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users),
        db.select({ count: sql<number>`count(*)` }).from(reports).where(eq(reports.status, "open")),
        db.select({ count: sql<number>`count(*)` }).from(conversations),
        db.select({ count: sql<number>`count(*)` }).from(messages),
      ]);
      return { users: Number(userCount[0]?.count ?? 0), openReports: Number(reportCount[0]?.count ?? 0), conversations: Number(conversationCount[0]?.count ?? 0), messages: Number(messageCount[0]?.count ?? 0) };
    }),
  }),
});

export type AppRouter = typeof appRouter;
