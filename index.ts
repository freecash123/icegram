import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";

const app = express();
let routesReady: Promise<void> | null = null;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "icegram-api" });
});

async function ensureRoutes() {
  if (routesReady) return routesReady;
  routesReady = (async () => {
    const [{ createExpressMiddleware }, { appRouter }, { createContext }, { registerOAuthRoutes }, { registerStorageProxy }] = await Promise.all([
      import("@trpc/server/adapters/express"),
      import("./server/routers"),
      import("./server/_core/context"),
      import("./server/_core/oauth"),
      import("./server/_core/storageProxy"),
    ]);
    registerStorageProxy(app);
    registerOAuthRoutes(app);
    app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
    app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      console.error("[API] Unhandled request error", error);
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    });
  })();
  return routesReady;
}

export default async function handler(req: Request, res: Response) {
  try {
    if (req.path === "/api/health") {
      app(req, res);
      return;
    }
    await ensureRoutes();
    app(req, res);
  } catch (error) {
    console.error("[API] Function startup failed", error);
    if (!res.headersSent) res.status(500).json({ error: "API startup failed" });
  }
}
