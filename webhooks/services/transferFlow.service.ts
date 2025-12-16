import { redisClient } from "../../services/redis";
import { WalletService } from "../../services/WalletService";
import { User } from "../../models/User";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { CONSTANTS } from "../../utils/config";

export const getTransferScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;
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

  try {
    // Get user phone number from Redis using flow_token
    const userPhone = await redisClient.get(flow_token);
    // const userPhone = `+2348110236998`;

    // handle initial request when opening the flow
    if (action === "INIT") {
      return {
        screen: "TRANSFER",
        data: {
          currency: [
            { id: "1", title: "USD" },
            { id: "2", title: "NGN" },
          ],
        },
      };
    }

    if (action === "data_exchange") {
      // handle the request based on the current screen
      switch (screen) {
        case "TRANSFER": {
          const { accountNumber, amount, currency } = data;
          if (!userPhone) {
            return {
              screen: "TRANSFER",
              data: {
                error_message:
                  "User flow session not found. Please restart flow",
              },
            };
          }

          const user = await User.findOne({
            whatsappNumber: `+${accountNumber}`,
          });

          if (!user) {
            return {
              screen: "TRANSFER",
              data: {
                error_message: `Could not find user with account number - ${accountNumber}. Please check the account number.`,
              },
            };
          }

          return {
            screen: "TRANSFER_CONFIRMATION",
            data: {
              accountNumber,
              currency,
              amount,
              recipientName: `${user.fullName}`,
            },
          };
        }

        case "PIN": {
          const { accountNumber, amount, currency, recipientName, pin } = data;
          if (!pin) {
            return {
              screen: "PIN",
              data: {
                error_message: "Please enter your PIN",
              },
            };
          }

          // Verify user PIN
          const phone = userPhone?.startsWith("+")
            ? userPhone
            : `+${userPhone}`;

          const user = await User.findOne({ whatsappNumber: phone }).select(
            "+pin"
          );

          if (!user?.pin) {
            return {
              screen: "PIN",
              data: {
                error_message: "You have to set a pin to proceed",
              },
            };
          }
          const pinValid = await user.comparePin(pin);
          if (!user || !pinValid) {
            return {
              screen: "PIN",
              data: {
                error_message: "Invalid PIN. Please try again.",
              },
            };
          }

          const acctNo = accountNumber.startsWith("+")
            ? accountNumber
            : `+${accountNumber}`;

          walletService
            .transfer(phone, acctNo, amount, currency)
            .then(async (transferResult) => {
              if (transferResult) {
                if (transferResult.success) {
                  // money out for sender
                  whatsappBusinessService.sendVideoContent(
                    userPhone!,
                    CONSTANTS.MONEY_OUT_MEDIA,
                    transferResult.message
                  );

                  // money in for receiver
                  whatsappBusinessService.sendVideoContent(
                    accountNumber,
                    CONSTANTS.MONEY_IN_MEDIA,
                    transferResult.messageTo!
                  );
                } else {
                  whatsappBusinessService.sendNormalMessage(
                    transferResult?.message,
                    userPhone!
                  );
                }
              } else {
                await whatsappBusinessService.sendNormalMessage(
                  `An error occurred processing transfer`,
                  userPhone!
                );
              }
            })
            .catch((error) => console.log("Error transferring", error));

          return {
            screen: "PROCESSING",
            data: {},
          };

          // if (transferResult?.success) {
          //   return {
          //     screen: "SUCCESS",
          //     data: {
          //       message: transferResult.message,
          //     },
          //   };
          // } else {
          //   return {
          //     screen: "PIN",
          //     data: {
          //       error_message:
          //         transferResult?.message ||
          //         "Transfer failed. Please try again.",
          //     },
          //   };
          // }
          // return {
          //   screen: "SUCCESS",
          //   data: {
          //     extension_message_response: {
          //       params: {
          //         flow_token: flow_token,
          //         optional_param1: amount,
          //         optional_param2: accountNumber,
          //       },
          //     },
          //   },
          // };
        }

        default:
          break;
      }
    }
    console.error("Unhandled request body:", decryptedBody);
    throw new Error(
      "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
    );
  } catch (error) {
    console.error("An error occurred", error);
    throw new Error((error as { message: string }).message);
  }
};
