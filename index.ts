import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./server/routers";
import { createContext } from "./server/_core/context";
import { registerOAuthRoutes } from "./server/_core/oauth";
import { registerStorageProxy } from "./server/_core/storageProxy";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "icegram-api" });
});
app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[API] Unhandled request error", error);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});

export default app;
