/**
 * DexPay Service for crypto off-ramping
 * Handles bank operations, quotes, and transaction processing
 */

import axios from "axios";
import { logger } from "../utils/logger";

export interface DexPayBank {
  id: string;
  name: string;
  code: string;
  slug: string;
}

export interface AccountResolution {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
}

export interface QuoteRequest {
  fiatAmount: string;
  asset: string;
  chain: string;
  type: "SELL";
  bankCode: string;
  accountName: string;
  accountNumber: string;
  receivingAddress: string;
}

export interface Quote {
  id: string;
  fiatAmount: number;
  cryptoAmount: number;
  rate: number;
  fees: {
    dexPayFee: number;
    networkFee: number;
    totalFees: number;
  };
  expiresAt: string;
  status: string;
}

export class DexPayService {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private receivingAddress: string;

  constructor() {
    this.apiKey = process.env.DEXPAY_API_KEY || "";
    this.apiSecret = process.env.DEXPAY_API_SECRET || "";
    this.baseUrl = process.env.DEXPAY_BASE_URL || "https://sandbox-b2b.dexpay.io";
    this.receivingAddress = process.env.DEXPAY_RECEIVING_ADDRESS || "";

    if (!this.apiKey || !this.apiSecret) {
      logger.warn("DexPay API credentials not configured");
    }
  }

  /**
   * Get authentication headers
   */
  private getHeaders() {
    return {
      "Content-Type": "application/json",
      "X-API-KEY": this.apiKey,
      "X-API-SECRET": this.apiSecret,
    };
  }

  /**
   * Get list of supported banks
   */
  async getBanks(): Promise<DexPayBank[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/banks`, {
        headers: this.getHeaders(),
      });

      logger.info(`Retrieved ${response.data.length} banks from DexPay`);
      return response.data;
    } catch (error: any) {
      logger.error("Error fetching banks from DexPay:", error.response?.data || error.message);
      throw new Error(`Failed to fetch banks: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Resolve bank account details
   */
  async resolveAccount(accountNumber: string, bankCode: string): Promise<AccountResolution> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/banks/resolve`,
        {
          accountNumber,
          bankCode,
        },
        {
          headers: this.getHeaders(),
        }
      );

      logger.info(`Resolved account ${accountNumber} for bank ${bankCode}`);
      return response.data;
    } catch (error: any) {
      logger.error(`Error resolving account ${accountNumber}:`, error.response?.data || error.message);
      
      if (error.response?.status === 404) {
        throw new Error("Account not found. Please check the account number and try again.");
      }
      
      throw new Error(`Failed to resolve account: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get quote for crypto to fiat conversion
   */
  async getQuote(request: QuoteRequest): Promise<Quote> {
    try {
      const response = await axios.post(`${this.baseUrl}/quote`, request, {
        headers: this.getHeaders(),
      });

      logger.info(`Generated quote ${response.data.id} for ${request.fiatAmount} NGN`);
      return response.data;
    } catch (error: any) {
      logger.error("Error getting quote from DexPay:", error.response?.data || error.message);
      throw new Error(`Failed to get quote: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Complete the off-ramp transaction (validates quote and processes payment)
   */
  async completeOfframp(quoteId: string): Promise<any> {
    try {
      const response = await axios.post(`${this.baseUrl}/quote/${quoteId}`, {}, {
        headers: this.getHeaders(),
      });

      logger.info(`Completed off-ramp for quote ${quoteId}`);
      return response.data;
    } catch (error: any) {
      logger.error(`Error completing off-ramp for quote ${quoteId}:`, error.response?.data || error.message);
      
      if (error.response?.status === 410) {
        throw new Error("Quote has expired. Please request a new quote.");
      }
      
      throw new Error(`Failed to complete off-ramp: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Validate quote (check if still valid) - legacy method for backward compatibility
   */
  async validateQuote(quoteId: string): Promise<Quote> {
    return this.completeOfframp(quoteId);
  }

  /**
   * Calculate fees for a given NGN amount
   */
  calculateFees(ngnAmount: number, cryptoRate: number): {
    platformFee: number;
    dexPayFee: number;
    totalFees: number;
    totalDeduction: number;
  } {
    const feePercentage = parseFloat(process.env.OFFRAMP_FEE_PERCENTAGE || "1.5");
    const fixedFeeUsd = parseFloat(process.env.DEXPAY_FIXED_FEE_USD || "0.20");

    const platformFee = (ngnAmount * feePercentage) / 100;
    const dexPayFee = fixedFeeUsd * cryptoRate; // Convert USD fee to NGN
    const totalFees = platformFee + dexPayFee;
    const totalDeduction = ngnAmount + totalFees;

    return {
      platformFee,
      dexPayFee,
      totalFees,
      totalDeduction,
    };
  }

  /**
   * Format currency amounts
   */
  formatNGN(amount: number): string {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
    }).format(amount);
  }

  formatUSD(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }

  /**
   * Get receiving address for transfers based on chain
   */
  getReceivingAddress(chain?: string): string {
    // ChainPaye DexPay wallet addresses for different networks
    const chainPayeWallets = {
      solana: "Dbt7NnCK15bqJMESTw462wup3s1FVh7jyaDGV26x58iH",
      bep20: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
      arbitrium: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
      base: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
      // Add more chains as needed
      hedera: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC", // Assuming EVM-compatible
      apechain: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC", // Assuming EVM-compatible
      lisk: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC", // Assuming EVM-compatible
    };

    if (chain) {
      const chainLower = chain.toLowerCase();
      const address = chainPayeWallets[chainLower as keyof typeof chainPayeWallets];
      
      if (address) {
        logger.info(`Using ChainPaye wallet for ${chain}: ${address}`);
        return address;
      } else {
        logger.warn(`No specific wallet configured for chain ${chain}, using default`);
      }
    }

    // Fallback to environment variable or default Solana address
    return this.receivingAddress || chainPayeWallets.solana;
  }

  /**
   * Check if asset and chain combination is supported
   */
  isSupportedAssetChain(asset: string, chain: string): boolean {
    const supportedCombinations = [
      { asset: "usdc", chains: ["bep20", "base", "arbitrium", "solana", "hedera", "apechain", "lisk"] },
      { asset: "usdt", chains: ["bep20", "arbitrium", "solana", "hedera", "apechain", "lisk"] },
    ];

    const assetConfig = supportedCombinations.find(
      config => config.asset.toLowerCase() === asset.toLowerCase()
    );

    return assetConfig ? assetConfig.chains.includes(chain.toLowerCase()) : false;
  }

  /**
   * Get supported chains for an asset
   */
  getSupportedChains(asset: string): string[] {
    const supportedCombinations = [
      { asset: "usdc", chains: ["bep20", "base", "arbitrium", "solana", "hedera", "apechain", "lisk"] },
      { asset: "usdt", chains: ["bep20", "arbitrium", "solana", "hedera", "apechain", "lisk"] },
    ];

    const assetConfig = supportedCombinations.find(
      config => config.asset.toLowerCase() === asset.toLowerCase()
    );

    return assetConfig ? assetConfig.chains : [];
  }
}

// Export singleton instance
export const dexPayService = new DexPayService();