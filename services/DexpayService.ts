/**
 * Dexpay API service for ChainPaye WhatsApp bot
 * This service handles quote retrieval and execution via Dexpay API
 */
import axios, { AxiosInstance } from "axios";

export type BlockchainType = "SOL" | "BSC";

export interface DexpayQuote {
   id: string,
    status: string,
    fiatAmount: number,
    tokenAmount: number,
    price: number,
    fee: number,
    createdAt: string,
    type: "SELL",
    address: string,
    paymentAccount: {
      accountName: string,
      accountNumber: string,
      bankName: string
    },
    receivingAddress: string
}

export interface DexpayQuoteResponse {
  data: DexpayQuote[];
}

export interface DexpayExecuteQuoteResponse {
  success: boolean;
  transactionId?: string;
  message?: string;
  walletAddress?: string;
}

export interface DexpayBank {
  code: string;
  name: string;
}

export interface DexpayBankResponse {
  data: DexpayBank[];
}

export interface DexpayResolveAccountResponse {
  success: boolean;
  accountExists: boolean;
  accountName?: string;
  message?: string;
}

export class DexpayService {
  private axiosInstance: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;
  private apiKeySecret: string;

  constructor() {
    this.baseUrl = "https://sandbox-b2b.dexpay.io";
    this.apiKey = process.env.DEXPAY_API_KEY || "";
    this.apiKeySecret = process.env.DEXPAY_API_SECRET || "";

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "x-api-secret": this.apiKeySecret,
      },
    });
  }

  /**
   * Get quotes for offramp transaction
   * @param asset - Source currency (e.g., "USD")
   * @param chain - Destination blockchain (SOL or BSC)
   * @param tokenAmount - Optional amount to get specific quotes
   * @param type - Type of quote (e.g., "sell")
   * @param bankCode - Optional bank code for fiat withdrawals
   * @param accountNumber - Optional account number for fiat withdrawals
   * @param accountName - Optional account name for fiat withdrawals
   * @param receivingAddress - Optional receiving wallet address
   * @returns Array of available quotes
   * 
   */
  async getQuotes(
    asset: string,
    chain: BlockchainType,
    tokenAmount?: number,
    type?: string,
    bankCode?: string,
    accountNumber?: string,
    accountName?: string,
    receivingAddress?: string

  ): Promise<DexpayQuote[]> {
    try {
      const params: any = {
        asset: asset.toUpperCase(),
        chain: chain.toUpperCase(),
        type:"SELL",
        bankCode: bankCode,
        accountNumber: accountNumber,
        accountName: accountName,
        receivingAddress: receivingAddress,
        tokenAmount: tokenAmount
      };
      if (tokenAmount) {
        params.tokenAmount = tokenAmount.toString();
      }

      const response = await this.axiosInstance.post<DexpayQuoteResponse>(
        "/quote",
        { asset: asset.toUpperCase(),
        chain: chain.toUpperCase(),
        type:"SELL",
        bankCode: bankCode,
        accountNumber: accountNumber,
        accountName: accountName,
        receivingAddress: receivingAddress,
        tokenAmount: tokenAmount }
      );

      return response.data.data || [];
    } catch (error: any) {
      console.error("Error fetching Dexpay quotes:", error.response?.data || error.message);
      throw new Error(
        `Failed to get quotes: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Execute a quote
   * @param quoteId - Quote ID to execute
   * @param sourceWalletAddress - Source wallet address to send funds from
   * @param destinationWalletAddress - Destination wallet address (Dexpay's wallet)
   * @returns Execution result
   */
  async executeQuote(
    quoteId: string,
    sourceWalletAddress: string,
    destinationWalletAddress: string
  ): Promise<DexpayExecuteQuoteResponse> {
    try {
      const response = await this.axiosInstance.post<DexpayExecuteQuoteResponse>(
        `/quote/${quoteId}`,
        {
          sourceWalletAddress,
          destinationWalletAddress,
        }
      );

      return response.data;
    } catch (error: any) {
      console.error("Error executing Dexpay quote:", error.response?.data || error.message);
      throw new Error(
        `Failed to execute quote: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Get list of supported banks
   * @returns Array of available banks
   */
  async getBanks(): Promise<DexpayBank[]> {
    try {
      const response = await this.axiosInstance.get<DexpayBankResponse>("/banks");
      return response.data.data || [];
    } catch (error: any) {
      console.error("Error fetching banks:", error.response?.data || error.message);
      throw new Error(
        `Failed to get banks: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Resolve account number with bank code
   * @param bankCode - Bank code
   * @param accountNumber - Account number to verify
   * @returns Account resolution result
   */
  async resolveAccount(
    bankCode: string,
    accountNumber: string
  ): Promise<DexpayResolveAccountResponse> {
    try {
      const response = await this.axiosInstance.post<DexpayResolveAccountResponse>(
        "/banks/resolve",
        {
          bankCode,
          accountNumber,
        }
      );

      return response.data;
    } catch (error: any) {
      console.error("Error resolving account:", error.response?.data || error.message);
      throw new Error(
        `Failed to resolve account: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Get Dexpay's wallet address for a specific blockchain
   * This would typically be provided by Dexpay API or stored in config
   */
  getDexpayWalletAddress(blockchain: BlockchainType): string {
    // These would typically come from environment variables or API call
    const walletAddresses: Record<BlockchainType, string> = {
      SOL: process.env.DEXPAY_SOL_WALLET_ADDRESS || "",
      BSC: process.env.DEXPAY_BSC_WALLET_ADDRESS || "",
    };

    const address = walletAddresses[blockchain];
    if (!address) {
      throw new Error(`Dexpay wallet address not configured for ${blockchain}`);
    }
    return address;
  }

   getChainpayWalletAddress(blockchain: BlockchainType): string {
    // These would typically come from environment variables or API call
    const walletAddresses: Record<BlockchainType, string> = {
      SOL: process.env.CHAINPAYE_SOL_WALLET_ADDRESS || "",
      BSC: process.env.CHAINPAYE_BSC_WALLET_ADDRESS || "",
    };

    const address = walletAddresses[blockchain];
    if (!address) {
      throw new Error(`Chainpaye wallet address not configured for ${blockchain}`);
    }
    return address;
  }
}

