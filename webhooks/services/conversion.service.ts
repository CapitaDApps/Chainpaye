import { Types } from "mongoose";
import { toronetService, userService } from "../../services";
import { redisClient } from "../../services/redis";
import { sendTransactionReceipt } from "../../utils/sendReceipt";
import { CurrencyType } from "../../types/toronetService.types";

const SUPPORTED_CURRENCIES: CurrencyType[] = ["USD", "NGN", "EUR", "GBP"];

const currencyOptions = SUPPORTED_CURRENCIES.map((currency) => ({
  id: currency,
  title: currency,
}));

function normalizeCurrency(value: unknown): CurrencyType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "USD" ||
    normalized === "NGN" ||
    normalized === "EUR" ||
    normalized === "GBP"
  ) {
    return normalized;
  }
  return null;
}

function parsePositiveAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(/,/g, "").trim());
  return NaN;
}

function formatFixed2(value: number): string {
  return value.toFixed(2);
}

async function getBalanceByCurrency(
  walletAddress: string,
  currency: CurrencyType,
): Promise<number> {
  switch (currency) {
    case "USD":
      return (await toronetService.getBalanceUSD(walletAddress)).balance;
    case "NGN":
      return (await toronetService.getBalanceNGN(walletAddress)).balance;
    case "EUR":
      return (await toronetService.getBalanceEUR(walletAddress)).balance;
    case "GBP":
      return (await toronetService.getBalanceGBP(walletAddress)).balance;
    default:
      return 0;
  }
}

export async function getConversionFlowScreen(decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) {
  const { screen, data, action, flow_token } = decryptedBody;

  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      data: {
        status: "Error",
        acknowledged: true,
      },
    };
  }

  const userPhone = await redisClient.get(flow_token);
  const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;
  const quoteId = `QUOTE_${phone}`;

  if (action === "INIT") {
    return {
      screen: "CONVERT_ENTRY",
      data: {
        currencies: currencyOptions,
      },
    };
  }

  if (action === "data_exchange") {
    switch (screen) {
      case "CONVERT_ENTRY": {
        if (!userPhone) {
          return {
            screen: "CONVERT_ENTRY",
            data: {
              currencies: currencyOptions,
              error_message: "Session expired. Restart flow from a new message.",
            },
          };
        }

        const fromCurrency = normalizeCurrency(data?.fromCurrency);
        const toCurrency = normalizeCurrency(data?.toCurrency);
        const amountValue = parsePositiveAmount(data?.amount);

        if (!fromCurrency || !toCurrency) {
          return {
            screen: "CONVERT_ENTRY",
            data: {
              currencies: currencyOptions,
              error_message: "Select valid currencies to continue.",
            },
          };
        }

        if (fromCurrency === toCurrency) {
          return {
            screen: "CONVERT_ENTRY",
            data: {
              currencies: currencyOptions,
              error_message:
                "From currency cannot be the same as To currency.",
            },
          };
        }

        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          return {
            screen: "CONVERT_ENTRY",
            data: {
              currencies: currencyOptions,
              error_message: "Enter a valid amount greater than 0.",
            },
          };
        }

        const { wallet: toronetWallet } = await userService.getUserToroWallet(
          phone,
        );

        const fromBalance = await getBalanceByCurrency(
          toronetWallet.publicKey,
          fromCurrency,
        );
        if (amountValue > fromBalance) {
          return {
            screen: "CONVERT_ENTRY",
            data: {
              currencies: currencyOptions,
              error_message: "Insufficient balance for conversion.",
            },
          };
        }

        const simulationResult = await toronetService.simulateConversion({
          from: fromCurrency,
          to: toCurrency,
          amount: formatFixed2(amountValue),
          address: toronetWallet.publicKey,
        });

        const amountToReceiveNumber = Number(simulationResult.toAmount);
        if (!Number.isFinite(amountToReceiveNumber)) {
          throw new Error("Could not calculate conversion quote.");
        }

        const exchangeRate = amountToReceiveNumber / amountValue;

        return {
          screen: "CONVERT_QUOTE",
          data: {
            fromCurrency,
            toCurrency,
            amountToPay: formatFixed2(amountValue),
            exchangeRate: formatFixed2(exchangeRate),
            amountToReceive: formatFixed2(amountToReceiveNumber),
          },
        };
      }

      case "PIN": {
        if (!userPhone) {
          return {
            screen: "CONVERT_ENTRY",
            data: {
              currencies: currencyOptions,
              error_message: "Session expired. Restart flow from a new message.",
            },
          };
        }

        const fromCurrency = normalizeCurrency(data?.fromCurrency);
        const toCurrency = normalizeCurrency(data?.toCurrency);
        const amountToPayValue = parsePositiveAmount(data?.amountToPay);
        const amountToReceiveValue = parsePositiveAmount(data?.amountToReceive);
        const pin = typeof data?.pin === "string" ? data.pin.trim() : "";

        if (
          !fromCurrency ||
          !toCurrency ||
          !Number.isFinite(amountToPayValue) ||
          amountToPayValue <= 0 ||
          !Number.isFinite(amountToReceiveValue) ||
          amountToReceiveValue <= 0
        ) {
          return {
            screen: "PIN",
            data: {
              fromCurrency: fromCurrency || "",
              toCurrency: toCurrency || "",
              amountToPay: Number.isFinite(amountToPayValue)
                ? formatFixed2(amountToPayValue)
                : "",
              amountToReceive: Number.isFinite(amountToReceiveValue)
                ? formatFixed2(amountToReceiveValue)
                : "",
              error_message:
                "Invalid conversion data. Please restart conversion.",
            },
          };
        }

        if (!pin) {
          return {
            screen: "PIN",
            data: {
              fromCurrency,
              toCurrency,
              amountToPay: formatFixed2(amountToPayValue),
              amountToReceive: formatFixed2(amountToReceiveValue),
              error_message: "Please enter your PIN.",
            },
          };
        }

        const [user, { wallet: userToroWallet }] = await Promise.all([
          userService.getUser(phone, true),
          userService.getUserToroWallet(phone, true),
        ]);

        if (!user) {
          throw new Error(`user with phone number - [${phone}] does not exist`);
        }

        const validPin = await user.comparePin(pin);
        if (!validPin) {
          return {
            screen: "PIN",
            data: {
              fromCurrency,
              toCurrency,
              amountToPay: formatFixed2(amountToPayValue),
              amountToReceive: formatFixed2(amountToReceiveValue),
              error_message: "Invalid PIN.",
            },
          };
        }

        toronetService
          .convertToAndFro({
            from: fromCurrency,
            to: toCurrency,
            amount: formatFixed2(amountToPayValue),
            password: userToroWallet.password,
            address: userToroWallet.publicKey,
            user: user._id as Types.ObjectId,
          })
          .then((result) => {
            if (result.success) {
              redisClient.del(quoteId).catch((err) =>
                console.log("Error deleting conversion quote cache", err),
              );

              if (result.transaction) {
                sendTransactionReceipt(
                  (result.transaction._id as Types.ObjectId).toString(),
                  phone,
                ).catch((err) => console.log("Error sending receipt", err));
              }
            }
          })
          .catch((error) => {
            redisClient.del(quoteId).catch((err) =>
              console.log("Error deleting conversion quote cache", err),
            );
            console.log("Error during conversion", error);
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
}
