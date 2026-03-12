import { Request, Response } from "express";
import { decryptRequest } from "../encryption";
import { getBankDetailsScreen } from "../services/usdDepositFlow.service";

export const bankDetailsFlowController = async (req: Request, res: Response) => {
  try {
    const decryptedBody = decryptRequest(req.body);
    console.log("Bank Details Flow Request:", JSON.stringify(decryptedBody, null, 2));

    const response = await getBankDetailsScreen(decryptedBody);
    console.log("Bank Details Flow Response:", JSON.stringify(response, null, 2));

    res.status(200).json(response);
  } catch (error) {
    console.error("Error in bank details flow controller:", error);
    res.status(500).json({
      data: {
        error_message: "Internal server error. Please try again later.",
      },
    });
  }
};