import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, tinyint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/**
 * 短信验证码表（用于手机号登录/注册）
 */
export const smsCodes = mysqlTable("smsCodes", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull(),
  code: varchar("code", { length: 8 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: tinyint("used").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SmsCode = typeof smsCodes.$inferSelect;
export type InsertSmsCode = typeof smsCodes.$inferInsert;

/**
 * 邮箱重置密码验证码（用于忘记密码）
 */
export const emailResetCodes = mysqlTable("emailResetCodes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 8 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: tinyint("used").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailResetCode = typeof emailResetCodes.$inferSelect;
export type InsertEmailResetCode = typeof emailResetCodes.$inferInsert;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** 11 大产品类目（含马桶贴） */
const categoryEnum = [
  "wallpaper",
  "kitchen",
  "floor",
  "wall_sticker",
  "bathroom",
  "toilet",
  "window",
  "fridge",
  "ps5",
  "macbook",
  "drone",
] as const;

const marketEnum = ["north_america", "europe", "southeast_asia", "middle_east", "south_america", "global"] as const;
const sceneAngleEnum = ["front", "side_45", "overhead", "closeup", "wide_room", "lifestyle"] as const;

/**
 * 产品模板表 - 预设的房间/产品场景模板
 */
export const templates = mysqlTable("templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: mysqlEnum("category", categoryEnum).notNull(),
  description: text("description"),
  /** 场景原图URL（CDN） */
  sceneImageUrl: text("sceneImageUrl").notNull(),
  /** 缩略图URL */
  thumbnailUrl: text("thumbnailUrl"),
  /** 贴图区域坐标JSON: { points: [{x,y},...], tileScale } */
  overlayConfig: json("overlayConfig"),
  /** 是否为系统预设 */
  isPreset: int("isPreset").default(1).notNull(),
  /** 上传者用户ID（自定义模板） */
  userId: int("userId"),
  targetMarket: mysqlEnum("targetMarket", marketEnum).default("global"),
  sceneAngle: mysqlEnum("sceneAngle", sceneAngleEnum).default("front"),
  sceneStyle: varchar("sceneStyle", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = typeof templates.$inferInsert;

/**
 * 生成的图案表
 */
export const patterns = mysqlTable("patterns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** 生成时使用的提示词 */
  prompt: text("prompt").notNull(),
  /** 风格标签 */
  style: varchar("style", { length: 100 }),
  /** 图案图片URL */
  imageUrl: text("imageUrl").notNull(),
  /** S3 文件key */
  fileKey: varchar("fileKey", { length: 512 }),
  /** 图案状态 */
  status: mysqlEnum("status", ["generating", "completed", "failed"]).default("generating").notNull(),
  /** 所属批次任务ID */
  taskId: int("taskId"),
  /** 产品编号 */
  productCode: varchar("productCode", { length: 64 }),
  /** 目标产品类目 */
  targetCategory: mysqlEnum("targetCategory", categoryEnum),
  /** 目标尺寸规格ID */
  targetSizeId: varchar("targetSizeId", { length: 64 }),
  /** 平铺纹样图URL */
  tileImageUrl: text("tileImageUrl"),
  /** 参考素材URL（如果基于参考素材生成） */
  referenceImageUrl: text("referenceImageUrl"),
  targetMarket: mysqlEnum("targetMarket", marketEnum).default("global"),
  seamlessImageUrl: text("seamlessImageUrl"),
  seamlessStatus: mysqlEnum("seamlessStatus", ["none", "processing", "completed", "failed"]).default("none").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Pattern = typeof patterns.$inferSelect;
export type InsertPattern = typeof patterns.$inferInsert;

/**
 * 效果图表 - 图案贴合到模板后的合成图
 */
export const mockups = mysqlTable("mockups", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  patternId: int("patternId").notNull(),
  templateId: int("templateId").notNull(),
  /** 合成效果图URL */
  imageUrl: text("imageUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }),
  /** 产品编号 */
  productCode: varchar("productCode", { length: 64 }),
  usedSeamless: tinyint("usedSeamless").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Mockup = typeof mockups.$inferSelect;
export type InsertMockup = typeof mockups.$inferInsert;

/**
 * 批量生成任务表
 */
export const generateTasks = mysqlTable("generateTasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** 生成提示词 */
  prompt: text("prompt").notNull(),
  /** 风格 */
  style: varchar("style", { length: 100 }),
  /** 目标生成数量 */
  targetCount: int("targetCount").notNull(),
  /** 已完成数量 */
  completedCount: int("completedCount").default(0).notNull(),
  /** 失败数量 */
  failedCount: int("failedCount").default(0).notNull(),
  /** 选定的模板ID列表 */
  templateIds: json("templateIds"),
  /** 任务状态 */
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  /** 输出模式 */
  outputMode: varchar("outputMode", { length: 32 }).default("both"),
  /** 目标产品类目 */
  targetCategory: mysqlEnum("targetCategory", categoryEnum),
  /** 目标尺寸规格ID */
  targetSizeId: varchar("targetSizeId", { length: 64 }),
  /** 参考素材URL */
  referenceImageUrl: text("referenceImageUrl"),
  targetMarket: mysqlEnum("targetMarket", marketEnum).default("global"),
  generateSeamless: tinyint("generateSeamless").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GenerateTask = typeof generateTasks.$inferSelect;
export type InsertGenerateTask = typeof generateTasks.$inferInsert;

/**
 * 产品视频任务表
 */
export const productVideos = mysqlTable("productVideos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  patternId: int("patternId"),
  mockupIds: json("mockupIds"),
  videoType: mysqlEnum("videoType", ["tutorial", "showcase", "selling_points"]).default("showcase").notNull(),
  prompt: text("prompt").notNull(),
  targetMarket: mysqlEnum("targetMarket", marketEnum).default("global"),
  category: mysqlEnum("category", categoryEnum),
  videoUrl: text("videoUrl"),
  thumbnailUrl: text("thumbnailUrl"),
  durationSeconds: int("durationSeconds"),
  status: mysqlEnum("status", ["pending", "generating", "completed", "failed"]).default("pending").notNull(),
  productCode: varchar("productCode", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductVideo = typeof productVideos.$inferSelect;
export type InsertProductVideo = typeof productVideos.$inferInsert;

/**
 * 用户收藏表 — 持久化存储用户收藏的图案和效果图
 */
export const favorites = mysqlTable("favorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** "pattern" | "mockup" */
  itemType: varchar("itemType", { length: 16 }).notNull(),
  itemId: int("itemId").notNull(),
  imageUrl: text("imageUrl").notNull(),
  label: varchar("label", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = typeof favorites.$inferInsert;
