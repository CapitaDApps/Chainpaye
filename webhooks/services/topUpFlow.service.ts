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
      case "PIN":
        // { pin: '23456', amount: '12345678', currency: 'USD' }
        // Get user phone number from Redis using flow_token
        const userPhone = await redisClient.get(flow_token);
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

        if (isNaN(Number(data.amount)))
          return {
            screen: "PIN",
            data: {
              error_message: "Please enter a valid amount",
            },
          };

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

        walletService
          .deposit(phone, data.amount, data.currency)
          .then(async (result) => {
            if (data.currency == "USD") {
              await whatsappBusinessService.sendNormalMessage(
                `*Make deposit to the specified account.*

*Amount:* ${data.amount}
*Account Name:* ${result.accountName}
*Bank Name:* ${result.bankName}
*Account Number:* ${result.accountNumber}
*Routing Number:* ${result.routingNO}

*Transaction Id:* ${result.transactionId}


*You can check the status of the transaction by sending this message:*

_/status <transactionId>_
          `,
                phone
              );
              await whatsappBusinessService.sendNormalMessage(
                data.transactionId,
                phone
              );
            } else {
              await whatsappBusinessService.sendNormalMessage(
                `*Make deposit to the specified account details.*

amount: *${result.amount}*
account name: *${result.accountName}*
bank name: *${result.bankName}*
account number: *${result.accountNumber}* 

transactionId: *${result.transactionId}*


*You can check the status of the transaction by sending this message:*

_/status <transactionId>_
        `,
                phone
              );
              await whatsappBusinessService.sendNormalMessage(
                result.transactionId,
                phone
              );
            }
          })
          .catch((error) => console.log("Error topping up", error));

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
