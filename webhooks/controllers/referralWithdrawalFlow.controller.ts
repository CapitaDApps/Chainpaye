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
import { whatsappBusinessService } from "../../services";
import { logger } from "../../utils/logger";
import { flowMiddleware } from "../middlewares";
import { redisClient } from "../../services/redis";

async function referralWithdrawalFlowHandler(req: Request, res: Response) {
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

  // INIT — flow is opening, return initial screen data (already populated by WhatsAppBusinessService)
  if (action === "INIT") {
    return {
      screen: "WITHDRAWAL_DETAILS",
      data: {},
    };
  }

  if (action === "data_exchange") {
    // Resolve user phone from flow_token stored in Redis
    const userPhone = await redisClient.get(flow_token);
    if (!userPhone) {
      return {
        screen: "WITHDRAWAL_DETAILS",
        data: { error_message: "Session expired. Please restart the flow." },
      };
    }
    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    switch (screen) {
      case "WITHDRAWAL_DETAILS": {
        const { amount, evmAddress, chain, token, currentBalance } = data;

        // Validate amount
        const parsedAmount = parseFloat(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount < 20) {
          return {
            screen: "WITHDRAWAL_DETAILS",
            data: {
              error_message: `Minimum withdrawal is $20. You entered: ${amount ?? "nothing"}`,
              currentBalance,
              evmAddress,
              chain,
              token,
            },
          };
        }

        // Validate EVM address
        if (!evmAddress) {
          return {
            screen: "WITHDRAWAL_DETAILS",
            data: {
              error_message: "No wallet address found. Please contact support.",
              currentBalance,
              chain,
              token,
            },
          };
        }

        try {
          const pointsRepository = new PointsRepository();
          const withdrawalService = new WithdrawalService(pointsRepository);
          const withdrawal = await withdrawalService.requestWithdrawal(
            phone,
            parsedAmount,
            evmAddress,
            chain || "base",
            token || "USDT"
          );

          logger.info("Referral withdrawal request created:", {
            withdrawalId: withdrawal.id,
            phone,
            parsedAmount,
            evmAddress,
          });

          // Send WhatsApp confirmation message async (don't block flow response)
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

          // Advance to confirmation screen
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
            phone,
            amount,
            error: error.message,
          });
          return {
            screen: "WITHDRAWAL_DETAILS",
            data: {
              error_message: error.message,
              currentBalance,
              evmAddress,
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
