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
        const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;
        const user = await userService.getUser(phone);

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
        console.log({ pin: data.pin });
        const isValidPin = await user.comparePin(data.pin);

        console.log({ isValidPin });

        if (!isValidPin) {
          return {
            screen: "PIN",
            data: {
              error_message: "Incorrect pin.",
            },
          };
        }

        const result = await walletService.deposit(
          phone,
          data.amount,
          data.currency
        );

        if (data.currency == "USD") {
          const depositAmount: string = data.amount;

          await whatsappBusinessService.sendNormalMessage(
            `*Make deposit to the specified account.*

*Amount:* ${result.amount}
*Account Name:* ${result.accountName}
*Bank Name:* ${result.bankName}
*Account Number:* ${result.accountNumber}
*Routing Number:* ${result.routingNO}

*Transaction Id:* ${result.transactionId}


**You can check the status of the transaction by sending this message: /status <TransactionId>**
          `,
            phone
          );
          await whatsappBusinessService.sendNormalMessage(
            data.transactionId,
            phone
          );
        } else if (data.currency == "NGN") {
          const depositAmountNGN = data.amount;

          await whatsappBusinessService.sendNormalMessage(
            `*Make deposit to the specified account details.*

amount: *${result.amount}*
account name: *${result.accountName}*
bank name: *${result.bankName}*
account number: *${result.accountNumber}* 

transactionId: *${result.transactionId}*


**You can check the status of the transaction by sending this message: status: transactionId**
        `,
            phone
          );
          await whatsappBusinessService.sendNormalMessage(
            result.transactionId,
            phone
          );
        }

        return {
          screen: "COMPLETE",
          data: {
            transactionId: result.transactionId,
          },
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
