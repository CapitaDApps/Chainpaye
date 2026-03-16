/**
 * Referral Withdrawal Flow Controller
 * 
 * Handles WhatsApp flow submissions for referral earnings withdrawals.
 * Processes withdrawal requests and sends confirmation messages.
 */

import { Request, Response } from "express";
import { WithdrawalService } from "../../services/WithdrawalService";
import { PointsRepository } from "../../repositories/PointsRepository";
import { whatsappBusinessService } from "../../services";
import { logger } from "../../utils/logger";

/**
 * Interface for referral withdrawal flow data
 */
interface ReferralWithdrawalFlowData {
  amount: string;
  screen: string;
}

/**
 * Handle referral withdrawal flow submission
 * 
 * Processes the withdrawal request and sends confirmation to user.
 * 
 * @param req Express request object
 * @param res Express response object
 */
export async function handleReferralWithdrawalFlow(req: Request, res: Response) {
  try {
    const { from, flow_token, data } = req.body;
    const flowData = data as ReferralWithdrawalFlowData;

    logger.info("Referral withdrawal flow submission:", {
      from,
      flow_token,
      data: flowData,
    });

    // Validate required data
    if (!flowData.amount || !from) {
      logger.error("Missing required data in referral withdrawal flow:", {
        amount: flowData.amount,
        from,
      });
      return res.status(400).json({
        error: "Missing required withdrawal data",
      });
    }

    // Parse and validate amount
    const amount = parseFloat(flowData.amount);
    if (isNaN(amount) || amount < 20) {
      logger.error("Invalid withdrawal amount:", { amount: flowData.amount });
      return res.status(400).json({
        error: "Invalid withdrawal amount",
      });
    }

    // Extract userId from phone number
    const phone = from.startsWith("+") ? from : `+${from}`;
    const userId = phone; // Assuming userId is the phone number

    // Create withdrawal request
    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

    try {
      const withdrawal = await withdrawalService.requestWithdrawal({
        userId,
        amount,
      });

      // Send confirmation message
      const confirmationMessage = `
✅ *Withdrawal Request Submitted*

💰 *Amount:* $${amount.toFixed(2)} USDT
🔗 *Chain:* Base
📍 *Address:* ${withdrawal.evmAddress.substring(0, 6)}...${withdrawal.evmAddress.substring(-4)}
⏰ *Status:* Pending Review
📅 *Requested:* ${withdrawal.requestedAt.toISOString().split('T')[0]}

Your withdrawal request is being processed. You'll receive a notification once the USDT has been sent to your wallet.

Type *referral history* to check status anytime.
      `.trim();

      await whatsappBusinessService.sendNormalMessage(confirmationMessage, from);

      logger.info("Referral withdrawal request created successfully:", {
        withdrawalId: withdrawal.id,
        userId,
        amount,
        evmAddress: withdrawal.evmAddress,
      });

      return res.status(200).json({
        success: true,
        message: "Withdrawal request submitted successfully",
        withdrawalId: withdrawal.id,
      });

    } catch (error: any) {
      logger.error("Error creating withdrawal request:", {
        userId,
        amount,
        error: error.message,
      });

      // Send error message to user
      const errorMessage = `
❌ *Withdrawal Request Failed*

${error.message}

Type *referral* to try again or check your balance.
      `.trim();

      await whatsappBusinessService.sendNormalMessage(errorMessage, from);

      return res.status(400).json({
        error: error.message,
      });
    }

  } catch (error: any) {
    logger.error("Error handling referral withdrawal flow:", {
      error: error.message,
      body: req.body,
    });

    return res.status(500).json({
      error: "Internal server error processing withdrawal request",
    });
  }
}

/**
 * Handle different screens in the referral withdrawal flow
 * 
 * @param req Express request object
 * @param res Express response object
 */
export async function handleReferralWithdrawalFlowScreens(req: Request, res: Response) {
  try {
    const { screen, data } = req.body;

    switch (screen) {
      case "WITHDRAWAL_DETAILS":
        // Handle the main withdrawal details screen
        return handleReferralWithdrawalFlow(req, res);

      case "WITHDRAWAL_CONFIRMATION":
        // Handle confirmation screen (if needed)
        return res.status(200).json({
          success: true,
          message: "Confirmation received",
        });

      default:
        logger.warn("Unknown referral withdrawal flow screen:", { screen });
        return res.status(400).json({
          error: "Unknown flow screen",
        });
    }

  } catch (error: any) {
    logger.error("Error handling referral withdrawal flow screens:", {
      error: error.message,
      body: req.body,
    });

    return res.status(500).json({
      error: "Internal server error",
    });
  }
}