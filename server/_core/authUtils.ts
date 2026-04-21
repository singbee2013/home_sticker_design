/**
 * Password hashing + session helpers — pure Node.js built-ins, no packages needed.
 */
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Request, Response } from "express";
import { getSessionCookieOptions } from "./cookies";

const scryptAsync = promisify(scrypt);

// ── Password ──────────────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derivedKey = (await scryptAsync(plain, salt, 64)) as Buffer;
  const storedBuf = Buffer.from(hash, "hex");
  return timingSafeEqual(derivedKey, storedBuf);
}

// ── Session JWT ───────────────────────────────────────────────────────────────

function secretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createSessionCookie(
  res: Response,
  payload: { openId: string; name: string }
): Promise<void> {
  const token = await new SignJWT({ openId: payload.openId, appId: ENV.appId, name: payload.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(secretKey());

  res.cookie(COOKIE_NAME, token, getSessionCookieOptions(res.req as Request));
}

export async function verifySessionCookie(
  cookieValue: string | undefined
): Promise<{ openId: string; name: string } | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, secretKey(), { algorithms: ["HS256"] });
    const { openId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || typeof name !== "string") return null;
    return { openId, name: name as string };
  } catch {
    return null;
  }
}
