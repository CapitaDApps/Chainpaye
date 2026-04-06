import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { kycFlowScreen } from "../services/kycFlow.service";

/**
 * KYC Flow Controller
 * Handles BVN verification requests for Nigerian users
 */
export const kycFlowController = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;

    // TODO: Add flow token validation if needed
    // If the flow token becomes invalid, return HTTP code 427

    const screenResponse = await kycFlowScreen(decryptedBody);
    return screenResponse;
  },
);
