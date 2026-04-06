import { Request, Response } from "express";
import { getUsdDepositScreen } from "../services/usdDepositFlow.service";
import { flowMiddleware } from "../middlewares";

export const usdDepositFlowController = flowMiddleware(async (req: Request, res: Response) => {
  const { decryptedBody } = req.decryptedData!;
  console.log("USD Deposit Flow Request:", JSON.stringify(decryptedBody, null, 2));

  const response = await getUsdDepositScreen(decryptedBody);
  console.log("USD Deposit Flow Response:", JSON.stringify(response, null, 2));

  return response;
});