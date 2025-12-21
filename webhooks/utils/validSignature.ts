import { Request } from "express";

import crypto from "crypto";
import dotenv from "dotenv";
import { CustomReq } from "../types/request.type";
dotenv.config();

const APP_SECRET = process.env.APP_SECRET;

export function isRequestSignatureValid(req: Request) {
  if (!APP_SECRET) {
    console.log(
      "App Secret is not set up. Please Add your app secret in /.env file to check for request validation"
    );
    return true;
  }

  const signatureHeader = req.get("x-hub-signature-256");
  if (!signatureHeader) throw new Error("Invalid sig head");
  const signatureBuffer = Buffer.from(
    signatureHeader.replace("sha256=", ""),
    "utf-8"
  );

  const hmac = crypto.createHmac("sha256", APP_SECRET);
  const digestString = hmac.update((req as CustomReq).rawBody).digest("hex");
  const digestBuffer = Buffer.from(digestString, "utf-8");

  if (!crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
    console.error("Error: Request Signature did not match");
    return false;
  }
  return true;
}
