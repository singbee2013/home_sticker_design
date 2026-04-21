/**
 * Standalone auth SDK — replaces Manus OAuth SDK.
 * Uses local email/password auth + JWT session cookies.
 */
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookies } from "cookie";
import type { Request } from "express";
import * as db from "../db";
import { ForbiddenError } from "@shared/_core/errors";
import { verifySessionCookie } from "./authUtils";
import type { User } from "../../drizzle/schema";

class SDKServer {
  async authenticateRequest(req: Request): Promise<User> {
    const cookies = parseCookies(req.headers.cookie ?? "");
    const session = await verifySessionCookie(cookies[COOKIE_NAME]);

    if (!session) throw ForbiddenError("Invalid or missing session");

    const user = await db.getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("User not found");

    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    return user;
  }
}

export const sdk = new SDKServer();
