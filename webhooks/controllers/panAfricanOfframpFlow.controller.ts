import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { getPanAfricanOfframpFlowScreen } from "../services/panAfricanOfframpFlow.service";

export const panAfricanOfframpFlowController = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;
    return await getPanAfricanOfframpFlowScreen(decryptedBody);
  },
);
