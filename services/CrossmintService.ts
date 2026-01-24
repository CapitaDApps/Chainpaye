/**
 * Crossmint API service for ChainPaye WhatsApp bot
 * This service handles custodial wallet creation via Crossmint API
 */
import axios, { AxiosInstance } from "axios";

export type BlockchainType = "sol" | "bsc";

export interface CrossmintWalletResponse {
  address: string;
  blockchain: string;
}

export class CrossmintService {
  private axiosInstance: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.baseUrl = "https://staging.crossmint.com/api/2025-06-09";
    this.apiKey = process.env.CROSSMINT_API_KEY || "";

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Create a custodial wallet for a specific blockchain
   * @param userId - User identifier to associate with the wallet
   * @param blockchain - Blockchain type (sol or bsc)
   * @returns Wallet address and blockchain info
   */
  async createCustodialWallet(
    userId: string,
    blockchain: BlockchainType
  ): Promise<CrossmintWalletResponse> {
    try {
      // Map blockchain to chainType
      // sol -> solana, bsc -> evm (BSC is an EVM-compatible chain)
      const chainType = blockchain === "sol" ? "solana" : "evm";

      const response = await this.axiosInstance.post("/wallets", {
        chainType,
        "config": {
          "adminSigner": {
            "type": "api-key",
            "address": "0x1234567890123456789012345678901234567890"
          }
        },
        type: "smart", // MPC wallet type for custodial wallets
        owner: `userId:${userId}`, // Owner format: "userId:xxx"
        alias: `custodial-wallet-${blockchain}-${userId}`, // Optional alias
        chain: blockchain === "sol" ? "solana" : "bsc",
      });


      return {
        address: response.data.address,
        blockchain: response.data.chainType || blockchain,
      };
    } catch (error: any) {
      console.error("Error creating Crossmint wallet:", error.response?.data || error.message);
      throw new Error(
        `Failed to create custodial wallet: ${error.response?.data?.message || error.message}`
      );
    }
  }
}