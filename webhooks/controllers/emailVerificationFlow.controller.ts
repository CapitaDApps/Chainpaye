import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { emailVerificationFlowScreen } from "../services/emailVerificationFlow.service";

/**
 * Email Verification Flow Controller
 * Handles email verification flow requests for KYC-verified users
 */
export const emailVerificationFlowController = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;

    const screenResponse = await emailVerificationFlowScreen(decryptedBody);
    return screenResponse;
  },
);
