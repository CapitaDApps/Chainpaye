import {
  toronetService,
  userService,
  whatsappBusinessService,
} from "../../services";
import { NormalizedNetworkType } from "../types";

const networkTokens: {
  [key in NormalizedNetworkType]: string[];
} = {
  "BNB Smart Chain": ["usdc", "usdt"],
  Base: ["usdc"],
  Ethereum: ["usdc", "usdt"],
  Polygon: ["usdc", "usdt"],
  Solana: ["usdc", "usdt"],
  Tron: ["usdc", "usdt"],
};

export async function handleOfframp(from: string) {
  try {
    await whatsappBusinessService.sendOfframpInstructions(from);
  } catch (error) {
    console.log("Error sending offramp instructions", error);
  }
}

export async function handleCryptoSellResponse(from: string, message: string) {
  try {
    // Parse the message to extract token and network
    const normalizedMessage = message.toLowerCase().trim();

    // Remove common words
    const cleanedMessage = normalizedMessage
      .replace(/^(sell|cash out|convert|withdraw)\s+/i, "")
      .replace(/\s+(on|to|at)\s+/gi, " ")
      .trim();

    // Extract token and network
    const parts = cleanedMessage.split(/\s+/);
    const token = parts[0]; // usdc, usdt
    const network = parts[1]; // solana, ethereum, bsc, etc.

    if (!token || !network) {
      await whatsappBusinessService.sendNormalMessage(
        '❌ Invalid format. Please specify both token and network.\n\nExample: "usdc solana" or "usdt on ethereum"',
        from
      );
      return;
    }

    // Validate token
    const validTokens = ["usdc", "usdt"];
    if (!validTokens.includes(token)) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ Invalid token. Supported tokens are: USDC and USDT`,
        from
      );
      return;
    }

    // Validate network
    const validNetworks = [
      "bsc",
      "sol",
      "solana",
      "eth",
      "ethereum",
      "poly",
      "polygon",
      "trx",
      "tron",
      "base",
    ];
    if (!validNetworks.includes(network)) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ Invalid network. Supported networks are: BSC, Solana, Ethereum, Polygon, Tron, Base`,
        from
      );
      return;
    }

    // Normalize network name
    const normalizedNetwork: NormalizedNetworkType = network.startsWith("sol")
      ? "Solana"
      : network.startsWith("eth")
      ? "Ethereum"
      : network.startsWith("poly")
      ? "Polygon"
      : network.startsWith("trx")
      ? "Tron"
      : network === "bsc"
      ? "BNB Smart Chain"
      : "Base";

    // Verify token is supported on the specified network
    const supportedTokensOnNetwork = networkTokens[normalizedNetwork];
    if (!supportedTokensOnNetwork.includes(token)) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ ${token.toUpperCase()} is not supported on ${normalizedNetwork}.\n\nSupported tokens on ${normalizedNetwork}: ${supportedTokensOnNetwork.map((t) => t.toUpperCase()).join(", ")}`,
        from
      );
      return;
    }

    const { user, wallet } = await userService.getUserToroWallet(from, true);

    let address: string;

    address = wallet.publicKey;

    if (normalizedNetwork == "Solana" || normalizedNetwork == "Tron") {
      const network = normalizedNetwork === "Solana" ? "sol" : "trx";
      address = await toronetService.generateOrGetSolAndTrxAddress({
        network,
        userAddress: wallet.publicKey,
        userWalletPassword: wallet.password,
        asset: token as "usdc" | "usdt",
        fullName: `${user.firstName} ${user.lastName}`,
      });
    }

    await whatsappBusinessService.sendCryptoDepositAddress(
      from,
      token,
      normalizedNetwork,
      address
    );
  } catch (error) {
    console.log("Error handling crypto sell response", error);
  }
}
