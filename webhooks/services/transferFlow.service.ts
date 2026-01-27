import { User } from "../../models/User";
import { Wallet } from "../../models/Wallet";
import {
  toronetService,
  userService,
  walletService,
  whatsappBusinessService,
} from "../../services";
import { redisClient } from "../../services/redis";

export const getTransferScreen = async (decryptedBody: {
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

  try {
    // Get user phone number from Redis using flow_token
    const userPhone = await redisClient.get(flow_token);
    //   const userPhone = "+2348110236998"; // --- TEMPORARY HARDCODE FOR TESTING ---
    // Verify user PIN
    const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;

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
                error_message: "Session expired. Restart flow a new message",
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

          if (user.whatsappNumber === phone) {
            return {
              screen: "TRANSFER",
              data: {
                error_message: `You can not send to yourself`,
              },
            };
          }

          return {
            screen: "TRANSFER_CONFIRMATION",
            data: {
              accountNumber,
              currency,
              amount,
              recipientName: `${user.firstName} ${user.lastName}`,
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

          const { user, wallet } = await userService.getUserToroWallet(
            phone,
            true,
            true
          );

          const walletPassword = wallet.password;
          console.log({ walletPassword }); // --- IGNORE ---
          const passList = walletPassword.split(":");
          const version = passList[0];
          let versionNumber = 1;
          if (version && passList.length > 1) {
            versionNumber = Number(version.split("")[1]!);
            if (isNaN(versionNumber)) {
              versionNumber = 1;
            }
          }
          console.log({ versionNumber }); // --- IGNORE ---
          if (versionNumber < toronetService.currentVersion) {
            const decryptedPassword =
              toronetService.decryptPassword(walletPassword);

            // re encrypt password with latest version
            const reEncryptedPassword =
              toronetService.encryptPassword(decryptedPassword);
            console.log({ reEncryptedPassword }); // --- IGNORE ---
            Wallet.updateOne(
              { _id: wallet._id },
              { password: reEncryptedPassword }
            ).catch((err) => {
              console.error("Error updating wallet password version", err);
            });
          }

          if (!user?.pin) {
            return {
              screen: "PIN",
              data: {
                error_message: "You have to set a pin to proceed",
              },
            };
          }
          const pinValid = await user.comparePin(pin);
          console.log("PIN validation result", { pinValid });
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
              if (!transferResult) {
                await whatsappBusinessService.sendNormalMessage(
                  `Transfer failed: ${errorMessage}`,
                  userPhone!,
                );
              }
            })
            .catch(async (error) => {
              console.error("Error transferring", error);
              await whatsappBusinessService.sendNormalMessage(
                `An error occurred processing transfer. Please try again later.`,
                userPhone!,
              );
            });

          return {
            screen: "PROCESSING",
            data: {},
          };
        }

        default:
          break;
      }
    }
    console.error("Unhandled request body:", decryptedBody);
    throw new Error(
      "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
    );
  } catch (error) {
    console.error("An error occurred", error);
    throw new Error((error as { message: string }).message);
  }
};
