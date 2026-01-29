/**
 * DexPay Service for crypto off-ramping
 * Handles bank operations, quotes, and transaction processing
 * 
 * Implements IBankingManager and IDexPayService interfaces for off-ramp workflow integration
 */

import axios from "axios";
import { logger } from "../utils/logger";
import {
  Bank,
  BankResolution,
  ExchangeRate,
  QuoteRequest,
  Quote,
  QuoteResult,
  ValidationResult,
  IBankingManager,
  IDexPayService,
  SupportedAsset,
  SupportedChain
} from "../types/crypto-off-ramp.types";

// Legacy interfaces for backward compatibility
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

// Legacy QuoteRequest interface for backward compatibility
export interface LegacyQuoteRequest {
  fiatAmount: number; // DexPay API requires a number
  asset: string;
  chain: string; // Must be uppercase: BASE, BSC, SOL, etc.
  type: "SELL";
  bankCode: string;
  accountName: string;
  accountNumber: string;
  receivingAddress: string;
}

// Legacy Quote interface for backward compatibility
export interface LegacyQuote {
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

export class DexPayService implements IBankingManager, IDexPayService {
  constructor() {
    // API config loaded dynamically
  }

  private get apiKey(): string {
    return process.env.DEXPAY_API_KEY || "";
  }

  private get apiSecret(): string {
    return process.env.DEXPAY_API_SECRET || "";
  }

  private get baseUrl(): string {
    return process.env.DEXPAY_BASE_URL || "https://sandbox-b2b.dexpay.io";
  }

  private get receivingAddress(): string {
    return process.env.DEXPAY_RECEIVING_ADDRESS || "";
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
   * Get list of supported banks (IBankingManager & IDexPayService interface)
   * Requirements: 6.1
   */
  async getSupportedBanks(): Promise<Bank[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/banks`, {
        headers: this.getHeaders(),
      });

      let banks = response.data;
      if (!Array.isArray(banks) && Array.isArray(response.data.data)) {
        banks = response.data.data;
      }

      if (!Array.isArray(banks)) {
        logger.error("Unexpected bank list format from DexPay:", response.data);
        return [];
      }

      // Transform to interface format
      const transformedBanks: Bank[] = banks.map((bank: any) => ({
        name: bank.name,
        code: bank.code,
        currency: 'NGN' as const
      }));

      logger.info(`Retrieved ${transformedBanks.length} banks from DexPay`);
      if (transformedBanks.length > 0) {
        logger.info("Sample bank object:", JSON.stringify(transformedBanks[0]));
      }
      return transformedBanks;
    } catch (error: any) {
      logger.error(
        "Error fetching banks from DexPay:",
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to fetch banks: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async getBanks(): Promise<DexPayBank[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/banks`, {
        headers: this.getHeaders(),
      });

      let banks = response.data;
      if (!Array.isArray(banks) && Array.isArray(response.data.data)) {
        banks = response.data.data;
      }

      if (!Array.isArray(banks)) {
        logger.error("Unexpected bank list format from DexPay:", response.data);
        return [];
      }

      logger.info(`Retrieved ${banks.length} banks from DexPay`);
      if (banks.length > 0) {
        logger.info("Sample bank object:", JSON.stringify(banks[0]));
      }
      return banks;
    } catch (error: any) {
      logger.error(
        "Error fetching banks from DexPay:",
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to fetch banks: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Resolve bank account details (IBankingManager & IDexPayService interface)
   * Requirements: 7.1
   */
  async resolveBank(bankCode: string, accountNumber: string): Promise<BankResolution> {
    try {
      const payload = {
        accountNumber: accountNumber,
        bankCode: bankCode,
      };
      logger.info("Resolving account with payload:", payload);

      const response = await axios.post(
        `${this.baseUrl}/banks/resolve`,
        payload,
        {
          headers: this.getHeaders(),
        },
      );
      console.log(response);
      const data = response.data.data;
      logger.info(`Resolved account response:`, JSON.stringify(data));

      return {
        accountNumber: data.accountNumber || payload.accountNumber,
        accountName: data.accountName || data.account_name,
        bankName: data.bankName || data.bank_name,
        isValid: true
      };
    } catch (error: any) {
      logger.error(
        `Error resolving account ${accountNumber}:`,
        JSON.stringify(error.response?.data || error.message),
      );

      if (error.response?.status === 404 || error.response?.status === 400) {
        // DexPay might return 400 for not found with specific message
        const data = error.response?.data || {};
        const msg = data.message || data.error || "";
        if (String(msg).toLowerCase().includes("not found")) {
          return {
            accountNumber,
            accountName: "",
            bankName: "",
            isValid: false
          };
        }
      }

      throw new Error(
        `Failed to resolve account: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async resolveAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<AccountResolution> {
    try {
      const payload = {
        accountNumber: accountNumber,
        bankCode: bankCode,
      };
      logger.info("Resolving account with payload:", payload);

      const response = await axios.post(
        `${this.baseUrl}/banks/resolve`,
        payload,
        {
          headers: this.getHeaders(),
        },
      );
      console.log(response);
      const data = response.data.data;
      logger.info(`Resolved account response:`, JSON.stringify(data));

      return {
        accountNumber: data.accountNumber || payload.accountNumber,
        accountName: data.accountName || data.account_name,
        bankCode: data.bankCode || payload.bankCode,
        bankName: data.bankName || data.bank_name,
      };
    } catch (error: any) {
      logger.error(
        `Error resolving account ${accountNumber}:`,
        JSON.stringify(error.response?.data || error.message),
      );

      if (error.response?.status === 404 || error.response?.status === 400) {
        // DexPay might return 400 for not found with specific message
        const data = error.response?.data || {};
        const msg = data.message || data.error || "";
        if (String(msg).toLowerCase().includes("not found")) {
          throw new Error(
            "Account not found. Please check the account number and try again.",
          );
        }
      }

      throw new Error(
        `Failed to resolve account: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Get current exchange rates (IBankingManager & IDexPayService interface)
   * Requirements: 7.2
   */
  async getCurrentRates(asset: string, chain: string): Promise<ExchangeRate> {
    try {
      // DexPay doesn't have a dedicated rates endpoint, so we create a temporary quote to get rates
      // This is a common pattern for getting current rates from quote-based APIs
      const tempQuoteRequest = {
        fiatAmount: 1000, // Use 1000 NGN as base amount for rate calculation
        asset: asset.toUpperCase(),
        chain: this.mapChainForDexPay(chain),
      };

      const response = await axios.get(`${this.baseUrl}/rate`, {
        headers: this.getHeaders(),
        params: tempQuoteRequest,
      });

      const quoteData = response.data;
      const rate = quoteData.sell  // NGN per token
      
      logger.info(`Retrieved exchange rate for ${asset} on ${chain}: ${rate} NGN per token`);

      return {
        asset: asset.toUpperCase(),
        chain: chain.toLowerCase(),
        rate: rate,
        timestamp: new Date(),
        validUntil: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes validity
      };
    } catch (error: any) {
      logger.error(
        `Error getting rates for ${asset} on ${chain}:`,
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to get current rates: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Create quote for crypto to fiat conversion (IDexPayService interface)
   * Enhanced for workflow integration with better error handling and context awareness
   * Requirements: 11.1, 11.2
   */
  async createQuote(quoteRequest: QuoteRequest): Promise<Quote> {
    try {
      // Validate quote request parameters for workflow context
      this.validateQuoteRequest(quoteRequest);

      // Transform interface QuoteRequest to DexPay API format
      const dexPayRequest = {
        fiatAmount: quoteRequest.fiatAmount,
        tokenAmount: quoteRequest.tokenAmount,
        asset: quoteRequest.asset,
        chain: this.mapChainForDexPay(quoteRequest.chain),
        type: quoteRequest.type,
        bankCode: quoteRequest.bankCode,
        accountName: quoteRequest.accountName,
        accountNumber: quoteRequest.accountNumber,
        receivingAddress: this.getReceivingAddress(quoteRequest.chain)
      };

      logger.info(`Creating quote for workflow integration: ${quoteRequest.asset} on ${quoteRequest.chain}`);

      const response = await axios.post(`${this.baseUrl}/quote`, dexPayRequest, {
        headers: this.getHeaders(),
      });

      const quoteData = response.data;
      logger.info(`Generated quote ${quoteData.id} for ${quoteRequest.asset} conversion in workflow context`);

      // Enhanced quote object with workflow-specific metadata
      const quote: Quote = {
        id: quoteData.id,
        rate: quoteData.price || (quoteData.fiatAmount / quoteData.cryptoAmount),
        amount: quoteData.cryptoAmount || quoteData.tokenAmount,
        fees: quoteData.fees?.totalFees || 0,
        total: quoteData.fiatAmount,
        expiresAt: new Date(quoteData.expiresAt || Date.now() + 15 * 60 * 1000)
      };

      // Log quote creation for workflow tracking
      logger.info(`Quote created successfully for workflow: ID=${quote.id}, Rate=${quote.rate}, Expires=${quote.expiresAt}`);

      return quote;
    } catch (error: any) {
      logger.error(
        "Error creating quote in workflow context:",
        error.response?.data || error.message,
      );
      
      // Enhanced error handling for workflow integration
      const errorMessage = this.getWorkflowFriendlyErrorMessage(error, 'quote_creation');
      throw new Error(errorMessage);
    }
  }

  /**
   * Finalize quote with enhanced workflow integration and expiration handling
   * Requirements: 11.3, 11.4
   */
  async finalizeQuote(quoteId: string): Promise<QuoteResult> {
    try {
      logger.info(`Attempting to finalize quote ${quoteId} in workflow context`);

      const response = await axios.post(
        `${this.baseUrl}/quote/${quoteId}`,
        {},
        {
          headers: this.getHeaders(),
        },
      );

      logger.info(`Successfully finalized quote ${quoteId} in workflow`);
      
      return {
        success: true,
        orderId: response.data.orderId || response.data.id,
      };
    } catch (error: any) {
      logger.error(
        `Error finalizing quote ${quoteId} in workflow context:`,
        error.response?.data || error.message,
      );

      // Enhanced expiration handling for workflow context
      if (error.response?.status === 410) {
        logger.warn(`Quote ${quoteId} has expired during workflow finalization`);
        return {
          success: false,
          error: "Quote has expired. Please request a new quote.",
          expired: true,
          requiresRegeneration: true
        };
      }

      // Handle other workflow-specific errors
      const errorMessage = this.getWorkflowFriendlyErrorMessage(error, 'quote_finalization');
      
      return {
        success: false,
        error: errorMessage,
        expired: false,
        requiresRegeneration: false
      };
    }
  }

  /**
   * Validate bank details (IBankingManager interface)
   */
  async validateBankDetails(bankCode: string, accountNumber: string): Promise<ValidationResult> {
    try {
      const resolution = await this.resolveBank(bankCode, accountNumber);
      
      if (resolution.isValid && resolution.accountName) {
        return {
          isValid: true,
          errors: []
        };
      } else {
        return {
          isValid: false,
          errors: ["Account not found. Please check the account number and bank selection."]
        };
      }
    } catch (error) {
      return {
        isValid: false,
        errors: [(error as Error).message]
      };
    }
  }

  /**
   * Legacy method for backward compatibility
   * Get quote for crypto to fiat conversion
   */
  async getQuote(request: LegacyQuoteRequest): Promise<LegacyQuote> {
    try {
      const response = await axios.post(`${this.baseUrl}/quote`, request, {
        headers: this.getHeaders(),
      });

      logger.info(
        `Generated quote ${response.data.id} for ${request.fiatAmount} NGN`,
      );
      console.log({ response });
      return response.data;
    } catch (error: any) {
      logger.error(
        "Error getting quote from DexPay:",
        error.response?.data || error.message,
      );
      throw new Error(
        `Failed to get quote: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Complete the off-ramp transaction (validates quote and processes payment)
   */
  async completeOfframp(quoteId: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/quote/${quoteId}`,
        {},
        {
          headers: this.getHeaders(),
        },
      );

      logger.info(`Completed off-ramp for quote ${quoteId}`);
      return response.data;
    } catch (error: any) {
      logger.error(
        `Error completing off-ramp for quote ${quoteId}:`,
        error.response?.data || error.message,
      );

      if (error.response?.status === 410) {
        throw new Error("Quote has expired. Please request a new quote.");
      }

      throw new Error(
        `Failed to complete off-ramp: ${error.response?.data?.message || error.message}`,
      );
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
  calculateFees(
    ngnAmount: number,
    cryptoRate: number,
  ): {
    platformFee: number;
    dexPayFee: number;
    totalFees: number;
    totalDeduction: number;
  } {
    const feePercentage = parseFloat(
      process.env.OFFRAMP_FEE_PERCENTAGE || "1.5",
    );
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
      arbitrum: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
      base: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
      // Add more chains as needed
      hedera: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC", // Assuming EVM-compatible
      apechain: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC", // Assuming EVM-compatible
      lisk: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC", // Assuming EVM-compatible
    };

    if (chain) {
      const chainLower = chain.toLowerCase();
      const address =
        chainPayeWallets[chainLower as keyof typeof chainPayeWallets];

      if (address) {
        logger.info(`Using ChainPaye wallet for ${chain}: ${address}`);
        return address;
      } else {
        logger.warn(
          `No specific wallet configured for chain ${chain}, using default`,
        );
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
      {
        asset: "usdc",
        chains: [
          "bep20",
          "base",
          "arbitrum",
          "solana",
          "hedera",
          "apechain",
          "lisk",
        ],
      },
      {
        asset: "usdt",
        chains: ["bep20", "arbitrum", "solana", "hedera", "apechain", "lisk"],
      },
    ];

    const assetConfig = supportedCombinations.find(
      (config) => config.asset.toLowerCase() === asset.toLowerCase(),
    );

    return assetConfig
      ? assetConfig.chains.includes(chain.toLowerCase())
      : false;
  }

  /**
   * Get supported chains for an asset
   */
  getSupportedChains(asset: string): string[] {
    const supportedCombinations = [
      {
        asset: "usdc",
        chains: [
          "bep20",
          "base",
          "arbitrium",
          "solana",
          "hedera",
          "apechain",
          "lisk",
        ],
      },
      {
        asset: "usdt",
        chains: ["bep20", "arbitrum", "solana", "hedera", "apechain", "lisk"],
      },
    ];

    const assetConfig = supportedCombinations.find(
      (config) => config.asset.toLowerCase() === asset.toLowerCase(),
    );

    return assetConfig ? assetConfig.chains : [];
  }

  /**
   * Map chain names to DexPay API format
   * DexPay expects uppercase chain names in specific formats
   */
  private mapChainForDexPay(chain: string): string {
    const chainMapping: Record<string, string> = {
      'bep20': 'BSC',
      'base': 'BASE',
      'arbitrum': 'ARBITRUM',
      'solana': 'SOL',
      'hedera': 'HEDERA',
      'apechain': 'APECHAIN',
      'lisk': 'LISK'
    };

    const mappedChain = chainMapping[chain.toLowerCase()];
    if (!mappedChain) {
      logger.warn(`Unknown chain mapping for ${chain}, using uppercase`);
      return chain.toUpperCase();
    }

    return mappedChain;
  }

  /**
   * Validate quote request parameters for workflow integration
   */
  private validateQuoteRequest(quoteRequest: QuoteRequest): void {
    if (!quoteRequest.asset || !quoteRequest.chain) {
      throw new Error('Asset and chain are required for quote creation');
    }

    if (!quoteRequest.bankCode || !quoteRequest.accountNumber || !quoteRequest.accountName) {
      throw new Error('Complete banking information is required for quote creation');
    }

    if (!quoteRequest.fiatAmount && !quoteRequest.tokenAmount) {
      throw new Error('Either fiat amount or token amount must be specified');
    }

    if (quoteRequest.fiatAmount && quoteRequest.fiatAmount <= 0) {
      throw new Error('Fiat amount must be greater than zero');
    }

    if (quoteRequest.tokenAmount && quoteRequest.tokenAmount <= 0) {
      throw new Error('Token amount must be greater than zero');
    }

    // Validate supported asset-chain combinations
    if (!this.isSupportedAssetChain(quoteRequest.asset, quoteRequest.chain)) {
      throw new Error(`Unsupported asset-chain combination: ${quoteRequest.asset} on ${quoteRequest.chain}`);
    }
  }

  /**
   * Get workflow-friendly error messages for better user experience
   */
  private getWorkflowFriendlyErrorMessage(error: any, context: string): string {
    const errorData = error.response?.data;
    const errorMessage = errorData?.message || error.message;
    const statusCode = error.response?.status;

    // Handle specific error scenarios for workflow context
    switch (context) {
      case 'quote_creation':
        if (statusCode === 400) {
          if (errorMessage.toLowerCase().includes('amount')) {
            return 'Invalid amount specified. Please check the transaction amount and try again.';
          }
          if (errorMessage.toLowerCase().includes('bank')) {
            return 'Invalid banking information. Please verify your bank details.';
          }
          if (errorMessage.toLowerCase().includes('asset') || errorMessage.toLowerCase().includes('chain')) {
            return 'Unsupported asset or chain. Please select a valid combination.';
          }
        }
        if (statusCode === 429) {
          return 'Service is temporarily busy. Please wait a moment and try again.';
        }
        if (statusCode >= 500) {
          return 'Banking service is temporarily unavailable. Please try again in a few minutes.';
        }
        break;

      case 'quote_finalization':
        if (statusCode === 410) {
          return 'Quote has expired. Please request a new quote with current rates.';
        }
        if (statusCode === 404) {
          return 'Quote not found. Please create a new quote.';
        }
        if (statusCode >= 500) {
          return 'Unable to complete transaction. Banking service is temporarily unavailable.';
        }
        break;
    }

    // Default workflow-friendly messages
    if (statusCode >= 500) {
      return 'Service temporarily unavailable. Please try again.';
    }
    if (statusCode === 429) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    if (statusCode >= 400) {
      return `Transaction failed: ${errorMessage}`;
    }

    return `Failed to ${context.replace('_', ' ')}: ${errorMessage}`;
  }

  /**
   * Check if a quote has expired based on workflow context
   */
  isQuoteExpired(quote: Quote): boolean {
    if (!quote.expiresAt) {
      logger.warn(`Quote ${quote.id} has no expiration time, assuming expired`);
      return true;
    }

    const now = new Date();
    const expired = now > quote.expiresAt;
    
    if (expired) {
      logger.info(`Quote ${quote.id} has expired at ${quote.expiresAt}, current time: ${now}`);
    }

    return expired;
  }

  /**
   * Get time remaining for quote expiration in minutes
   */
  getQuoteTimeRemaining(quote: Quote): number {
    if (!quote.expiresAt) {
      return 0;
    }

    const now = new Date();
    const timeRemaining = quote.expiresAt.getTime() - now.getTime();
    return Math.max(0, Math.floor(timeRemaining / (1000 * 60))); // Convert to minutes
  }

  /**
   * Create a new quote to replace an expired one in workflow context
   */
  async regenerateExpiredQuote(originalQuoteRequest: QuoteRequest): Promise<Quote> {
    logger.info('Regenerating expired quote for workflow continuation');
    
    try {
      const newQuote = await this.createQuote(originalQuoteRequest);
      logger.info(`Successfully regenerated quote: ${newQuote.id} (expires: ${newQuote.expiresAt})`);
      return newQuote;
    } catch (error) {
      logger.error('Failed to regenerate expired quote:', error);
      throw new Error('Unable to generate new quote. Please try again.');
    }
  }
}

// Export singleton instance
export const dexPayService = new DexPayService();
