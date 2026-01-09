import { Types } from "mongoose";
import { User } from "../../models/User";
import { Wallet } from "../../models/Wallet";
import { redisClient } from "../../services/redis";
import { ToronetService } from "../../services/ToronetService";
import { TransactionService } from "../../services/TransactionService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { TransactionStatus } from "../../models/Transaction";
import { nanoid } from "nanoid";
import { sendTransactionReceipt } from "../../utils/sendReceipt";

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
    const userPhone = await redisClient.get(flow_token);
    //const userPhone = "+2347064229575";
    if (!userPhone) {
      return {
        screen,
        data: {
          error_message: "Session expired. Restart flow a new message",
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
                acct_name_visible: true,
              },
            };
          case "NGN":
            const ngnBanks = await toronetService.getBankListNGN();

            return {
              screen: "WITHDRAWAL_DETAILS",
              data: {
                currency,
                banks: ngnBanks,
                acct_name_visible: false,
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
        switch (currency) {
          case "USD":
            const usdBanks = await toronetService.getBankListUSD();
            const chosenBank = usdBanks.find((bk) => bk.id == bankCode);
            if (!chosenBank) {
              return {
                screen: "WITHDRAWAL_DETAILS",
                data: {
                  error_message: "Selected bank not found",
                },
              };
            }
            if (!data.accountName) {
              return {
                screen: "WITHDRAWAL_DETAILS",
                data: {
                  error_message: "Account name is required",
                },
              };
            }
            const accountName = data.accountName;

            const toronetCharge = Number(amount) * 0.005; // 0.5%
            const chainpayeCharge = Number(amount) * 0.015; // 1.5%
            const totalAmount =
              Number(amount) + toronetCharge + chainpayeCharge;

            return {
              screen: "SUMMARY",
              data: {
                currency,
                amount,
                accountNumber,
                resolvedAccountName: accountName,
                resolvedBankName: chosenBank.title,
                bankCode,
                totalAmount: totalAmount.toFixed(2),
              },
            };

          case "NGN": {
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
            const accountName = await toronetService.resolveBankAccountNameNGN(
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

            const cbnCharge = Number(amount) >= 10000 ? 50 + 10 : 10;
            const toronetCharge = Number(amount) * 0.005; // 0.5%
            const chainpayeCharge = Number(amount) * 0.015; // 1.5%
            const totalAmount =
              Number(amount) + cbnCharge + toronetCharge + chainpayeCharge;

            return {
              screen: "SUMMARY",
              data: {
                currency,
                amount,
                accountNumber,
                resolvedAccountName: accountName,
                resolvedBankName: chosenBank.title,
                bankCode,
                totalAmount: totalAmount.toFixed(2),
              },
            };
          }

          default:
            break;
        }
      }

      case "PIN": {
        const {
          bankCode,
          accountName,
          accountNumber,
          amount,
          pin,
          totalAmount,
          currency,
        } = data;
        console.log({ pinData: data });

        const { user, wallet } = await userService.getUserToroWallet(
          phone,
          true,
          true
        );

        const isValidPin = await user.comparePin(pin);

        if (!isValidPin) {
          return {
            screen: "PIN",
            data: {
              error_message: "Incorrect pin",
            },
          };
        }

        if (isNaN(Number(amount))) {
          return {
            screen: "PIN",
            data: {
              error_message: "Invalid withdrawal amount specified",
            },
          };
        }
        switch (currency) {
          case "USD": {
            console.log({ bankCode });
            const usdBanks = await toronetService.getBankListUSD();
            const chosenBank = usdBanks.find((bk) => bk.id == bankCode);

            if (!chosenBank) {
              return {
                screen: "PIN",
                data: {
                  error_message: "Selected bank not found",
                },
              };
            }

            const balanceUSD = await toronetService.getBalanceUSD(
              wallet.publicKey
            );

            if (+balanceUSD.balance < +amount) {
              return {
                screen: "PIN",
                data: {
                  error_message: "Insufficient balance for withdrawal",
                },
              };
            }

            if (balanceUSD.balance < +totalAmount) {
              return {
                screen: "PIN",
                data: {
                  error_message: `Balance available is not enought to cover withdrwal amount plus fees.`,
                },
              };
            }
            const chainpayeCharge = Number(amount) * 0.015; // 1.5%
            const withdrawalNanoId = nanoid();

            toronetService
              .withdraw({
                userAddress: wallet.publicKey,
                password: wallet.password,
                bankName: chosenBank.title,
                routingNo: chosenBank.id,
                accountName,
                accoountNo: accountNumber,
                phoneNumber: phone,
                amount,
                currency,
                fullName: `${user.firstName} ${user.lastName}`,
              })
              .then(async (withdrawalResp) => {
                if (withdrawalResp.success) {
                  toronetService
                    .transferUSD(
                      wallet.publicKey,
                      "0xbdb182ac6b38fd8f4581ab21d29a50287d47a93c",
                      chainpayeCharge.toString(),
                      wallet.password
                    )
                    .catch((err) => console.log("Error sending fees", err));
                  const tx = await TransactionService.recordWithdrawal({
                    fromUser: user._id as Types.ObjectId,
                    amount,
                    status: TransactionStatus.COMPLETED,
                    refId: withdrawalResp.data?.paymentReference!,
                    toronetTxId: withdrawalResp.data?.paymentReference!,
                    currency: "USD",
                    bankDetails: {
                      accountName,
                      bankName: chosenBank.title,
                      accountNumber,
                      routingNumber: chosenBank.id,
                    },
                  });

                  // Send receipt asynchronously
                  await sendTransactionReceipt(
                    (tx._id as Types.ObjectId).toString(),
                    phone
                  );
                } else {
                  const tx = await TransactionService.recordWithdrawal({
                    fromUser: user._id as Types.ObjectId,
                    amount,
                    status: TransactionStatus.FAILED,
                    refId: withdrawalNanoId,
                    toronetTxId: "",
                    currency: "USD",
                    failureReason: withdrawalResp.message,
                    bankDetails: {
                      accountName,
                      bankName: chosenBank.title,
                      accountNumber,
                      routingNumber: chosenBank.id,
                    },
                  });
                  whatsappBusinessService.sendNormalMessage(
                    withdrawalResp.message,
                    phone
                  );

                  // Send receipt asynchronously for failed withdrawal
                  await sendTransactionReceipt(
                    (tx._id as Types.ObjectId).toString(),
                    phone
                  );
                }
              })
              .catch((error) =>
                console.log("Error processing withdrawal", error)
              );

            return {
              screen: "PROCESSING",
              data: {},
            };
          }

          case "NGN": {
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

            const balanceNGN = await toronetService.getBalanceNGN(
              wallet.publicKey
            );

            if (+balanceNGN.balance < +amount) {
              return {
                screen: "PIN",
                data: {
                  error_message: "Insufficient balance for withdrawal",
                },
              };
            }

            if (balanceNGN.balance < +totalAmount) {
              return {
                screen: "PIN",
                data: {
                  error_message: `Balance available is not enought to cover withdrwal amount plus fees.`,
                },
              };
            }
            const chainpayeCharge = Number(amount) * 0.015; // 1.5%
            const withdrawalNanoId = nanoid();

            toronetService
              .withdraw({
                userAddress: wallet.publicKey,
                password: wallet.password,
                bankName: chosenBank.title,
                routingNo: chosenBank.id,
                accountName,
                accoountNo: accountNumber,
                phoneNumber: phone,
                amount,
                currency,
                fullName: `${user.firstName} ${user.lastName}`,
              })
              .then(async (withdrawalResp) => {
                if (withdrawalResp.success) {
                  toronetService
                    .transferNGN(
                      wallet.publicKey,
                      "0xbdb182ac6b38fd8f4581ab21d29a50287d47a93c",
                      chainpayeCharge.toString(),
                      wallet.password
                    )
                    .catch((err) => console.log("Error sending fees", err));
                  const tx = await TransactionService.recordWithdrawal({
                    fromUser: user._id as Types.ObjectId,
                    amount,
                    status: TransactionStatus.COMPLETED,
                    refId: withdrawalResp.data?.paymentReference!,
                    toronetTxId: withdrawalResp.data?.paymentReference!,
                    currency: "NGN",
                    bankDetails: {
                      accountName,
                      bankName: chosenBank.title,
                      accountNumber,
                      routingNumber: chosenBank.id,
                    },
                  });
                  // whatsappBusinessService.sendVideoContent(
                  //   phone,
                  //   CONSTANTS.MONEY_OUT_MEDIA,
                  //   withdrawalResp.message
                  // );

                  // Send receipt asynchronously
                  await sendTransactionReceipt(
                    (tx._id as Types.ObjectId).toString(),
                    phone
                  );
                } else {
                  const tx = await TransactionService.recordWithdrawal({
                    fromUser: user._id as Types.ObjectId,
                    amount,
                    status: TransactionStatus.FAILED,
                    refId: withdrawalNanoId,
                    toronetTxId: "",
                    currency: "NGN",
                    failureReason: withdrawalResp.message,
                    bankDetails: {
                      accountName,
                      bankName: chosenBank.title,
                      accountNumber,
                      routingNumber: chosenBank.id,
                    },
                  });
                  whatsappBusinessService.sendNormalMessage(
                    withdrawalResp.message,
                    phone
                  );

                  // Send receipt asynchronously for failed withdrawal
                  await sendTransactionReceipt(
                    (tx._id as Types.ObjectId).toString(),
                    phone
                  );
                }
              })
              .catch((error) =>
                console.log("Error processing withdrawal", error)
              );

            return {
              screen: "PROCESSING",
              data: {},
            };
          }

          default:
            throw new Error(`Invalid currency - ${currency}`);
        }
      }
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
}
