import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";
import { logger } from "./logger";

/**
 * Idempotent schema migrations run at every startup.
 * Uses the app's own DATABASE_URL — no need for a separate maintenance account.
 * As a fallback, also tries the Debian system-maintenance socket
 * (password from DB_MAINTENANCE_PASSWORD env var).
 */
async function runStartupMigrations() {
  let conn: import("mysql2/promise").Connection | null = null;
  try {
    const mysql2 = await import("mysql2/promise");
    const dbUrl = ENV.databaseUrl;
    const dbName = dbUrl.split("/").pop()?.split("?")[0] || "decor_ai";

    // Primary: parse DATABASE_URL and connect as the app user
    const parseUrl = (url: string) => {
      const m = url.match(/mysql:\/\/([^:@]*)(?::([^@]*))?@([^:/]+)(?::(\d+))?\/(.+)/);
      if (!m) return null;
      return { host: m[3], port: Number(m[4] || 3306), user: m[1], password: m[2] || undefined, database: m[5] };
    };

    const parsed = parseUrl(dbUrl);
    if (parsed) {
      conn = await mysql2.createConnection(parsed).catch(async () => {
        // Fallback: Debian socket (only present on Ubuntu/Debian MySQL installs)
        const maintPass = ENV.dbMaintenancePassword;
        if (!maintPass) throw new Error("No DB_MAINTENANCE_PASSWORD set for fallback");
        return mysql2.createConnection({
          socketPath: "/var/run/mysqld/mysqld.sock",
          user: "debian-sys-maint",
          password: maintPass,
          database: dbName,
        });
      });
    } else {
      throw new Error("Cannot parse DATABASE_URL for startup migrations");
    }

    const safe = async (sql: string, label: string) => {
      try {
        await conn!.execute(sql);
        logger.info(`[DB] Migration applied: ${label}`);
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === "ER_TABLE_EXISTS_ERROR" || code === "ER_DUP_FIELDNAME") {
          logger.debug(`[DB] Already applied: ${label}`); return;
        }
        logger.warn(`[DB] Migration warning (${label}): ${(e as Error).message}`);
      }
    };

    // smsCodes table
    await safe(
      "CREATE TABLE IF NOT EXISTS `smsCodes` (`id` int AUTO_INCREMENT NOT NULL, `phone` varchar(20) NOT NULL, `code` varchar(8) NOT NULL, `expiresAt` timestamp NOT NULL, `used` tinyint NOT NULL DEFAULT 0, `createdAt` timestamp NOT NULL DEFAULT (now()), PRIMARY KEY(`id`))",
      "create smsCodes"
    );
    // users.phone column
    await safe("ALTER TABLE `users` ADD COLUMN `phone` varchar(20)", "add users.phone");
    // favorites table
    await safe(
      "CREATE TABLE IF NOT EXISTS `favorites` (`id` int AUTO_INCREMENT NOT NULL, `userId` int NOT NULL, `itemType` varchar(16) NOT NULL, `itemId` int NOT NULL, `imageUrl` text NOT NULL, `label` varchar(255), `createdAt` timestamp NOT NULL DEFAULT (now()), PRIMARY KEY(`id`), INDEX `favorites_userId_idx` (`userId`), UNIQUE INDEX `favorites_unique` (`userId`, `itemType`, `itemId`))",
      "create favorites"
    );
    // emailResetCodes table
    await safe(
      "CREATE TABLE IF NOT EXISTS `emailResetCodes` (`id` int AUTO_INCREMENT NOT NULL, `email` varchar(320) NOT NULL, `code` varchar(8) NOT NULL, `expiresAt` timestamp NOT NULL, `used` tinyint NOT NULL DEFAULT 0, `createdAt` timestamp NOT NULL DEFAULT (now()), PRIMARY KEY(`id`), INDEX `emailResetCodes_email_idx` (`email`))",
      "create emailResetCodes"
    );

    logger.info("[DB] Startup migrations complete.");
  } catch (e) {
    logger.warn(`[DB] Startup migrations skipped: ${(e as Error).message}`);
  } finally {
    conn?.end().catch(() => {});
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  await runStartupMigrations();
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Request/response logging middleware
  app.use((req, _res, next) => {
    const start = Date.now();
    _res.on("finish", () => {
      const ms = Date.now() - start;
      const level = _res.statusCode >= 500 ? "error" : _res.statusCode >= 400 ? "warn" : "debug";
      logger[level](`${req.method} ${req.path}`, {
        status: _res.statusCode,
        ms,
        ip: req.ip,
      });
    });
    next();
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Image proxy — fetches OSS/CDN images server-side to bypass browser CORS restrictions.
  // Usage: GET /api/image-proxy?url=<encoded-image-url>
  app.get("/api/image-proxy", async (req, res) => {
    const { url } = req.query as { url?: string };
    if (!url) { res.status(400).send("Missing url param"); return; }
    try {
      const upstream = await fetch(url);
      if (!upstream.ok) { res.status(upstream.status).send("Upstream error"); return; }
      const contentType = upstream.headers.get("content-type") ?? "image/png";
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(buffer);
    } catch (e: any) {
      res.status(500).send(`Proxy error: ${e.message}`);
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ path, error }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          logger.error(`[tRPC] ${path}`, { message: error.message, stack: error.stack?.slice(0, 500) });
        } else {
          logger.warn(`[tRPC] ${path}`, { code: error.code, message: error.message });
        }
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logger.warn(`Port ${preferredPort} busy, using ${port}`);
  }

  // Global unhandled-error catch-all (must be last middleware)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("[Express] Unhandled error", { message: (err as Error)?.message, stack: (err as Error)?.stack?.slice(0, 500) });
    res.status(500).json({ error: "Internal server error" });
  });

  server.listen(port, () => {
    logger.info(`Server started`, { port, env: process.env.NODE_ENV ?? "development" });
  });
}

startServer().catch((err) => {
  logger.error("[Startup] Fatal error", { message: err?.message, stack: err?.stack });
  process.exit(1);
});
