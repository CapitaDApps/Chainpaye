import { scheduleProcessDeposit } from "../../jobs/topUp/job";
import { userService, walletService } from "../../services";
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
