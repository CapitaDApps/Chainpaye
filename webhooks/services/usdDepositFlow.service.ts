import { v4 as uuidv4 } from "uuid";
import { scheduleProcessDeposit } from "../../jobs/topUp/job";
import { userService, whatsappBusinessService, walletService } from "../../services";
import { redisClient } from "../../services/redis";

export const getUsdDepositScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;

  // handle health check request
  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  // handle error notification
  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      data: {
        status: "Error",
        acknowledged: true,
      },
    };
  }

  // handle initial request when opening the flow
  if (action === "INIT") {
    return {
      screen: "TOPUP_WALLET",
      data: {},
    };
  }

  if (action === "data_exchange") {
    const userPhone = await redisClient.get(flow_token);
    const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;

    // handle the request based on the current screen
    switch (screen) {
      case "TOPUP_WALLET": {
        if (!userPhone) {
          return {
            screen: "TOPUP_WALLET",
            data: {
              error_message: "Session expired. Restart flow with a new message",
            },
          };
        }

        const user = await userService.getUser(phone, true);

        if (isNaN(Number(data.amount))) {
          return {
            screen: "TOPUP_WALLET",
            data: {
              error_message: "Please enter a valid amount",
            },
          };
        }

        if (!user) {
          return {
            screen: "TOPUP_WALLET",
            data: {
              error_message:
                "Could not find you in the database. Please try again",
            },
          };
        }

        // Generate transaction using walletService.deposit
        const result = await walletService.deposit(
          phone,
          data.amount,
          "USD",
        );

        // Store USD deposit data in Redis
        await redisClient.set(
          `USD_DEPOSIT_${result.transactionId}`,
          JSON.stringify({
            amount: Number(data.amount),
            currency: "USD",
            userPhone: userPhone,
            status: "pending",
            createdAt: new Date().toISOString(),
            refId: result.refId,
            toronetTransactionId: result.transactionId,
          }),
          "EX",
          86400 * 7, // 7 days expiry
        );

        // Send Chase Bank details and transaction ID via WhatsApp messages
        const bankDetailsMessage = `💰 *USD Deposit Details*

*Bank Name:* Chase Bank
*Account Name:* Connect Word Ink INC
*Account Number:* 839128227
*Routing Number:* 021000021
*Bank Address:* Chase Bank, N.A., 270 Park Avenue, New York, NY 10017

*Amount to Transfer:* $${Number(data.amount).toFixed(2)} USD`;

        const transactionIdMessage = `*Transaction ID:* ${result.transactionId}

⚠️ *Important:* Make sure to copy the Transaction ID above and paste it in the description/memo field when making your transfer. This helps us process your funds faster!`;

        // Send messages asynchronously
        whatsappBusinessService
          .sendNormalMessage(bankDetailsMessage, userPhone)
          .then(() => {
            return whatsappBusinessService.sendNormalMessage(transactionIdMessage, userPhone);
          })
          .then(() => {
            // Send the second flow after messages
            return whatsappBusinessService.sendBankDetailsFlowById(userPhone, {
              amount: Number(data.amount).toFixed(2),
              transactionId: result.transactionId,
            });
          })
          .catch((error) => {
            console.log("Error sending USD deposit messages or flow", error);
          });

        return {
          screen: "RETURN_TO_CHAT",
          data: {},
        };
      }

      default:
        break;
    }
  }

  console.error("Unhandled USD deposit request body:", decryptedBody);
  throw new Error(
    "Unhandled USD deposit endpoint request. Make sure you handle the request action & screen logged above.",
  );
};

export const getBankDetailsScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;

  // handle health check request
  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  // handle error notification
  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      data: {
        status: "Error",
        acknowledged: true,
      },
    };
  }

  // handle initial request when opening the flow
  if (action === "INIT") {
    // Get flow data from Redis
    const userPhone = await redisClient.get(flow_token);
    const flowData = await redisClient.get(`BANK_DETAILS_FLOW_${userPhone}`);
    
    if (!flowData) {
      return {
        screen: "BANK_DETAILS",
        data: {
          error_message: "Session expired. Please restart the USD deposit process.",
        },
      };
    }

    const parsedData = JSON.parse(flowData);
    return {
      screen: "BANK_DETAILS",
      data: {
        amount: parsedData.amount,
        transactionId: parsedData.transactionId,
      },
    };
  }

  if (action === "data_exchange") {
    const userPhone = await redisClient.get(flow_token);
    const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;

    // handle the request based on the current screen
    switch (screen) {
      case "BANK_DETAILS": {
        if (!userPhone) {
          return {
            screen: "BANK_DETAILS",
            data: {
              error_message: "Session expired. Please restart the USD deposit process.",
            },
          };
        }

        // Get the transaction ID from the payload
        const transactionId = data.transactionId;
        
        if (!transactionId) {
          return {
            screen: "BANK_DETAILS",
            data: {
              error_message: "Transaction ID not found. Please restart the process.",
            },
          };
        }

        // Update USD deposit record to mark as submitted
        const depositRecord = await redisClient.get(`USD_DEPOSIT_${transactionId}`);
        if (depositRecord) {
          const parsedRecord = JSON.parse(depositRecord);
          parsedRecord.status = "submitted";
          parsedRecord.submittedAt = new Date().toISOString();

          await redisClient.set(
            `USD_DEPOSIT_${transactionId}`,
            JSON.stringify(parsedRecord),
            "EX",
            86400 * 7, // 7 days expiry
          );

          // Trigger the deposit processing job
          // This ensures the deposit gets processed when the user confirms
          scheduleProcessDeposit(transactionId);
        }

        // Send confirmation message
        const confirmationMessage = `✅ *USD Deposit Submitted*

*Transaction ID:* ${transactionId}

Your USD deposit has been submitted for processing. You will receive a notification once it's confirmed and credited to your account.

Processing typically takes 1-2 business days.`;

        whatsappBusinessService
          .sendNormalMessage(confirmationMessage, userPhone)
          .catch((error) => {
            console.log("Error sending USD deposit confirmation", error);
          });

        // Clean up flow data
        await redisClient.del(`BANK_DETAILS_FLOW_${userPhone}`);

        return {
          screen: "PROCESSING",
          data: {},
        };
      }

      default:
        break;
    }
  }

  console.error("Unhandled bank details request body:", decryptedBody);
  throw new Error(
    "Unhandled bank details endpoint request. Make sure you handle the request action & screen logged above.",
  );
};