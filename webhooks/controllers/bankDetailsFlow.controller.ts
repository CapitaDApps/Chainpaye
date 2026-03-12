import { Request, Response } from "express";
import { getBankDetailsScreen } from "../services/usdDepositFlow.service";
import { flowMiddleware } from "../middlewares";

export const bankDetailsFlowController = flowMiddleware(async (req: Request, res: Response) => {
  const { decryptedBody } = req.decryptedData!;
  console.log("Bank Details Flow Request:", JSON.stringify(decryptedBody, null, 2));

  const response = await getBankDetailsScreen(decryptedBody);
  console.log("Bank Details Flow Response:", JSON.stringify(response, null, 2));

  return response;
});