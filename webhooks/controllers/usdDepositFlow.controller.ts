import { Request, Response } from "express";
import { decryptRequest } from "../encryption";
import { getUsdDepositScreen } from "../services/usdDepositFlow.service";

export const usdDepositFlowController = async (req: Request, res: Response) => {
  try {
    const decryptedBody = decryptRequest(req.body);
    console.log("USD Deposit Flow Request:", JSON.stringify(decryptedBody, null, 2));

    const response = await getUsdDepositScreen(decryptedBody);
    console.log("USD Deposit Flow Response:", JSON.stringify(response, null, 2));

    res.status(200).json(response);
  } catch (error) {
    console.error("Error in USD deposit flow controller:", error);
    res.status(500).json({
      data: {
        error_message: "Internal server error. Please try again later.",
      },
    });
  }
};