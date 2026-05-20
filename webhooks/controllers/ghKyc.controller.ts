import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { ghKycFlowScreen } from "../services/ghKycFlow.service";

/**
 * Ghana KYC Flow Controller
 * Handles Passport verification for Ghanaian users
 */
export const ghKycFlowController = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;
    const screenResponse = await ghKycFlowScreen(decryptedBody);
    return screenResponse;
  },
);
