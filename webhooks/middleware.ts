import { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { Webhook } from "svix";
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

// Crossmint webhook signature verification middleware using Svix
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

    // Get the Svix headers
    const svixId = req.headers["svix-id"] as string;
    const svixTimestamp = req.headers["svix-timestamp"] as string;
    const svixSignature = req.headers["svix-signature"] as string;

    // Check if all required Svix headers are present
    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error("Missing required Svix headers");
      return res.status(400).json({ 
        error: "Missing required webhook headers" 
      });
    }

    // Get raw body (should be available from body-parser with verify option)
    const rawBody = (req as CustomReq).rawBody;
    
    if (!rawBody) {
      console.error("Missing raw body for webhook verification");
      return res.status(400).json({ 
        error: "Missing request body" 
      });
    }

    // Create Svix webhook instance
    const wh = new Webhook(webhookSecret);

    // Verify the webhook
    try {
      const payload = wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });

      console.log("Crossmint webhook signature verified successfully");
      
      // Attach the verified payload to the request for use in the controller
      (req as any).verifiedPayload = payload;
      
      return next();
    } catch (verificationError) {
      console.error("Svix webhook verification failed:", verificationError);
      return res.status(400).json({ 
        error: "Webhook verification failed" 
      });
    }
  } catch (error) {
    console.error("Error in Crossmint webhook verification middleware:", error);
    return res.status(500).json({ 
      error: "Internal server error during webhook verification" 
    });
  }
}
