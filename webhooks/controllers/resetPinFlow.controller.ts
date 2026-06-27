import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { getResetPinScreen } from "../services/resetPinFlow.service";

export const resetPinFlow = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;
    return getResetPinScreen(decryptedBody);
  },
);
