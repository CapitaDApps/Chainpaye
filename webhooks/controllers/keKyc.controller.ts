import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { keKycFlowScreen } from "../services/keKycFlow.service";

/**
 * Kenya KYC Flow Controller
 * Handles National ID verification for Kenyan users
 */
export const keKycFlowController = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;
    const screenResponse = await keKycFlowScreen(decryptedBody);
    return screenResponse;
  },
);
