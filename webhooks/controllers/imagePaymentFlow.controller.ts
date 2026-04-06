import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { getImagePaymentFlowScreen } from "../services/imagePaymentFlow.service";

export const imagePaymentFlowController = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;
    return getImagePaymentFlowScreen(decryptedBody);
  },
);
