import { Types } from "mongoose";
import { redisClient } from "../../services/redis";
import { ToronetService } from "../../services/ToronetService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";

export async function getConversionFlowScreen(decryptedBody: {
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

  //const userPhone = await redisClient.get(flow_token);
  const userPhone = "+2348110236998";

  const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;
  const quoteId = `QUOTE_${phone}`;
  // handle initial request when opening the flow

  if (action === "INIT") {
    return {
      screen: "CONVERT_ENTRY",
      data: {},
    };
  }

  if (action === "data_exchange") {
    switch (screen) {
      case "CONVERT_ENTRY": {
        if (!userPhone) {
          return {
            screen: "CONVERT_ENTRY",
            data: {
              error_message: "Session expired. Restart flow a new message",
            },
          };
        }

        const toronetWallet = await userService.getUserToroWallet(phone);

        const [usdBalanceResult, ngnBalanceResult] = await Promise.all([
          toronetService.getBalanceUSD(toronetWallet.publicKey),
          toronetService.getBalanceNGN(toronetWallet.publicKey),
        ]);

        const usdBalance = usdBalanceResult.balance;
        const ngnBalance = ngnBalanceResult.balance;

        const { fromCurrency, toCurrency, amount } = data;

        console.log({ data, usdBalance, ngnBalance });

        if (fromCurrency == "USD" && amount > usdBalance) {
          return {
            screen: "CONVERT_ENTRY",
            data: {
              error_message: "Insufficient balance for conversion",
            },
          };
        }

        if (fromCurrency == "NGN" && amount > ngnBalance) {
          return {
            screen: "CONVERT_ENTRY",
            data: {
              error_message: "Insufficient balance for conversion",
            },
          };
        }

        if (fromCurrency === toCurrency) {
          return {
            screen: "CONVERT_ENTRY",
            data: {
              error_message: "From curreny cannot be equal to To currency",
            },
          };
        }

        const [nairaExchangeRate, simulationResult] = await Promise.all([
          toronetService.getNairaToDollarExchangeRate(),
          toronetService.simulateConversion({
            from: fromCurrency,
            to: toCurrency,
            amount,
            address: toronetWallet.publicKey,
          }),
        ]).catch((err) => {
          redisClient.del(quoteId);
          throw err;
        });

        return {
          screen: "CONVERT_QUOTE",
          data: {
            fromCurrency,
            toCurrency,
            amountToPay: amount,
            exchangeRate: nairaExchangeRate.toFixed(2),
            amountToReceive: parseFloat(
              parseFloat(simulationResult.toAmount).toFixed(2)
            ).toLocaleString(),
          },
        };
      }

      case "PIN": {
        const { fromCurrency, amountToReceive, amountToPay, toCurrency, pin } =
          data;

        const [user, userToroWallet] = await Promise.all([
          userService.getUser(phone, true),
          userService.getUserToroWallet(phone, true),
        ]);

        if (!user)
          throw new Error(
            `user with phone number - [${phone}] does not exists`
          );
        const validPin = await user.comparePin(pin);

        if (!validPin) {
          return {
            screen: "PIN",
            data: {
              error_message: "Invalid pin",
            },
          };
        }

        toronetService
          .convertToAndFro({
            from: fromCurrency,
            to: toCurrency,
            amount: amountToPay,
            password: userToroWallet.password,
            address: userToroWallet.publicKey,
            user: user._id as Types.ObjectId,
          })
          .then((result) => {
            if (result.success) {
              redisClient.del(quoteId);
              whatsappBusinessService.sendNormalMessage(
                `Conversion of ${amountToPay} ${fromCurrency} to ${toCurrency} was successful. You have received ${toCurrency} ${result.toAmount}`,
                phone
              );
            }
          })
          .catch((error) => {
            redisClient.del(quoteId);
            console.log("Error during conversion", error);
            throw error;
          });

        return {
          screen: "PROCESSING",
          data: {},
        };
      }
    }
  }
}
