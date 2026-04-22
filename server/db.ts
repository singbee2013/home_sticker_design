import { eq, desc, and, sql, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  templates, InsertTemplate,
  patterns, InsertPattern,
  mockups, InsertMockup,
  generateTasks, InsertGenerateTask,
  productVideos, InsertProductVideo,
  smsCodes,
  emailResetCodes,
  favorites, InsertFavorite,
} from "../drizzle/schema";
import { ENV } from './_core/env';

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

// ========== User Helpers ==========

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "phone", "loginMethod", "passwordHash"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    // No Manus ownerOpenId in standalone mode — first registered user becomes admin via UI or manual DB update
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByPhone(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== SMS Code Helpers ==========

export async function saveSmsCode(phone: string, code: string, ttlSeconds = 300): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db.insert(smsCodes).values({ phone, code, expiresAt, used: 0 });
}

export async function verifySmsCode(phone: string, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const now = new Date();
  const rows = await db
    .select()
    .from(smsCodes)
    .where(
      and(
        eq(smsCodes.phone, phone),
        eq(smsCodes.code, code),
        eq(smsCodes.used, 0),
        sql`${smsCodes.expiresAt} > ${now}`,
      )
    )
    .limit(1);
  if (rows.length === 0) return false;
  // Mark as used
  await db.update(smsCodes).set({ used: 1 }).where(eq(smsCodes.id, rows[0].id));
  return true;
}

export async function saveEmailResetCode(email: string, code: string, ttlSeconds = 600): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db.insert(emailResetCodes).values({ email, code, expiresAt, used: 0 });
}

export async function verifyEmailResetCode(email: string, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const now = new Date();
  const rows = await db
    .select()
    .from(emailResetCodes)
    .where(
      and(
        eq(emailResetCodes.email, email),
        eq(emailResetCodes.code, code),
        eq(emailResetCodes.used, 0),
        sql`${emailResetCodes.expiresAt} > ${now}`,
      )
    )
    .limit(1);
  if (rows.length === 0) return false;
  await db.update(emailResetCodes).set({ used: 1 }).where(eq(emailResetCodes.id, rows[0].id));
  return true;
}

export async function updateUserPasswordByEmail(email: string, passwordHash: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (result.length === 0) return false;
  await db
    .update(users)
    .set({ passwordHash, loginMethod: "email", updatedAt: new Date() })
    .where(eq(users.email, email));
  return true;
}

// ========== Template Helpers ==========

export async function getTemplates(category?: string, targetMarket?: string, sceneAngle?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (category) conditions.push(eq(templates.category, category as never));
  if (targetMarket) conditions.push(eq(templates.targetMarket, targetMarket as never));
  if (sceneAngle) conditions.push(eq(templates.sceneAngle, sceneAngle as never));
  if (conditions.length === 0) {
    return db.select().from(templates).orderBy(desc(templates.createdAt));
  }
  if (conditions.length === 1) {
    return db.select().from(templates).where(conditions[0]).orderBy(desc(templates.createdAt));
  }
  return db.select().from(templates).where(and(...conditions)).orderBy(desc(templates.createdAt));
}

export async function getTemplateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(templates).where(eq(templates.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createTemplate(data: InsertTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(templates).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getTemplateCount(category?: string) {
  const db = await getDb();
  if (!db) return 0;
  if (category) {
    const result = await db.select({ count: sql<number>`count(*)` }).from(templates).where(eq(templates.category, category as any));
    return result[0]?.count ?? 0;
  }
  const result = await db.select({ count: sql<number>`count(*)` }).from(templates);
  return result[0]?.count ?? 0;
}

export async function deleteTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(templates).where(eq(templates.id, id));
}

// ========== Pattern Helpers ==========

export async function createPattern(data: InsertPattern) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(patterns).values(data);
  return { id: Number(result[0].insertId) };
}

export async function updatePattern(id: number, data: Partial<InsertPattern>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(patterns).set(data).where(eq(patterns.id, id));
}

/** 将仍显示「生成中」且无图片 URL 的记录标为失败（用于修复历史卡死项） */
export async function markStuckGeneratingPatternsFailed(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(patterns)
    .set({ status: "failed" })
    .where(and(eq(patterns.userId, userId), eq(patterns.status, "generating"), eq(patterns.imageUrl, "")));
}

export async function deletePattern(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(patterns).where(eq(patterns.id, id));
}

export async function getPatternsByUser(userId: number, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  // 自动修复：长时间「生成中」且无图（例如旧版批量失败未回写、或上游请求挂起）
  const cutoff = new Date(Date.now() - 90_000);
  try {
    await db
      .update(patterns)
      .set({ status: "failed" })
      .where(
        and(
          eq(patterns.userId, userId),
          eq(patterns.status, "generating"),
          eq(patterns.imageUrl, ""),
          lte(patterns.createdAt, cutoff),
        )
      );
  } catch (e) {
    console.warn("[db] auto-repair stuck patterns skipped:", (e as Error).message);
  }
  return db.select().from(patterns)
    .where(eq(patterns.userId, userId))
    .orderBy(desc(patterns.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getPatternById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(patterns).where(eq(patterns.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPatternsByTask(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(patterns)
    .where(eq(patterns.taskId, taskId))
    .orderBy(desc(patterns.createdAt));
}

export async function getPatternCount() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(patterns);
  return result[0]?.count ?? 0;
}

// ========== Mockup Helpers ==========

export async function createMockup(data: InsertMockup) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(mockups).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getMockupsByUser(userId: number, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mockups)
    .where(eq(mockups.userId, userId))
    .orderBy(desc(mockups.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getMockupsByPattern(patternId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mockups)
    .where(eq(mockups.patternId, patternId))
    .orderBy(desc(mockups.createdAt));
}

export async function deleteMockup(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(mockups).where(eq(mockups.id, id));
}

// ========== GenerateTask Helpers ==========

export async function createGenerateTask(data: InsertGenerateTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(generateTasks).values(data);
  return { id: Number(result[0].insertId) };
}

export async function updateGenerateTask(id: number, data: Partial<InsertGenerateTask>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(generateTasks).set(data).where(eq(generateTasks.id, id));
}

export async function getGenerateTasksByUser(userId: number, limit = 20, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(generateTasks)
    .where(eq(generateTasks.userId, userId))
    .orderBy(desc(generateTasks.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getGenerateTaskById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(generateTasks).where(eq(generateTasks.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== Product Video Helpers ==========

export async function createProductVideo(data: InsertProductVideo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(productVideos).values(data);
  return { id: Number(result[0].insertId) };
}

export async function updateProductVideo(id: number, data: Partial<InsertProductVideo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(productVideos).set(data).where(eq(productVideos.id, id));
}

export async function getProductVideosByUser(userId: number, limit = 20, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productVideos)
    .where(eq(productVideos.userId, userId))
    .orderBy(desc(productVideos.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getProductVideoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(productVideos).where(eq(productVideos.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getProductVideosByPattern(patternId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(productVideos)
    .where(eq(productVideos.patternId, patternId))
    .orderBy(desc(productVideos.createdAt));
}

// ========== Favorites Helpers ==========

export async function getFavoritesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
}

export async function getFavorite(userId: number, itemType: string, itemId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(favorites)
    .where(and(
      eq(favorites.userId, userId),
      eq(favorites.itemType, itemType),
      eq(favorites.itemId, itemId),
    ))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function addFavorite(data: InsertFavorite) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(favorites).values(data);
  return { id: Number(result[0].insertId) };
}

export async function removeFavorite(userId: number, itemType: string, itemId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(favorites).where(
    and(
      eq(favorites.userId, userId),
      eq(favorites.itemType, itemType),
      eq(favorites.itemId, itemId),
    )
  );
}
