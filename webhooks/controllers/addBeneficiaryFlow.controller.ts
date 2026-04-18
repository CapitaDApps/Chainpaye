import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { getAddBeneficiaryFlowScreen } from "../services/addBeneficiaryFlow.service";

export const addBeneficiaryFlowController = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;
    return await getAddBeneficiaryFlowScreen(decryptedBody);
  },
);
