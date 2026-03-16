/**
 * Referral Withdrawal Flow Controller
 *
 * Handles WhatsApp encrypted flow submissions for referral earnings withdrawals.
 * Uses flowMiddleware for request decryption, signature validation, and response encryption.
 * This is required for Meta's flow health check and all flow interactions.
 */

import { Request, Response } from "express";
import { WithdrawalService } from "../../services/WithdrawalService";
import { PointsRepository } from "../../repositories/PointsRepository";
import { CrossmintService } from "../../services/CrossmintService";
import { whatsappBusinessService } from "../../services";
import { User } from "../../models/User";
import { logger } from "../../utils/logger";
import { flowMiddleware } from "../middlewares";
import { redisClient } from "../../services/redis";

async function referralWithdrawalFlowHandler(req: Request, _res: Response) {
  const { decryptedBody } = req.decryptedData!;
  const { screen, data, action, flow_token } = decryptedBody;

  logger.info("Referral withdrawal flow:", { action, screen, flow_token });

  // Meta health check — must respond with { data: { status: "active" } }
  if (action === "ping") {
    return { data: { status: "active" } };
  }

  // Client-side error notification
  if (data?.error) {
    logger.warn("Referral withdrawal flow client error:", data);
    return { data: { status: "Error", acknowledged: true } };
  }

  // INIT — flow opening, initial screen data already injected by sendReferralWithdrawalFlow
  if (action === "INIT") {
    return { screen: "WITHDRAWAL_DETAILS", data: {} };
  }

  if (action === "data_exchange") {
    // Resolve phone from Redis flow_token
    const userPhone = await redisClient.get(flow_token);
    if (!userPhone) {
      return {
        screen: "WITHDRAWAL_DETAILS",
        data: { error_message: "Session expired. Please restart the flow." },
      };
    }
    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    // Resolve internal userId (UUID) — PointsBalance and ReferralRelationship use userId, not phone
    const user = await User.findOne({ whatsappNumber: phone });
    if (!user) {
      return {
        screen: "WITHDRAWAL_DETAILS",
        data: { error_message: "Account not found. Please contact support." },
      };
    }
    const userId = user.userId;

    switch (screen) {
      case "WITHDRAWAL_DETAILS": {
        const { amount, chain, token, currentBalance } = data;

        // Validate amount
        const parsedAmount = parseFloat(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount < 20) {
          return {
            screen: "WITHDRAWAL_DETAILS",
            data: {
              error_message: `Minimum withdrawal is $20. You entered: ${amount ?? "nothing"}`,
              currentBalance,
              chain,
              token,
            },
          };
        }

        try {
          // Fetch EVM address from Crossmint — same method used when sending the flow
          const crossmintService = new CrossmintService();
          const wallet = await crossmintService.getOrCreateWallet(userId, "base");
          const evmAddress = wallet.address;

          const pointsRepository = new PointsRepository();
          const withdrawalService = new WithdrawalService(pointsRepository);
          const withdrawal = await withdrawalService.requestWithdrawal(
            userId,
            parsedAmount,
            evmAddress,
            chain || "base",
            token || "USDT"
          );

          logger.info("Referral withdrawal request created:", {
            withdrawalId: withdrawal.id,
            userId,
            parsedAmount,
            evmAddress,
          });

          // Send WhatsApp confirmation async — don't block flow response
          const shortAddress = `${evmAddress.substring(0, 6)}...${evmAddress.slice(-4)}`;
          const dateStr = withdrawal.requestedAt.toISOString().split("T")[0];
          whatsappBusinessService.sendNormalMessage(
            [
              "Withdrawal Request Submitted",
              "",
              `Amount: ${parsedAmount.toFixed(2)} ${token || "USDT"}`,
              `Chain: ${chain || "Base"}`,
              `Address: ${shortAddress}`,
              `Status: Pending Review`,
              `Requested: ${dateStr}`,
              "",
              "You'll be notified once the funds are sent.",
              "Type *referral history* to check status anytime.",
            ].join("\n"),
            phone
          );

          return {
            screen: "WITHDRAWAL_CONFIRMATION",
            data: {
              amount: parsedAmount.toFixed(2),
              evmAddress,
              chain: chain || "Base",
              token: token || "USDT",
              currentBalance,
            },
          };
        } catch (error: any) {
          logger.error("Error creating withdrawal request:", {
            userId,
            amount,
            error: error.message,
          });
          return {
            screen: "WITHDRAWAL_DETAILS",
            data: {
              error_message: error.message,
              currentBalance,
              chain,
              token,
            },
          };
        }
      }

      default:
        logger.warn("Unhandled referral withdrawal screen:", { screen });
        return {
          screen,
          data: { error_message: "Unexpected screen. Please restart the flow." },
        };
    }
  }

  logger.error("Unhandled referral withdrawal flow action:", { action, screen });
  throw new Error(`Unhandled action: ${action}`);
}

export const handleReferralWithdrawalFlow = flowMiddleware(referralWithdrawalFlowHandler);
