import { scheduleProcessDeposit } from "../../jobs/jobs";
import { Transaction } from "../../models/Transaction";
import { redisClient } from "../../services/redis";
import { UserService } from "../../services/UserService";
import { WalletService } from "../../services/WalletService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";

export const getTopUpScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;

  const userService = new UserService();
  const walletService = new WalletService();
  const whatsappBusinessService = new WhatsAppBusinessService();
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
    // handle the request based on the current screen
    switch (screen) {
      case "TOPUP_WALLET": {
        //  const userPhone = await redisClient.get(flow_token);
        const userPhone = "+2348110236998";
        if (!userPhone) {
          return {
            screen: "TOPUP_WALLET",
            data: {
              error_message: "Session expired",
            },
          };
        }
        const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

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

        const result = await walletService.deposit(
          phone,
          data.amount,
          data.currency
        );

        const is_usd = data.currency == "USD";

        // "amount": { "type": "string", "__example__": "100.00" },
        // "currency": { "type": "string", "__example__": "USD" },
        // "accountName": { "type": "string", "__example__": "John Doe" },
        // "bankName": { "type": "string", "__example__": "Chase Bank" },
        // "accountNumber": { "type": "string", "__example__": "1234567890" },
        // "routingNO": { "type": "string", "__example__": "021000021" },
        // "transactionId": { "type": "string", "__example__": "TXN_123456789" },

        switch (data.currency) {
          case "USD":
            return {
              screen: "BANK_DETAILS",
              data: {
                amount: Number(data.amount).toLocaleString(),
                currency: data.currency,
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
                currency: data.currency,
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

      case "PIN":
        // { pin: '23456', amount: '12345678', currency: 'USD' }
        // Get user phone number from Redis using flow_token
        // const userPhone = await redisClient.get(flow_token);
        const userPhone = "+2348110236998";
        if (!userPhone) {
          return {
            screen: "PIN",
            data: {
              error_message: "Session expired",
            },
          };
        }
        const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

        const user = await userService.getUser(phone, true);

        if (!user) {
          return {
            screen: "PIN",
            data: {
              error_message:
                "Could not find you in the database. Please try again",
            },
          };
        }

        const isValidPin = await user.comparePin(data.pin);

        if (!isValidPin) {
          return {
            screen: "PIN",
            data: {
              error_message: "Incorrect pin.",
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
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
};
