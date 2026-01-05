import { scheduleCryptoProcessDeposit } from "../../jobs/cryptoTopUp/job";

import { userService, walletService } from "../../services";

type Network = "bsc" | "sol" | "eth" | "poly" | "trx" | "base";

const networkTokens = {
  bsc: [
    { id: "usdcbsc", title: "USDC BSC" },
    { id: "usdtbsc", title: "USDT BSC" },
  ],
  sol: [
    { id: "usdcsol", title: "USDC Solana" },
    { id: "usdtsol", title: "USDT Solana" },
  ],
  eth: [
    { id: "usdceth", title: "USDC Ethereum" },
    { id: "usdteth", title: "USDT Ethereum" },
  ],
  poly: [
    { id: "usdcpoly", title: "USDC Polygon" },
    { id: "usdtpoly", title: "USDT Polygon" },
  ],
  trx: [
    { id: "usdctrx", title: "USDC Tron" },
    { id: "usdttrx", title: "USDT Tron" },
  ],
  base: [{ id: "usdcbase", title: "USDC Base" }],
};
const networks = [
  { id: "bsc", title: "BNB Smart Chain (BEP20)" },
  { id: "sol", title: "Solana" },
  { id: "eth", title: "Ethereum (ERC20)" },
  { id: "poly", title: "Polygon" },
  { id: "trx", title: "Tron" },
  { id: "base", title: "Base" },
];

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

  // handle initial request when opening the flow
  if (action === "INIT") {
    return {
      screen: "OFFRAMP_NETWORK",
      data: {
        networks,
      },
    };
  }

  if (action === "data_exchange") {
    // const userPhone = await redisClient.get(flow_token);
    const userPhone = "+2348110236998";
    if (!userPhone) {
      return {
        screen: "OFFRAMP_NETWORK",
        data: {
          error_message: "Session expired. Restart flow a new message",
        },
      };
    }
    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;
    // handle the request based on the current screen
    switch (screen) {
      case "OFFRAMP_NETWORK": {
        const availableTokens = networkTokens[data.network as Network];

        if (!availableTokens) {
          return {
            screen: "OFFRAMP_NETWORK",
            data: {
              error_message: "Invalid network selected. Please try again.",
            },
          };
        }
        return {
          screen: "OFFRAMP_ASSET",
          data: {
            networkId: data.network,
            networkName:
              networks.find((n) => n.id === data.network)?.title || "",
            assets: availableTokens,
          },
        };
      }
      case "OFFRAMP_ASSET":
        const { network, asset, amount } = data;
        const { wallet: userToroWallet } = await userService.getUserToroWallet(
          phone,
          true
        );

        if (!userToroWallet) {
          return {
            screen: "OFFRAMP_ASSET",
            data: {
              error_message:
                "Could not retrieve your wallet information. Please try again.",
            },
          };
        }
        console.log("off ramping data", data);
        const result = await walletService.depositCrypto(
          phone,
          amount,
          asset.toUpperCase()
        );
        console.log("deposit crypto result", result);
        const estimatedFees = Number(result.totalAmount) - Number(amount);
        return {
          screen: "DEPOSIT_DETAILS",
          data: {
            depositAddress: result.address,
            network,
            amountToDeposit: result.amount,
            assetSymbol: networkTokens[network as Network]
              .find((t) => t.id === asset)
              ?.title.split(" ")[0],
            estimatedFees: estimatedFees.toFixed(2),
            finalAmountToReceive: (Number(amount) - estimatedFees).toFixed(2),
            transactionId: result.transactionId,
          },
        };

      case "DEPOSIT_DETAILS":
        const { transactionId } = data;
        // schedule job to process deposit after 1 minute
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
