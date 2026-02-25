import { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { isRequestSignatureValid } from "./utils/validSignature";
import { CustomReq } from "./types/request.type";

// Rate limiter for user-facing endpoints
export const userRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Stricter rate limiter for sensitive operations
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Signature verification middleware for Meta webhooks
export function verifyWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (isRequestSignatureValid(req)) {
      return next();
    }
    console.error("Invalid webhook signature received");
    return res.status(403).json({ error: "Invalid signature" });
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return res.status(403).json({ error: "Signature verification failed" });
  }
}

// Crossmint webhook signature verification middleware
export function verifyCrossmintWebhook(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const webhookSecret = process.env.CROSSMINT_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.warn("CROSSMINT_WEBHOOK_SECRET not configured - skipping verification");
      return next(); // Allow in development if not configured
    }

    // Crossmint sends signature in X-Crossmint-Signature header
    const signature = req.headers["x-crossmint-signature"] as string;
    
    if (!signature) {
      console.error("Missing X-Crossmint-Signature header");
      return res.status(403).json({ error: "Missing signature" });
    }

    // Get raw body (should be available from body-parser with verify option)
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    
    // Compute expected signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    // Compare signatures
    if (signature === expectedSignature) {
      console.log("Crossmint webhook signature verified successfully");
      return next();
    }

    console.error("Invalid Crossmint webhook signature");
    return res.status(403).json({ error: "Invalid signature" });
  } catch (error) {
    console.error("Error verifying Crossmint webhook signature:", error);
    return res.status(403).json({ error: "Signature verification failed" });
  }
}
