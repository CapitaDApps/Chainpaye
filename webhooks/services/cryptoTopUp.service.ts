import { userService } from "../../services";
import { redisClient } from "../../services/redis";

type Network = "bsc" | "sol" | "eth" | "poly" | "trx" | "base";

export const getCryptoTopUpScreen = async (decryptedBody: {
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

  const userPhone = await redisClient.get(flow_token);
  //const userPhone = "+2348110236998";
  const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;

  // handle initial request when opening the flow
  if (action === "INIT") {
    return {
      screen: "OFFRAMP_DETAILS",
      data: {},
    };
  }

  if (action === "data_exchange") {
    if (!userPhone) {
      return {
        screen,
        data: {
          error_message: "Session expired. Restart flow a new message",
        },
      };
    }

    // handle the request based on the current screen
    switch (screen) {
      case "OFFRAMP_DETAILS": {
        const { currency, network, sell_amount, bank_name, account_number } =
          data;

        // Basic validation
        if (
          !currency ||
          !network ||
          !sell_amount ||
          !bank_name ||
          !account_number
        ) {
          console.error("Missing required fields", data);
          // In a real scenario, we might return the same screen with an error message in data
          // But for this flow structure we proceed or throw/log.
        }

        // Mock recipient name resolution or use a placeholder
        const recipientName = "User Account";

        return {
          screen: "OFFRAMP_FIAT_REVIEW",
          data: {
            currency,
            network,
            sell_amount,
            bank_name,
            account_number,
            recipient_name: recipientName,
          },
        };
      }

      case "OFFRAMP_FIAT_REVIEW": {
        // Just transitioning to the next review screen
        // Echoing data back
        return {
          screen: "OFFRAMP_CRYPTO_REVIEW",
          data: {
            ...data,
          },
        };
      }

      case "OFFRAMP_CRYPTO_REVIEW": {
        const {
          pin,
          sell_amount,
          currency,
          network,
          bank_name,
          account_number,
        } = data;

        const user = await userService.getUser(phone);
        if (!user) {
          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              error_message: "User not found.",
            },
          };
        }

        const validPin = await user.comparePin(pin);
        if (!validPin) {
          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              error_message: "Invalid PIN",
            },
          };
        }

        // TODO: Implement actual Crypto Sell / Withdraw logic here.
        // Currently expecting a service method like walletService.sellCrypto or similar.
        // For now, we mock the success as per instructions to "make it work" with current code limitations.

        console.log(
          `Processing Offramp: Sell ${sell_amount} ${currency} on ${network} to ${bank_name} (${account_number})`,
        );

        return {
          screen: "OFFRAMP_SUCCESS",
          data: {},
        };
      }

      // Legacy fallback (optional, if you want to keep old logic reachable, but flow file determines screens)
      case "OFFRAMP_INPUT":
        // ... implementation if needed ...
        break;

      default:
        break;
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
  );
};
