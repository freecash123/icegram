import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";

const app = express();
let trpcReady: Promise<void> | null = null;
let oauthReady: Promise<void> | null = null;
let storageReady: Promise<void> | null = null;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "icegram-api" });
});

async function ensureTrpc() {
  if (trpcReady) return trpcReady;
  trpcReady = (async () => {
    const [{ createExpressMiddleware }, { appRouter }, { createContext }] = await Promise.all([
      import("@trpc/server/adapters/express"),
      import("./server/routers"),
      import("./server/_core/context"),
    ]);
    app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  })();
  return trpcReady;
}

async function ensureOAuth() {
  if (oauthReady) return oauthReady;
  oauthReady = import("./server/_core/oauth").then(({ registerOAuthRoutes }) => {
    registerOAuthRoutes(app);
  });
  return oauthReady;
}

async function ensureStorage() {
  if (storageReady) return storageReady;
  storageReady = import("./server/_core/storageProxy").then(({ registerStorageProxy }) => {
    registerStorageProxy(app);
  });
  return storageReady;
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[API] Unhandled request error", error);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});

export default async function handler(req: Request, res: Response) {
  try {
    const requestPath = (req.url ?? "").split("?", 1)[0];
    if (requestPath === "/api/health" || req.path === "/api/health") {
      app(req, res);
      return;
    }
    if (requestPath.startsWith("/api/trpc") || req.path.startsWith("/api/trpc")) await ensureTrpc();
    if (requestPath.startsWith("/api/oauth") || req.path.startsWith("/api/oauth")) await ensureOAuth();
    if (requestPath.startsWith("/api/storage") || req.path.startsWith("/api/storage")) await ensureStorage();
    app(req, res);
  } catch (error) {
    console.error("[API] Function startup failed", error);
    if (!res.headersSent) {
      const detail = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "API startup failed", detail });
    }
  }
}
