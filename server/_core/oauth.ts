/**
 * OAuth routes — disabled in standalone mode.
 * Login is handled via email/password through tRPC auth.login.
 */
import type { Express, Request, Response } from "express";

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", (_req: Request, res: Response) => {
    res.redirect("/?error=oauth_disabled");
  });
}
