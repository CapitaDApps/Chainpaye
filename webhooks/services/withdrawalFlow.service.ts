import { User } from "../../models/User";
import { Wallet } from "../../models/Wallet";
import { redisClient } from "../../services/redis";
import { ToronetService } from "../../services/ToronetService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { CONSTANTS } from "../../utils/config";

export async function getWithdrawalFlowScreen(decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) {
  const { screen, data, version, action, flow_token } = decryptedBody;
  const userService = new UserService();
  const whatsappBusinessService = new WhatsAppBusinessService();
  const toronetService = new ToronetService();
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
      screen: "WITHDRAWAL_CURRENCY",
      data: {},
    };
  }

  if (action === "data_exchange") {
    // const userPhone = await redisClient.get(flow_token);
    const userPhone = "+2348110236998";
    if (!userPhone) {
      return {
        screen: "WITHDRAWAL_CURRENCY",
        data: {
          error_message: "Session expired",
        },
      };
    }
    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    switch (screen) {
      case "WITHDRAWAL_CURRENCY": {
        const { currency } = data;
        console.log({ currency });
        switch (currency) {
          case "USD":
            const usdBanks = await toronetService.getBankListUSD();

            return {
              screen: "WITHDRAWAL_DETAILS",
              data: {
                currency,
                banks: usdBanks,
              },
            };
          case "NGN":
            const ngnBanks = await toronetService.getBankListNGN();

            return {
              screen: "WITHDRAWAL_DETAILS",
              data: {
                currency,
                banks: ngnBanks,
              },
            };
          default:
            return {
              screen: "WITHDRAWAL_CURRENCY",
              data: {
                error_message: "Not supported currency choosen",
              },
            };
        }
      }

      case "WITHDRAWAL_DETAILS": {
        const { currency, bankCode, accountNumber, amount } = data;
        console.log({ data });

        console.log({ bankCode });
        const ngnBanks = await toronetService.getBankListNGN();
        const chosenBank = ngnBanks.find((bk) => bk.id == bankCode);
        if (!chosenBank) {
          return {
            screen: "WITHDRAWAL_DETAILS",
            data: {
              error_message: "Selected bank not found",
            },
          };
        }
        const accountName = await toronetService.resolveBankAccountName(
          accountNumber,
          bankCode
        );
        if (!accountName)
          return {
            screen: "WITHDRAWAL_DETAILS",
            data: {
              error_message:
                "Could not verify account name, check acct NO and try again.",
            },
          };
        return {
          screen: "SUMMARY",
          data: {
            currency,
            amount,
            accountNumber,
            resolvedAccountName: accountName,
            resolvedBankName: chosenBank.title,
            bankCode,
          },
        };
      }

      case "PIN": {
        const { bankCode, accountName, accountNumber, amount, pin } = data;
        console.log({ pinData: data });

        const user = await User.findOne({ whatsappNumber: phone }).select(
          "+pin"
        );
        if (!user)
          throw new Error(`User with phone number - [${phone}] not found`);

        const wallet = await Wallet.findOne({ userId: user.userId }).select(
          "+password"
        );

        if (!wallet)
          throw new Error(`Wallet for user with phone - [${phone}] not found`);

        const isValidPin = await user.comparePin(pin);

        if (!isValidPin) {
          return {
            screen: "PIN",
            data: {
              error_message: "Incorrect pin",
            },
          };
        }

        console.log({ bankCode });
        const ngnBanks = await toronetService.getBankListNGN();
        const chosenBank = ngnBanks.find((bk) => bk.id == bankCode);

        if (!chosenBank) {
          return {
            screen: "PIN",
            data: {
              error_message: "Selected bank not found",
            },
          };
        }

        const balanceNGN = await toronetService.getBalanceNGN(wallet.publicKey);

        if (isNaN(Number(amount))) {
          return {
            screen: "PIN",
            data: {
              error_message: "Invalid withdrawal amount specified",
            },
          };
        }

        if (+balanceNGN.balance < +amount) {
          return {
            screen: "PIN",
            data: {
              error_message: "Insufficient balance for withdrawal",
            },
          };
        }

        toronetService
          .withdrawNGN({
            userAddress: wallet.publicKey,
            password: wallet.password,
            bankName: chosenBank.title,
            routingNo: chosenBank.id,
            accountName,
            accoountNo: accountNumber,
            phoneNumber: phone,
            amount,
          })
          .then(async (withdrawalResp) => {
            whatsappBusinessService.sendVideoContent(
              phone,
              CONSTANTS.MONEY_OUT_MEDIA,
              withdrawalResp.message
            );
          })
          .catch((error) => console.log("Error processig withdrawal", error));

        return {
          screen: "PROCESSING",
          data: {},
        };
      }
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
}
