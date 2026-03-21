import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// In-memory token store: token -> expiry timestamp
const activeSessions = new Map<string, number>();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function adminLogin(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return res.status(500).json({ success: false, error: "Admin credentials not configured" });
  }

  if (email !== adminEmail || password !== adminPassword) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const token = generateToken();
  activeSessions.set(token, Date.now() + SESSION_TTL_MS);

  return res.json({ success: true, token });
}

export function adminLogout(req: Request, res: Response) {
  const token = extractToken(req);
  if (token) activeSessions.delete(token);
  return res.json({ success: true });
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const expiry = activeSessions.get(token);
  if (!expiry || Date.now() > expiry) {
    activeSessions.delete(token);
    return res.status(401).json({ success: false, error: "Session expired" });
  }

  // Refresh TTL on activity
  activeSessions.set(token, Date.now() + SESSION_TTL_MS);
  next();
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}
