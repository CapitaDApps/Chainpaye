/**
 * Crossmint Service for wallet management
 * Handles wallet creation, balance checking, and transactions
 */

import axios from "axios";
import { logger } from "../utils/logger";

export interface CrossmintWallet {
  id: string;
  address: string;
  chainType: string;
  type: string;
  owner: string;
}

export interface CrossmintBalance {
  token: string;
  amount: string;
  decimals: number;
  usdValue?: number;
}

export interface CreateWalletRequest {
  chainType: string;
  type: "smart";
  config: {
    adminSigner: {
      type: "api-key";
      address: string;
    };
  };
  owner: string;
}

export class CrossmintService {
  private apiKey: string;
  private baseUrl: string;
  private adminSignerAddress: string;

  constructor() {
    this.apiKey = process.env.CROSSMINT_API_KEY || "";
    this.baseUrl =
      process.env.CROSSMINT_BASE_URL ||
      "https://staging.crossmint.com/api/2025-06-09";
    this.adminSignerAddress = process.env.CROSSMINT_ADMIN_SIGNER_ADDRESS || "";

    if (!this.apiKey) {
      logger.warn("Crossmint API key not configured");
    }
  }

  /**
   * List all wallets for a user
   */
  async listWallets(userId: string): Promise<CrossmintWallet[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/wallets/userId:${userId}:evm/balance?tokens=usdc`,
        {
          headers: {
            "X-API-KEY": this.apiKey,
          },
          params: {
            owner: `userId:${userId}`,
          },
        },
      );

      logger.info(`Listed ${response.data.length} wallets for user ${userId}`);
      return response.data;
    } catch (error: any) {
      logger.error(
        `Error listing wallets for user ${userId}:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to list wallets: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Create a new wallet for a user
   */
  async createWallet(
    userId: string,
    chainType: string,
  ): Promise<CrossmintWallet> {
    try {
      const requestBody: CreateWalletRequest = {
        chainType,
        type: "smart",
        config: {
          adminSigner: {
            type: "api-key",
            address: this.adminSignerAddress,
          },
        },
        owner: `userId:${userId}`,
      };

      const response = await axios.post(
        `${this.baseUrl}/wallets`,
        requestBody,
        {
          headers: {
            "X-API-KEY": this.apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      logger.info(
        `Created ${chainType} wallet for user ${userId}: ${response.data.address}`,
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        `Error creating ${chainType} wallet for user ${userId}:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to create wallet: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Get chain identifier for balance API calls
   */
  getChainIdentifier(chain: string): string {
    const chainMappings: { [key: string]: string } = {
      solana: "solana",
      bep20: "bsc", // BSC for BEP20 tokens
      arbitrium: "arbitrum",
      base: "base",
      hedera: "hedera",
      apechain: "apechain",
      lisk: "lisk",
    };

    return chainMappings[chain.toLowerCase()] || chain.toLowerCase();
  }

  /**
   * Get wallet balances for a specific chain by chain name
   */
  async getBalancesByChain(
    userId: string,
    chain: string,
    tokens: string[] = ["usdc", "usdt"],
  ): Promise<CrossmintBalance[]> {
    const chainId = this.getChainIdentifier(chain);
    return this.getWalletBalances(userId, chainId, tokens);
  }
  async getWalletBalances(
    userId: string,
    chain: string,
    tokens: string[] = ["usdc", "usdt"],
  ): Promise<CrossmintBalance[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/wallets/userId:${userId}:${chain}/balances`,
        {
          headers: {
            "X-API-KEY": this.apiKey,
          },
          params: {
            tokens: tokens.join(","),
          },
        },
      );

      logger.info(
        `Retrieved ${response.data.length} balances for user ${userId} on ${chain}`,
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        `Error getting ${chain} balances for user ${userId}:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to get ${chain} balances: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Get wallet balances for Solana (legacy method for backward compatibility)
   */
  async getSolanaBalances(
    userId: string,
    tokens: string[] = ["usdc", "sol"],
  ): Promise<CrossmintBalance[]> {
    return this.getWalletBalances(userId, "solana", tokens);
  }

  /**
   * Get wallet balances for EVM chains (legacy method for backward compatibility)
   */
  async getEvmBalances(
    userId: string,
    tokens: string[] = ["usdc", "usdt"],
  ): Promise<CrossmintBalance[]> {
    return this.getWalletBalances(userId, "evm", tokens);
  }

  /**
   * Get wallet by chain type for a user
   */
  async getWalletByChain(
    userId: string,
    chainType: string,
  ): Promise<CrossmintWallet | null> {
    try {
      const wallets = await this.listWallets(userId);
      return wallets.find((wallet) => wallet.chainType === chainType) || null;
    } catch (error) {
      logger.error(
        `Error getting ${chainType} wallet for user ${userId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get or create wallet for a specific chain
   */
  async getOrCreateWallet(
    userId: string,
    chainType: string,
  ): Promise<CrossmintWallet> {
    try {
      // First try to get existing wallet
      const existingWallet = await this.getWalletByChain(userId, chainType);

      if (existingWallet) {
        logger.info(`Found existing ${chainType} wallet for user ${userId}`);
        return existingWallet;
      }

      // Create new wallet if none exists
      logger.info(`Creating new ${chainType} wallet for user ${userId}`);
      return await this.createWallet(userId, chainType);
    } catch (error: any) {
      logger.error(
        `Error getting or creating ${chainType} wallet for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Transfer tokens from user wallet to another address using the new endpoint format
   */
  async transferTokens(
    userId: string,
    chainType: string,
    token: string,
    amount: string,
    toAddress: string,
  ): Promise<any> {
    try {
      // First get the user's wallet for this chain to get the wallet address
      const wallet = await this.getWalletByChain(userId, chainType);
      if (!wallet) {
        throw new Error(
          `No wallet found for user ${userId} on chain ${chainType}`,
        );
      }

      // Map chain to the correct format for token identifier
      const tokenChain = this.getTokenChainIdentifier(chainType);
      const tokenIdentifier = `${tokenChain}:${token.toLowerCase()}`;

      const response = await axios.post(
        `${this.baseUrl}/wallets/${wallet.address}/tokens/${tokenIdentifier}/transfers`,
        {
          amount,
          recipient: toAddress,
          executionRoute: "direct",
        },
        {
          headers: {
            "X-API-KEY": this.apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      logger.info(
        `Transferred ${amount} ${token} from wallet ${wallet.address} to ${toAddress}`,
      );
      return response.data;
    } catch (error: any) {
      logger.error(
        `Error transferring tokens for user ${userId}:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to transfer tokens: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Get token chain identifier for transfer API
   */
  getTokenChainIdentifier(chainType: string): string {
    const tokenChainMapping: { [key: string]: string } = {
      solana: "solana",
      bsc: "bsc", // For BEP20 tokens
      arbitrum: "arbitrum",
      base: "base-sepolia", // Using sepolia testnet for base
      hedera: "hedera",
      apechain: "apechain",
      lisk: "lisk",
    };

    return (
      tokenChainMapping[chainType.toLowerCase()] || chainType.toLowerCase()
    );
  }

  /**
   * Map chain names to Crossmint chain types
   */
  getChainType(chain: string): string {
    const chainMapping: { [key: string]: string } = {
      solana: "solana",
      bep20: "bsc",
      base: "base",
      arbitrium: "arbitrum",
      hedera: "hedera",
      apechain: "apechain",
      lisk: "lisk",
    };

    return chainMapping[chain.toLowerCase()] || chain.toLowerCase();
  }

  /**
   * Get supported assets for a chain
   */
  getSupportedAssets(chain: string): string[] {
    const supportedAssets: { [key: string]: string[] } = {
      bep20: ["usdc", "usdt"],
      base: ["usdc"],
      arbitrium: ["usdc", "usdt"],
      solana: ["usdc", "usdt"],
      hedera: ["usdc", "usdt"],
      apechain: ["usdc", "usdt"],
      lisk: ["usdc", "usdt"],
    };

    return supportedAssets[chain.toLowerCase()] || [];
  }

  /**
   * Check if asset is supported on chain
   */
  isAssetSupported(asset: string, chain: string): boolean {
    const supportedAssets = this.getSupportedAssets(chain);
    return supportedAssets.includes(asset.toLowerCase());
  }
}

// Export singleton instance
export const crossmintService = new CrossmintService();
