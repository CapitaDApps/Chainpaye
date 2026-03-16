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
import { flowMiddleware } from "../middlewares";

/**
 * Interface for referral withdrawal flow data
 */
interface ReferralWithdrawalFlowData {
  amount: string;
  screen: string;
  flow_token: string;
  evmAddress?: string;
  chain?: string;
  token?: string;
  currentBalance?: string;
}

/**
 * Handle referral withdrawal flow submission with encryption support
 * 
 * Processes the withdrawal request and sends confirmation to user.
 * 
 * @param req Express request object with decrypted data
 * @param res Express response object
 */
async function handleReferralWithdrawalFlowInternal(req: Request, res: Response) {
  try {
    const { decryptedBody } = req.decryptedData!;
    const flowData = decryptedBody as ReferralWithdrawalFlowData;

    logger.info("Referral withdrawal flow submission:", {
      screen: flowData.screen,
      amount: flowData.amount,
      flow_token: flowData.flow_token,
    });

    // Handle different screens
    switch (flowData.screen) {
      case "WITHDRAWAL_DETAILS":
        return await processWithdrawalRequest(flowData);
      
      case "WITHDRAWAL_CONFIRMATION":
        return {
          screen: "WITHDRAWAL_CONFIRMATION",
          data: {
            status: "success",
            message: "Withdrawal request processed successfully"
          }
        };
      
      default:
        logger.warn("Unknown referral withdrawal flow screen:", { screen: flowData.screen });
        return {
          screen: "ERROR",
          data: {
            error_msg: "Unknown screen in withdrawal flow"
          }
        };
    }

  } catch (error: any) {
    logger.error("Error handling referral withdrawal flow:", {
      error: error.message,
      stack: error.stack,
    });

    return {
      screen: "ERROR",
      data: {
        error_msg: "An error occurred processing your withdrawal request. Please try again."
      }
    };
  }
}

/**
 * Process the withdrawal request from the flow
 */
async function processWithdrawalRequest(flowData: ReferralWithdrawalFlowData) {
  // Validate required data
  if (!flowData.amount || !flowData.flow_token) {
    logger.error("Missing required data in referral withdrawal flow:", {
      amount: flowData.amount,
      flow_token: flowData.flow_token,
    });
    
    return {
      screen: "WITHDRAWAL_DETAILS",
      data: {
        error_message: "Missing required withdrawal information. Please try again."
      }
    };
  }

  // Parse and validate amount
  const amount = parseFloat(flowData.amount);
  if (isNaN(amount) || amount < 20) {
    logger.error("Invalid withdrawal amount:", { amount: flowData.amount });
    
    return {
      screen: "WITHDRAWAL_DETAILS", 
      data: {
        error_message: "Invalid withdrawal amount. Minimum is $20."
      }
    };
  }

  try {
    // Get user phone number from Redis using flow token
    const { redisClient } = await import("../../services/redis");
    const userPhone = await redisClient.get(flowData.flow_token);
    
    if (!userPhone) {
      logger.error("Could not find user for flow token:", { flow_token: flowData.flow_token });
      
      return {
        screen: "WITHDRAWAL_DETAILS",
        data: {
          error_message: "Session expired. Please try again."
        }
      };
    }

    // Extract userId from phone number
    const userId = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    // Create withdrawal request
    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

    const withdrawal = await withdrawalService.requestWithdrawal({
      userId,
      amount,
    });

    // Send confirmation message to user
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

    // Send message asynchronously (don't wait for it)
    whatsappBusinessService.sendNormalMessage(confirmationMessage, userPhone).catch(error => {
      logger.error("Failed to send withdrawal confirmation message:", error);
    });

    logger.info("Referral withdrawal request created successfully:", {
      withdrawalId: withdrawal.id,
      userId,
      amount,
      evmAddress: withdrawal.evmAddress,
    });

    // Return success response for the flow
    return {
      screen: "WITHDRAWAL_CONFIRMATION",
      data: {
        amount: amount.toFixed(2),
        evmAddress: withdrawal.evmAddress,
        chain: "Base",
        token: "USDT",
        status: "submitted"
      }
    };

  } catch (error: any) {
    logger.error("Error creating withdrawal request:", {
      amount,
      error: error.message,
    });

    return {
      screen: "WITHDRAWAL_DETAILS",
      data: {
        error_message: error.message || "Failed to process withdrawal request. Please try again."
      }
    };
  }
}

/**
 * Export the controller with flow middleware
 */
export const handleReferralWithdrawalFlow = flowMiddleware(handleReferralWithdrawalFlowInternal);