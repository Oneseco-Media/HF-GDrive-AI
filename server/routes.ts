import path from "path";
import fs from "fs";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import fileRoutes from "./files/routes";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Serve uploaded files as static assets
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  app.use("/uploads", (await import("express")).default.static(UPLOADS_DIR));

  // File management + Google Drive routes
  app.use("/api", fileRoutes);

  return httpServer;
}
