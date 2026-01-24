import { NextFunction, Request, Response } from "express";
import {
  decryptRequest,
  encryptResponse,
  FlowEndpointException,
} from "../encryption";
import { isRequestSignatureValid } from "../utils/validSignature";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PASSPHRASE = process.env.PASSPHRASE;

// Extend Request type to include decrypted data
declare global {
  namespace Express {
    interface Request {
      decryptedData?: {
        aesKeyBuffer: any;
        initialVectorBuffer: any;
        decryptedBody: any;
      };
    }
  }
}

/**
 * Middleware to validate environment variables for flow endpoints
 */
export function validateFlowEnv(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!PRIVATE_KEY) {
    throw new Error(
      'Private key is empty. Please check your env variable "PRIVATE_KEY".'
    );
  }

  if (!PASSPHRASE) {
    throw new Error(
      'Pass phrase is empty. Please check your env variable "PASSPHRASE".'
    );
  }

  next();
}

/**
 * Middleware to validate request signature for flow endpoints
 */
export function validateFlowSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!isRequestSignatureValid(req)) {
    // Return status code 432 if request signature does not match.
    // To learn more about return error codes visit: https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes#endpoint_error_codes
    return res.status(432).send();
  }

  next();
}

/**
 * Middleware to decrypt request and handle decryption errors
 */
export function decryptFlowRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  let decryptedRequest = null;
  try {
    decryptedRequest = decryptRequest(req.body, PRIVATE_KEY!, PASSPHRASE!);
  } catch (err) {
    console.error(err);
    if (err instanceof FlowEndpointException) {
      return res.status(err.statusCode).send();
    }
    return res.status(500).send();
  }

  const { aesKeyBuffer, initialVectorBuffer, decryptedBody } = decryptedRequest;

  // Store decrypted data in request object for later use
  req.decryptedData = {
    aesKeyBuffer,
    initialVectorBuffer,
    decryptedBody,
  };

  console.log("💬 Decrypted Request:", decryptedBody);
  next();
}

/**
 * Middleware to log and encrypt response
 */
export function encryptFlowResponse(
  handler: (req: Request, res: Response) => Promise<any>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const screenResponse = await handler(req, res);
      console.log("👉 Response to Encrypt:", screenResponse);

      if (req.decryptedData) {
        res.send(
          encryptResponse(
            screenResponse,
            req.decryptedData.aesKeyBuffer,
            req.decryptedData.initialVectorBuffer
          )
        );
      } else {
        res.status(500).send();
      }
    } catch (error) {
      console.error("Error in flow handler:", error);
      res.status(500).send();
    }
  };
}

/**
 * Combined middleware for all flow endpoints
 */
export function flowMiddleware(
  handler: (req: Request, res: Response) => Promise<any>
) {
  return [
    validateFlowEnv,
    validateFlowSignature,
    decryptFlowRequest,
    encryptFlowResponse(handler),
  ];
}
