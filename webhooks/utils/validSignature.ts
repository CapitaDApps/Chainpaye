import { Request } from "express";

import crypto from "crypto";
import { loadEnv } from "../../config/env";
import { CustomReq } from "../types/request.type";

// Load environment variables
loadEnv(false);

const APP_SECRET = process.env.APP_SECRET;

export function isRequestSignatureValid(req: Request) {
  if (!APP_SECRET) {
    console.log(
      "App Secret is not set up. Please Add your app secret in /.env file to check for request validation",
    );
    return true;
  }

  const signatureHeader = req.get("x-hub-signature-256");
  if (!signatureHeader) {
    console.error("Missing x-hub-signature-256 header");
    return false;
  }
  
  // Extract the hex signature (remove "sha256=" prefix)
  const signatureHex = signatureHeader.replace("sha256=", "");
  const signatureBuffer = Buffer.from(signatureHex, "hex");

  const rawBody = (req as CustomReq).rawBody;
  if (!rawBody) {
    console.error("Missing rawBody - cannot verify signature");
    return false;
  }

  const hmac = crypto.createHmac("sha256", APP_SECRET);
  const digestString = hmac.update(rawBody).digest("hex");
  const digestBuffer = Buffer.from(digestString, "hex");

  if (!crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
    console.error("Error: Request Signature did not match");
    console.error("Expected signature length:", digestBuffer.length);
    console.error("Received signature length:", signatureBuffer.length);
    console.error("APP_SECRET configured:", APP_SECRET ? "Yes (length: " + APP_SECRET.length + ")" : "No");
    return false;
  }
  return true;
}
