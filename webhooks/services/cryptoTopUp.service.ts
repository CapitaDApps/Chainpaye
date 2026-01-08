import { scheduleCryptoProcessDeposit } from "../../jobs/cryptoTopUp/job";

import { userService, walletService } from "../../services";
import { redisClient } from "../../services/redis";
import { getNetworkShortName } from "../../utils/getNetworkShort";

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

  // const offrampData = { network: "Solana", asset: "usdc" };
  // handle initial request when opening the flow
  if (action === "INIT") {
    return {
      screen: "OFFRAMP_INPUT",
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
      case "OFFRAMP_INPUT": {
        const { amount } = data;

        const { wallet: userToroWallet } = await userService.getUserToroWallet(
          phone,
          true
        );

        if (!userToroWallet) {
          return {
            screen: "OFFRAMP_DETAILS",
            data: {
              error_message:
                "Could not retrieve your wallet information. Please try again.",
            },
          };
        }

        let offrampData: any = await redisClient.get(`OFFRAMP_${phone}`);
        if (offrampData) {
          offrampData = JSON.parse(offrampData);
        }

        if (!offrampData)
          return { screen, data: { error_message: "Invalid asset" } };

        const { network, asset } = offrampData;

        const net = getNetworkShortName(network);

        const result = await walletService.depositCrypto(
          phone,
          amount,
          `${asset}${net}`.toUpperCase() as any
        );
        // console.log("deposit crypto result", result);
        const estimatedFees = Number(result.totalAmount) - Number(amount);
        return {
          screen: "OFFRAMP_DETAILS",
          data: {
            sent_amount: amount,
            fee: estimatedFees.toFixed(2),
            receive_amount: (Number(amount) - estimatedFees).toFixed(2),
            transactionId: result.transactionId,
            network: network,
            asset: asset,
          },
        };
      }
      case "OFFRAMP_DETAILS":
        const { transactionId } = data;
        console.log({ data });
        scheduleCryptoProcessDeposit(transactionId);
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
