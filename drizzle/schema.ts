import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  icegramId: varchar("icegramId", { length: 32 }).unique(),
  username: varchar("username", { length: 64 }).unique(),
  displayName: text("displayName"),
  bio: text("bio"),
  avatarUrl: text("avatarUrl"),
  phoneVisibility: mysqlEnum("phoneVisibility", ["everyone", "contacts", "nobody"]).default("nobody").notNull(),
  onlineStatus: mysqlEnum("onlineStatus", ["online", "away", "invisible"]).default("online").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", ["direct", "group", "channel"]).notNull(),
  directKey: varchar("directKey", { length: 128 }).unique(),
  title: text("title"),
  description: text("description"),
  avatarUrl: text("avatarUrl"),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ownerIdx: index("conversations_owner_idx").on(table.ownerId),
  kindIdx: index("conversations_kind_idx").on(table.kind),
}));

export const conversationMembers = mysqlTable("conversationMembers", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
  lastReadAt: timestamp("lastReadAt"),
  muted: boolean("muted").default(false).notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, (table) => ({
  memberUnique: uniqueIndex("conversation_member_unique").on(table.conversationId, table.userId),
  userIdx: index("conversation_members_user_idx").on(table.userId),
}));

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: int("senderId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["text", "image", "file", "voice", "system"]).default("text").notNull(),
  body: text("body"),
  mediaUrl: text("mediaUrl"),
  mediaKey: text("mediaKey"),
  fileName: varchar("fileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 160 }),
  fileSize: int("fileSize"),
  status: mysqlEnum("status", ["sending", "sent", "delivered", "read", "failed"]).default("delivered").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  conversationIdx: index("messages_conversation_idx").on(table.conversationId, table.createdAt),
  senderIdx: index("messages_sender_idx").on(table.senderId),
}));

export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactUserId: int("contactUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  contactUnique: uniqueIndex("contact_unique").on(table.ownerId, table.contactUserId),
}));

export const blocks = mysqlTable("blocks", {
  id: int("id").autoincrement().primaryKey(),
  blockerId: int("blockerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: int("blockedId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  blockUnique: uniqueIndex("block_unique").on(table.blockerId, table.blockedId),
}));

export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  reporterId: int("reporterId").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetUserId: int("targetUserId").references(() => users.id, { onDelete: "cascade" }),
  conversationId: int("conversationId").references(() => conversations.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["open", "reviewing", "resolved"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const stories = mysqlTable("stories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["text", "image", "video"]).default("text").notNull(),
  body: text("body"),
  mediaUrl: text("mediaUrl"),
  mediaKey: text("mediaKey"),
  visibility: mysqlEnum("visibility", ["public", "contacts", "closeFriends"]).default("contacts").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  storyUserIdx: index("stories_user_idx").on(table.userId, table.createdAt),
  storyExpiryIdx: index("stories_expiry_idx").on(table.expiresAt),
}));

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 80 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body"),
  href: varchar("href", { length: 255 }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  notificationUserIdx: index("notifications_user_idx").on(table.userId, table.createdAt),
}));

export const userSessions = mysqlTable("userSessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceName: varchar("deviceName", { length: 120 }).notNull(),
  userAgent: text("userAgent"),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  sessionUserIdx: index("user_sessions_user_idx").on(table.userId, table.lastSeenAt),
}));

export const iceboxItems = mysqlTable("iceboxItems", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: mysqlEnum("kind", ["note", "link", "message", "file", "task"]).default("note").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body"),
  url: text("url"),
  mediaUrl: text("mediaUrl"),
  mediaKey: text("mediaKey"),
  tags: varchar("tags", { length: 500 }),
  favorite: boolean("favorite").default(false).notNull(),
  openedAt: timestamp("openedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userCreatedIdx: index("icebox_user_created_idx").on(table.userId, table.createdAt),
  userFavoriteIdx: index("icebox_user_favorite_idx").on(table.userId, table.favorite),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type IceboxItem = typeof iceboxItems.$inferSelect;
