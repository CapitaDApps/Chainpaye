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
  amount?: string;
  screen?: string;
  error_msg?: string;
  evmAddress?: string;
  chain?: string;
  token?: string;
  currentBalance?: string;
}

/**
 * Main handler for referral withdrawal flow
 * 
 * @param req Express request object
 * @param res Express response object
 */
export async function handleReferralWithdrawalFlow(req: Request, res: Response) {
  try {
    const { from, flow_token, data, screen } = req.body;
    const flowData = data as ReferralWithdrawalFlowData;
    const currentScreen = screen || flowData?.screen;

    logger.info("Referral withdrawal flow submission:", {
      from,
      flow_token,
      screen: currentScreen,
      data: flowData,
      fullBody: req.body,
    });

    // Handle different screens
    switch (currentScreen) {
      case "WITHDRAWAL_DETAILS":
        return await handleWithdrawalDetails(req, res, flowData);
        
      case "WITHDRAWAL_CONFIRMATION":
        return await handleWithdrawalConfirmation(req, res, flowData);
        
      case "ERROR":
        return await handleFlowError(req, res, flowData);
        
      default:
        logger.warn("Unknown referral withdrawal flow screen:", { 
          screen: currentScreen,
          availableScreens: ["WITHDRAWAL_DETAILS", "WITHDRAWAL_CONFIRMATION", "ERROR"]
        });
        
        return res.status(200).json({
          success: false,
          error: `Unknown screen: ${currentScreen}`,
          message: "Flow screen not recognized",
        });
    }

  } catch (error: any) {
    logger.error("Error handling referral withdrawal flow:", {
      error: error.message,
      stack: error.stack,
      body: req.body,
    });

    return res.status(500).json({
      success: false,
      error: "Internal server error processing withdrawal request",
    });
  }
}

/**
 * Handle withdrawal details screen submission
 */
async function handleWithdrawalDetails(req: Request, res: Response, flowData: ReferralWithdrawalFlowData) {
  const { from } = req.body;

  try {
    // Validate required data
    if (!flowData.amount || !from) {
      logger.error("Missing required data in withdrawal details:", {
        amount: flowData.amount,
        from,
      });
      
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Withdrawal Error*\n\nMissing required information. Please try again.\n\nType *referral* to restart.",
        from
      );
      
      return res.status(200).json({
        success: false,
        error: "Missing required withdrawal data",
      });
    }

    // Parse and validate amount
    const amount = parseFloat(flowData.amount);
    if (isNaN(amount) || amount < 20) {
      logger.error("Invalid withdrawal amount:", { amount: flowData.amount });
      
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Invalid Amount*\n\nMinimum withdrawal is $20. You entered: $${flowData.amount}\n\nType *referral* to try again.`,
        from
      );
      
      return res.status(200).json({
        success: false,
        error: "Invalid withdrawal amount",
      });
    }

    // Extract userId from phone number
    const phone = from.startsWith("+") ? from : `+${from}`;
    const userId = phone;

    // Create withdrawal request
    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

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
      userId: from,
      amount: flowData.amount,
      error: error.message,
    });

    // Send error message to user
    const errorMessage = `
❌ *Withdrawal Request Failed*

${error.message}

Type *referral* to try again or check your balance.
    `.trim();

    await whatsappBusinessService.sendNormalMessage(errorMessage, from);

    return res.status(200).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Handle withdrawal confirmation screen
 */
async function handleWithdrawalConfirmation(req: Request, res: Response, flowData: ReferralWithdrawalFlowData) {
  logger.info("Withdrawal confirmation received:", { flowData });
  
  return res.status(200).json({
    success: true,
    message: "Withdrawal confirmation received",
  });
}

/**
 * Handle flow error screen
 */
async function handleFlowError(req: Request, res: Response, flowData: ReferralWithdrawalFlowData) {
  const { from } = req.body;
  const errorMsg = flowData.error_msg || "Unknown error occurred in withdrawal flow";
  
  logger.error("Flow error received:", {
    from,
    error_msg: errorMsg,
    flowData,
  });

  // Send error message to user
  const userErrorMessage = `
❌ *Withdrawal Flow Error*

${errorMsg}

Please try again or contact support if the issue persists.

Type *referral* to restart the withdrawal process.
  `.trim();

  await whatsappBusinessService.sendNormalMessage(userErrorMessage, from);

  return res.status(200).json({
    success: false,
    error: errorMsg,
    message: "Flow error handled",
  });
}