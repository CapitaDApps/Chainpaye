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
  constructor() {
    // API key and config loaded dynamically to avoid init issues
  }

  private get apiKey(): string {
    return process.env.CROSSMINT_API_KEY || "";
  }

  private get baseUrl(): string {
    return (
      process.env.CROSSMINT_BASE_URL || "https://crossmint.com/api/2025-06-09"
    );
  }

  private get adminSignerAddress(): string {
    return process.env.CROSSMINT_ADMIN_SIGNER_ADDRESS || "";
  }

  /**
   * List all wallets for a user
   */
  async listWallets(userId: string): Promise<CrossmintWallet[]> {
    const wallets: CrossmintWallet[] = [];
    const chainTypes = ["evm", "solana"];

    await Promise.all(
      chainTypes.map(async (chainType) => {
        try {
          const wallet = await this.getWalletByChain(userId, chainType);
          if (wallet) {
            wallets.push(wallet);
          }
        } catch (error) {
          // Ignore errors looking up specific chains
        }
      }),
    );

    logger.info(`Listed ${wallets.length} wallets for user ${userId}`);
    return wallets;
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
        `Error creating ${chainType} wallet for user ${userId}: ${error.response?.data?.message || error.message}`,
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
      arbitrum: "arbitrum",
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
    // Helper to request balances for a specific chain using the unified EVM wallet
    if (this.isEvmChain(chain)) {
      const chainId = "evm";
      // Map tokens to chain-specific tokens (e.g. "usdc" -> "base:usdc")
      const tokenChain = this.getTokenChainIdentifier(chain);
      const prefixedTokens = tokens.map((t) => `${tokenChain}:${t}`);

      const balances = await this.getWalletBalances(
        userId,
        chainId,
        prefixedTokens,
      );

      // Map back to simple token names for the caller
      return balances.map((b) => {
        // b.token is likely "chain:token" like "base:usdc"
        // We want to return just "usdc" to match what the caller expects
        const tokenVal = b.token || "";
        const simpleToken = tokenVal.includes(":")
          ? tokenVal.split(":")[1]
          : tokenVal;
        return {
          ...b,
          token: simpleToken || b.token,
        };
      });
    }

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
      const response = await axios.get(
        `${this.baseUrl}/wallets/userId:${userId}:${chainType}:smart`,
        {
          headers: {
            "X-API-KEY": this.apiKey,
          },
        },
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      logger.error(
        `Error getting ${chainType} wallet for user ${userId}: ${error.response?.data?.message || error.message}`,
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
        `Error getting or creating ${chainType} wallet for user ${userId}: ${error.message}`,
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
      base: "base", // Production Base mainnet
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
    if (this.isEvmChain(chain)) {
      return "evm";
    }

    const chainMapping: { [key: string]: string } = {
      solana: "solana",
      bep20: "bsc",
      base: "base",
      arbitrum: "arbitrum",
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
      arbitrum: ["usdc", "usdt"],
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
  /**
   * Check if chain is EVM compatible
   */
  isEvmChain(chain: string): boolean {
    const evmChains = [
      "bsc",
      "bep20",
      "base",
      "arbitrum",
      "hedera",
      "apechain",
      "lisk",
      "ethereum",
      "polygon",
      "optimism",
    ];
    return evmChains.includes(chain.toLowerCase());
  }
}

// Export singleton instance
export const crossmintService = new CrossmintService();
