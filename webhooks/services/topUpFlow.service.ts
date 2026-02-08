import { scheduleProcessDeposit } from "../../jobs/topUp/job";
import { userService, walletService, whatsappBusinessService } from "../../services";
import { redisClient } from "../../services/redis";

export const getTopUpScreen = async (decryptedBody: {
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
      data: {
        currencies: [
          { id: "1", title: "USD" },
          { id: "2", title: "NGN" },
        ],
      },
    };
  }

  if (action === "data_exchange") {
    // const userPhone = "+2348110236998"; // --- TEMPORARY HARDCODE FOR TESTING ---
    const userPhone = await redisClient.get(flow_token);
    const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;
    // handle the request based on the current screen
    switch (screen) {
      case "TOPUP_WALLET": {
        if (!userPhone) {
          return {
            screen: "TOPUP_WALLET",
            data: {
              error_message: "Session expired. Restart flow a new message",
            },
          };
        }

        const user = await userService.getUser(phone, true);

        if (isNaN(Number(data.amount)))
          return {
            screen: "TOPUP_WALLET",
            data: {
              error_message: "Please enter a valid amount",
            },
          };

        if (!user) {
          return {
            screen: "TOPUP_WALLET",
            data: {
              error_message:
                "Could not find you in the database. Please try again",
            },
          };
        }

        // Normalize currency to uppercase to match Transaction model enum
        const currency = data.currency?.toUpperCase();

        const result = await walletService.deposit(
          phone,
          data.amount,
          currency,
        );

        const is_usd = currency === "USD";

        switch (currency) {
          case "USD":
            await redisClient.set(
              `TOPUP_SUMMARY_${result.transactionId}`,
              JSON.stringify({
                amount: Number(data.amount).toLocaleString(),
                currency,
                accountName: result.accountName,
                bankName: result.bankName,
                accountNumber: `${result.accountNumber}`,
                routingNO: `${result.routingNO}`,
                is_usd,
              }),
              "EX",
              86400,
            );

            whatsappBusinessService
              .sendNormalMessage(
                `Transaction ID: *${result.transactionId}*\n\nCopy this Transaction ID and share it with the payer.\nUse it as the payment description for the USD transfer.\n\nThen tap *Complete Deposit* in the flow to proceed.`,
                userPhone,
              )
              .catch((error) =>
                console.log("Error sending topup transaction-id instruction", error),
              );

            return {
              screen: "BANK_DETAILS",
              data: {
                amount: Number(data.amount).toLocaleString(),
                currency: currency,
                accountName: result.accountName,
                bankName: result.bankName,
                accountNumber: `${result.accountNumber}`,
                routingNO: `${result.routingNO}`,
                is_usd,
                transactionId: result.transactionId,
              },
            };
          case "NGN":
            await redisClient.set(
              `TOPUP_SUMMARY_${result.transactionId}`,
              JSON.stringify({
                amount: Number(result.amount).toLocaleString(),
                currency,
                accountName: result.accountName,
                bankName: result.bankName,
                accountNumber: `${result.accountNumber}`,
                routingNO: "",
                is_usd,
              }),
              "EX",
              86400,
            );

            whatsappBusinessService
              .sendNormalMessage(
                `Transaction ID: *${result.transactionId}*\n\nCopy this Transaction ID and share it with the payer.\nUse it as the payment description for the transfer.\n\nThen tap *Complete Deposit* in the flow to proceed.`,
                userPhone,
              )
              .catch((error) =>
                console.log("Error sending topup transaction-id instruction", error),
              );

            return {
              screen: "BANK_DETAILS",
              data: {
                amount: Number(result.amount).toLocaleString(),
                currency: currency,
                accountName: result.accountName,
                bankName: result.bankName,
                accountNumber: `${result.accountNumber}`,
                transactionId: result.transactionId,
                is_usd,
                routingNO: "",
              },
            };

          default:
            break;
        }
      }

      case "BANK_DETAILS":
        if (!userPhone) {
          return {
            screen: "BANK_DETAILS",
            data: {
              error_message: "Session expired. Restart flow a new message",
            },
          };
        }

        const summaryCache = await redisClient.get(`TOPUP_SUMMARY_${data.transactionId}`);
        if (summaryCache) {
          try {
            const summary = JSON.parse(summaryCache);
            const summaryMessage = [
              "*Deposit Transaction Summary*",
              "",
              `Transaction ID: *${data.transactionId}*`,
              `Amount: *${summary.amount} ${summary.currency}*`,
              `Bank Name: *${summary.bankName}*`,
              `Account Name: *${summary.accountName}*`,
              `Account Number: *${summary.accountNumber}*`,
              ...(summary.is_usd
                ? [`Routing Number: *${summary.routingNO}*`]
                : []),
            ].join("\n");

            whatsappBusinessService
              .sendNormalMessage(summaryMessage, userPhone)
              .catch((error) =>
                console.log("Error sending topup summary message", error),
              );
          } catch (error) {
            console.log("Error parsing topup summary cache", error);
          }
        }

        scheduleProcessDeposit(data.transactionId);
        return {
          screen: "PROCESSING",
          data: {},
        };

      default:
        break;
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
  );
};
