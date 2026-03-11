import { Request, Response } from "express";
import { ReferralFlowService } from "../services/referralFlow.service";
import { flowMiddleware } from "../middlewares";
import { redisClient } from "../../services/redis";
import { UserService } from "../../services/UserService";
import { logger } from "../../utils/logger";

/**
 * Referral Dashboard Flow Controller
 * Handles WhatsApp Flow interactions for referral dashboard
 */
export const referralFlow = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;
    const { screen, data, action, flow_token } = decryptedBody;

    const referralFlowService = new ReferralFlowService();
    const userService = new UserService();

    // Handle health check request
    if (action === "ping") {
      return {
        data: {
          status: "active",
        },
      };
    }

    // Handle error notification
    if (data?.error) {
      logger.warn("Received client error:", data);
      return {
        data: {
          status: "Error",
          acknowledged: true,
        },
      };
    }

    // Get user phone number from Redis using flow_token
    const userPhone = await redisClient.get(flow_token);
    if (!userPhone) {
      logger.error("Flow token not found in Redis:", flow_token);
      throw new Error("Session expired. Please try again.");
    }

    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    // Get user from database
    const user = await userService.getUser(phone);
    if (!user) {
      throw new Error("User not found");
    }

    const userId = user._id.toString();

    // Handle initial request when opening the flow
    if (action === "INIT") {
      try {
        const dashboardData = await referralFlowService.getDashboardData(
          userId
        );

        return {
          screen: "REFERRAL_DASHBOARD",
          data: dashboardData,
        };
      } catch (error) {
        logger.error("Error loading dashboard:", error);
        throw new Error("Failed to load dashboard. Please try again.");
      }
    }

    // Handle data exchange actions
    if (action === "data_exchange") {
      switch (screen) {
        // --------------------------------------------------------
        // REFERRAL_DASHBOARD → Route to selected screen
        // User selects an action from the radio buttons
        // --------------------------------------------------------
        case "REFERRAL_DASHBOARD":
          try {
            const actionChoice = data.action_choice;

            if (actionChoice === "share") {
              // Navigate to share referral screen
              const shareData = await referralFlowService.getShareReferralData(
                userId
              );
              return {
                screen: "SHARE_REFERRAL",
                data: shareData,
              };
            } else if (actionChoice === "withdraw") {
              // Navigate to withdrawal request screen
              const withdrawData =
                await referralFlowService.getWithdrawalRequestData(userId);
              return {
                screen: "WITHDRAWAL_REQUEST",
                data: withdrawData,
              };
            } else if (actionChoice === "history") {
              // Navigate to withdrawal history screen
              const historyData = await referralFlowService.getWithdrawalHistory(
                userId
              );
              return {
                screen: "WITHDRAWAL_HISTORY",
                data: historyData,
              };
            }

            throw new Error("Invalid action selected");
          } catch (error) {
            logger.error("Error handling dashboard action:", error);
            throw error;
          }

        // --------------------------------------------------------
        // WITHDRAWAL_REQUEST → Process withdrawal or close
        // User submits withdrawal amount or closes if ineligible
        // --------------------------------------------------------
        case "WITHDRAWAL_REQUEST":
          try {
            const canWithdraw = data.can_withdraw;

            // If user cannot withdraw, just acknowledge and close
            if (!canWithdraw) {
              return {
                data: {
                  acknowledged: true,
                },
              };
            }

            // Process withdrawal request
            const amount = parseFloat(data.withdrawal_amount);

            if (isNaN(amount) || amount <= 0) {
              // Return to withdrawal request with error
              const withdrawData =
                await referralFlowService.getWithdrawalRequestData(userId);
              withdrawData.has_error = true;
              withdrawData.error_message = "Please enter a valid amount";

              return {
                screen: "WITHDRAWAL_REQUEST",
                data: withdrawData,
              };
            }

            try {
              const confirmationData =
                await referralFlowService.processWithdrawalRequest(
                  userId,
                  amount
                );

              return {
                screen: "WITHDRAWAL_CONFIRMATION",
                data: confirmationData,
              };
            } catch (withdrawalError: any) {
              // Return to withdrawal request with error message
              const withdrawData =
                await referralFlowService.getWithdrawalRequestData(userId);
              withdrawData.has_error = true;
              withdrawData.error_message =
                withdrawalError.message || "Failed to process withdrawal";

              return {
                screen: "WITHDRAWAL_REQUEST",
                data: withdrawData,
              };
            }
          } catch (error) {
            logger.error("Error processing withdrawal:", error);
            throw error;
          }

        default:
          logger.warn("Unhandled screen:", screen);
          return {
            data: {
              acknowledged: true,
            },
          };
      }
    }

    logger.error("Unhandled request body:", decryptedBody);
    throw new Error(
      "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
    );
  }
);
