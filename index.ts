import express from "express";
import { createApiApp } from "./server/_core/index";

// Keep the explicit Express import in the root entrypoint for Vercel detection.
const app = createApiApp();

export default app;
