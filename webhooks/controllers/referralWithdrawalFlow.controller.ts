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

interface ReferralWithdrawalFlowData {
  amount?: string;
  screen?: string;
  error_msg?: string;
  evmAddress?: string;
  chain?: string;
  token?: string;
  currentBalance?: string;
}

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
    });

    switch (currentScreen) {
      case "WITHDRAWAL_DETAILS":
        return await handleWithdrawalDetails(req, res, flowData);
      case "WITHDRAWAL_CONFIRMATION":
        return await handleWithdrawalConfirmation(req, res, flowData);
      case "ERROR":
        return await handleFlowError(req, res, flowData);
      default:
        logger.warn("Unknown referral withdrawal flow screen:", { screen: currentScreen });
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

async function handleWithdrawalDetails(
  req: Request,
  res: Response,
  flowData: ReferralWithdrawalFlowData
) {
  const { from } = req.body;

  try {
    // Validate required fields
    if (!flowData.amount || !from) {
      logger.error("Missing required data in withdrawal details:", { amount: flowData.amount, from });
      await whatsappBusinessService.sendNormalMessage(
        "Missing required information. Please try again.\n\nType *referral* to restart.",
        from
      );
      return res.status(200).json({ success: false, error: "Missing required withdrawal data" });
    }

    // Validate amount
    const amount = parseFloat(flowData.amount);
    if (isNaN(amount) || amount < 20) {
      logger.error("Invalid withdrawal amount:", { amount: flowData.amount });
      await whatsappBusinessService.sendNormalMessage(
        `Minimum withdrawal is $20. You entered: ${flowData.amount}\n\nType *referral* to try again.`,
        from
      );
      return res.status(200).json({ success: false, error: "Invalid withdrawal amount" });
    }

    // Validate EVM address
    const evmAddress = flowData.evmAddress;
    if (!evmAddress) {
      logger.error("Missing evmAddress in withdrawal details:", { flowData });
      await whatsappBusinessService.sendNormalMessage(
        "No wallet address found. Please update your profile and try again.\n\nType *referral* to restart.",
        from
      );
      return res.status(200).json({ success: false, error: "Missing EVM wallet address" });
    }

    const chain = flowData.chain || "base";
    const token = flowData.token || "USDT";
    const userId = from.startsWith("+") ? from : `+${from}`;

    // Create withdrawal request
    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);
    const withdrawal = await withdrawalService.requestWithdrawal(userId, amount, evmAddress, chain, token);

    // Send confirmation to user
    const shortAddress = `${evmAddress.substring(0, 6)}...${evmAddress.slice(-4)}`;
    const dateStr = withdrawal.requestedAt.toISOString().split("T")[0];
    const confirmMsg = [
      "Withdrawal Request Submitted",
      "",
      `Amount: ${amount.toFixed(2)} ${token}`,
      `Chain: ${chain}`,
      `Address: ${shortAddress}`,
      `Status: Pending Review`,
      `Requested: ${dateStr}`,
      "",
      "Your withdrawal is being processed. You'll be notified once the funds are sent.",
      "",
      "Type *referral history* to check status anytime.",
    ].join("\n");

    await whatsappBusinessService.sendNormalMessage(confirmMsg, from);

    logger.info("Referral withdrawal request created successfully:", {
      withdrawalId: withdrawal.id,
      userId,
      amount,
      evmAddress,
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
    await whatsappBusinessService.sendNormalMessage(
      `Withdrawal request failed: ${error.message}\n\nType *referral* to try again.`,
      from
    );
    return res.status(200).json({ success: false, error: error.message });
  }
}

async function handleWithdrawalConfirmation(
  req: Request,
  res: Response,
  flowData: ReferralWithdrawalFlowData
) {
  logger.info("Withdrawal confirmation received:", { flowData });
  return res.status(200).json({ success: true, message: "Withdrawal confirmation received" });
}

async function handleFlowError(
  req: Request,
  res: Response,
  flowData: ReferralWithdrawalFlowData
) {
  const { from } = req.body;
  const errorMsg = flowData.error_msg || "Unknown error occurred in withdrawal flow";

  logger.error("Flow error received:", { from, error_msg: errorMsg, flowData });

  await whatsappBusinessService.sendNormalMessage(
    `Withdrawal flow error: ${errorMsg}\n\nType *referral* to restart.`,
    from
  );

  return res.status(200).json({ success: false, error: errorMsg, message: "Flow error handled" });
}
