/**
 * TransactionManager - Handles sequential transaction processing for crypto off-ramp workflow
 *
 * This service implements crypto-first transaction sequencing where crypto transfers
 * must complete successfully before any DexPay operations begin, ensuring transaction
 * integrity and preventing partial failures
 *
 * Requirements: 10.1, 10.2, 10.3
 */

import {
  ICrossmintService,
  IDexPayService,
  INotificationService,
  ITransactionManager,
  OffRampTransaction,
  Quote,
  QuoteRequest,
  SupportedChain,
  TransactionReceipt,
  TransactionResult,
  TransactionStatus,
  TransferRequest,
  TransferResult,
} from "../../types/crypto-off-ramp.types";

export interface TransactionManagerConfig {
  maxRetryAttempts: number;
  retryDelayMs: number;
  transactionTimeoutMs: number;
  enableDetailedLogging: boolean;
}

export interface TransactionStep {
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
}

export interface TransactionContext {
  transactionId: string;
  userId: string;
  workflowId: string;
  steps: TransactionStep[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * TransactionManager provides sequential transaction processing with crypto-first execution
 * ensuring that crypto transfers complete before any fiat processing begins.
 */
export class TransactionManager implements ITransactionManager {
  private readonly config: TransactionManagerConfig;
  private readonly transactions: Map<string, OffRampTransaction> = new Map();
  private readonly transactionContexts: Map<string, TransactionContext> =
    new Map();
  private readonly crossmintService: ICrossmintService;
  private readonly dexPayService: IDexPayService;
  private readonly notificationService: INotificationService | undefined;

  constructor(
    crossmintService: ICrossmintService,
    dexPayService: IDexPayService,
    config?: Partial<TransactionManagerConfig>,
    notificationService?: INotificationService,
  ) {
    this.crossmintService = crossmintService;
    this.dexPayService = dexPayService;
    this.notificationService = notificationService;
    this.config = {
      maxRetryAttempts: 3,
      retryDelayMs: 2000,
      transactionTimeoutMs: 300000, // 5 minutes
      enableDetailedLogging: true,
      ...config,
    };
  }

  /**
   * Process a complete off-ramp transaction with sequential execution
   * Requirements: 10.1, 10.2, 10.3
   *
   * @param transaction - The off-ramp transaction to process
   * @returns Promise<TransactionResult> - The result of the transaction processing
   */
  async processTransaction(
    transaction: OffRampTransaction,
  ): Promise<TransactionResult> {
    const transactionId = transaction.id;

    try {
      this.log(`Starting transaction processing for ${transactionId}`);

      // Store transaction and create context
      this.transactions.set(transactionId, transaction);
      const context = this.createTransactionContext(transaction);
      this.transactionContexts.set(transactionId, context);

      // Update transaction status to processing
      await this.updateTransactionStatus(
        transactionId,
        TransactionStatus.PIN_CONFIRMED,
      );

      // Step 1: Execute crypto transfer first and exclusively (Requirement 10.1)
      this.log(
        `Step 1: Executing crypto transfer for transaction ${transactionId}`,
      );
      const cryptoResult = await this.executeCryptoTransferStep(transaction);

      if (!cryptoResult.success) {
        // Abort entire transaction without calling DexPay endpoints (Requirement 10.3)
        this.log(
          `Crypto transfer failed for ${transactionId}, aborting transaction`,
        );
        await this.updateTransactionStatus(
          transactionId,
          TransactionStatus.FAILED,
        );

        return {
          success: false,
          transactionId,
          status: TransactionStatus.FAILED,
          error: cryptoResult.error || "Crypto transfer failed",
        };
      }

      // Update transaction with crypto transfer details
      if (cryptoResult.transactionId) {
        transaction.crossmintTransactionId = cryptoResult.transactionId;
      }
      await this.updateTransactionStatus(
        transactionId,
        TransactionStatus.CRYPTO_TRANSFERRED,
      );
      this.log(`Crypto transfer completed successfully for ${transactionId}`);

      // Step 2: Proceed to DexPay quote creation only after crypto success (Requirement 10.2)
      this.log(
        `Step 2: Creating DexPay quote for transaction ${transactionId}`,
      );
      const quoteResult = await this.createDexPayQuoteStep(transaction);

      if (!quoteResult.success) {
        this.log(`Quote creation failed for ${transactionId}`);
        await this.updateTransactionStatus(
          transactionId,
          TransactionStatus.FAILED,
        );

        return {
          success: false,
          transactionId,
          status: TransactionStatus.FAILED,
          error: quoteResult.error || "Quote creation failed",
        };
      }

      // Update transaction with quote details
      if (quoteResult.quoteId) {
        transaction.dexpayQuoteId = quoteResult.quoteId;
      }
      await this.updateTransactionStatus(
        transactionId,
        TransactionStatus.QUOTE_CREATED,
      );
      this.log(
        `Quote created successfully for ${transactionId}: ${quoteResult.quoteId}`,
      );

      // Step 3: Finalize the transaction
      this.log(`Step 3: Finalizing transaction ${transactionId}`);
      const finalizeResult = await this.finalizeTransactionStep(transaction);

      if (!finalizeResult.success) {
        this.log(`Transaction finalization failed for ${transactionId}`);
        await this.updateTransactionStatus(
          transactionId,
          TransactionStatus.FAILED,
        );

        return {
          success: false,
          transactionId,
          status: TransactionStatus.FAILED,
          error: finalizeResult.error || "Transaction finalization failed",
        };
      }

      // Update transaction with final details
      if (finalizeResult.orderId) {
        transaction.dexpayOrderId = finalizeResult.orderId;
      }
      transaction.completedAt = new Date();
      await this.updateTransactionStatus(
        transactionId,
        TransactionStatus.COMPLETED,
      );

      // Process referral earnings (if applicable)
      try {
        const { handleOfframpTransaction } = await import("../../webhooks/controllers/referral.controller");
        
        // Calculate USD amount from fiatAmount (NGN) using exchange rate
        // The transaction.amount is the crypto amount, transaction.fiatAmount is NGN
        // We need to convert NGN to USD using the exchange rate
        const sellAmountUsd = transaction.fiatAmount / transaction.exchangeRate;
        
        await handleOfframpTransaction({
          id: transactionId,
          userId: transaction.userId,
          amount: transaction.amount,
          sellAmountUsd: sellAmountUsd,
          timestamp: transaction.completedAt,
        });
        this.log(`Referral earnings processed for transaction ${transactionId}`);
      } catch (referralError) {
        this.log(
          `Warning: Failed to process referral earnings for transaction ${transactionId}: ${(referralError as Error).message}`,
        );
        // Don't fail the transaction if referral processing fails
      }

      // Generate receipt
      const receipt = this.generateTransactionReceipt(transaction);

      // Send completion notification and receipt (Requirements 12.1, 12.3, 12.4)
      if (this.notificationService) {
        try {
          await this.notificationService.sendCompletionNotification?.(
            transaction.userId,
            transaction,
          );
          await this.notificationService.sendReceipt(
            transaction.userId,
            transaction,
          );
          this.log(
            `Completion notification and receipt sent for transaction ${transactionId}`,
          );
        } catch (notificationError) {
          this.log(
            `Warning: Failed to send notifications for transaction ${transactionId}: ${(notificationError as Error).message}`,
          );
          // Don't fail the transaction if notification fails
        }
      }

      this.log(`Transaction ${transactionId} completed successfully`);

      return {
        success: true,
        transactionId,
        status: TransactionStatus.COMPLETED,
        receipt,
      };
    } catch (error) {
      this.log(
        `Unexpected error processing transaction ${transactionId}: ${(error as Error).message}`,
      );
      await this.updateTransactionStatus(
        transactionId,
        TransactionStatus.FAILED,
      );

      return {
        success: false,
        transactionId,
        status: TransactionStatus.FAILED,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Execute crypto transfer with comprehensive error handling and validation
   * Requirements: 10.1, 10.4
   *
   * @param transferRequest - The transfer request parameters
   * @returns Promise<TransferResult> - The result of the crypto transfer
   */
  async executeCryptoTransfer(
    transferRequest: TransferRequest,
  ): Promise<TransferResult> {
    try {
      this.log(
        `Executing crypto transfer: ${transferRequest.amount} ${transferRequest.token}`,
      );

      // Validate transfer request
      const validation = this.validateTransferRequest(transferRequest);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error || "Invalid transfer request",
        };
      }

      // Execute transfer with retry logic
      let lastError: Error | null = null;

      for (
        let attempt = 1;
        attempt <= this.config.maxRetryAttempts;
        attempt++
      ) {
        try {
          this.log(
            `Transfer attempt ${attempt}/${this.config.maxRetryAttempts}`,
          );

          const result =
            await this.crossmintService.transferTokens(transferRequest);

          if (result.success) {
            this.log(
              `Crypto transfer successful on attempt ${attempt}: ${result.transactionId}`,
            );
            return result;
          } else {
            lastError = new Error(result.error || "Transfer failed");
            this.log(`Transfer attempt ${attempt} failed: ${result.error}`);
          }
        } catch (error) {
          lastError = error as Error;
          this.log(
            `Transfer attempt ${attempt} threw error: ${lastError.message}`,
          );
        }

        // Wait before retry (except on last attempt)
        if (attempt < this.config.maxRetryAttempts) {
          await this.delay(this.config.retryDelayMs * attempt);
        }
      }

      return {
        success: false,
        error:
          lastError?.message ||
          "Crypto transfer failed after all retry attempts",
      };
    } catch (error) {
      this.log(`Crypto transfer execution error: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Create DexPay quote with enhanced error handling for workflow integration
   * Requirements: 11.1, 11.2
   *
   * @param quoteRequest - The quote request parameters
   * @returns Promise<Quote> - The created quote
   */
  async createDexpayQuote(quoteRequest: QuoteRequest): Promise<Quote> {
    try {
      this.log(
        `Creating DexPay quote for ${quoteRequest.asset} on ${quoteRequest.chain}`,
      );

      // Validate quote request
      const validation = this.validateQuoteRequest(quoteRequest);
      if (!validation.isValid) {
        throw new Error(validation.error || "Invalid quote request");
      }

      // Create quote with retry logic
      let lastError: Error | null = null;

      for (
        let attempt = 1;
        attempt <= this.config.maxRetryAttempts;
        attempt++
      ) {
        try {
          this.log(
            `Quote creation attempt ${attempt}/${this.config.maxRetryAttempts}`,
          );

          const quote = await this.dexPayService.createQuote(quoteRequest);

          this.log(
            `Quote created successfully on attempt ${attempt}: ${quote.id}`,
          );
          return quote;
        } catch (error) {
          lastError = error as Error;
          this.log(
            `Quote creation attempt ${attempt} failed: ${lastError.message}`,
          );

          // Don't retry on certain errors
          if (this.isNonRetryableError(lastError)) {
            break;
          }
        }

        // Wait before retry (except on last attempt)
        if (attempt < this.config.maxRetryAttempts) {
          await this.delay(this.config.retryDelayMs * attempt);
        }
      }

      throw (
        lastError || new Error("Quote creation failed after all retry attempts")
      );
    } catch (error) {
      this.log(`Quote creation error: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Finalize transaction with comprehensive error handling
   * Requirements: 11.3, 11.4
   *
   * @param transactionId - The transaction ID to finalize
   * @returns Promise<TransactionResult> - The finalization result
   */
  async finalizeTransaction(transactionId: string): Promise<TransactionResult> {
    try {
      const transaction = this.transactions.get(transactionId);
      if (!transaction) {
        return {
          success: false,
          transactionId,
          error: "Transaction not found",
        };
      }

      if (!transaction.dexpayQuoteId) {
        return {
          success: false,
          transactionId,
          error: "No quote ID available for finalization",
        };
      }

      this.log(
        `Finalizing transaction ${transactionId} with quote ${transaction.dexpayQuoteId}`,
      );

      const result = await this.dexPayService.finalizeQuote(
        transaction.dexpayQuoteId,
      );

      if (result.success) {
        if (result.orderId) {
          transaction.dexpayOrderId = result.orderId;
        }
        transaction.completedAt = new Date();
        await this.updateTransactionStatus(
          transactionId,
          TransactionStatus.COMPLETED,
        );

        const receipt = this.generateTransactionReceipt(transaction);

        return {
          success: true,
          transactionId,
          status: TransactionStatus.COMPLETED,
          receipt,
        };
      } else {
        // Handle quote expiration and regeneration
        if (result.expired && result.requiresRegeneration) {
          this.log(
            `Quote expired for transaction ${transactionId}, regeneration required`,
          );
          return {
            success: false,
            transactionId,
            error:
              "Quote has expired. Please restart the transaction for current rates.",
            status: TransactionStatus.FAILED,
          };
        }

        return {
          success: false,
          transactionId,
          error: result.error || "Transaction finalization failed",
          status: TransactionStatus.FAILED,
        };
      }
    } catch (error) {
      this.log(`Transaction finalization error: ${(error as Error).message}`);
      return {
        success: false,
        transactionId,
        error: (error as Error).message,
        status: TransactionStatus.FAILED,
      };
    }
  }

  /**
   * Get current transaction status
   *
   * @param transactionId - The transaction ID to check
   * @returns Promise<TransactionStatus> - The current transaction status
   */
  async getTransactionStatus(
    transactionId: string,
  ): Promise<TransactionStatus> {
    const transaction = this.transactions.get(transactionId);
    return transaction?.status || TransactionStatus.FAILED;
  }

  /**
   * Get transaction details including context and steps
   *
   * @param transactionId - The transaction ID to retrieve
   * @returns The transaction and its context, or null if not found
   */
  getTransactionDetails(
    transactionId: string,
  ): { transaction: OffRampTransaction; context: TransactionContext } | null {
    const transaction = this.transactions.get(transactionId);
    const context = this.transactionContexts.get(transactionId);

    if (transaction && context) {
      return { transaction, context };
    }

    return null;
  }

  /**
   * Cancel an active transaction
   *
   * @param transactionId - The transaction ID to cancel
   * @returns Promise<boolean> - True if cancelled successfully
   */
  async cancelTransaction(transactionId: string): Promise<boolean> {
    try {
      const transaction = this.transactions.get(transactionId);
      if (!transaction) {
        return false;
      }

      // Only allow cancellation of non-completed transactions
      if (transaction.status === TransactionStatus.COMPLETED) {
        return false;
      }

      await this.updateTransactionStatus(
        transactionId,
        TransactionStatus.CANCELLED,
      );
      this.log(`Transaction ${transactionId} cancelled`);
      return true;
    } catch (error) {
      this.log(
        `Error cancelling transaction ${transactionId}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  // Private helper methods

  /**
   * Execute crypto transfer step with context tracking
   */
  private async executeCryptoTransferStep(
    transaction: OffRampTransaction,
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    const context = this.transactionContexts.get(transaction.id);
    if (context) {
      this.updateStepStatus(context, "crypto_transfer", "in_progress");
    }

    try {
      // Round down amount to 6 decimal places for offramp transfers
      const roundedAmount = Math.floor(transaction.amount * 1000000) / 1000000;
      
      // Create transfer request from transaction
      const transferRequest: TransferRequest = {
        walletAddress: transaction.sourceWalletAddress,
        token: `${transaction.chain}:${transaction.asset.toLowerCase()}`,
        recipient: this.getReceivingAddress(transaction.chain),
        amount: roundedAmount.toString(),
        idempotencyKey: this.generateIdempotencyKey(transaction.id),
      };

      const result = await this.executeCryptoTransfer(transferRequest);

      if (context) {
        if (result.success) {
          this.updateStepStatus(context, "crypto_transfer", "completed");
        } else {
          this.updateStepStatus(
            context,
            "crypto_transfer",
            "failed",
            result.error,
          );
        }
      }

      return result;
    } catch (error) {
      if (context) {
        this.updateStepStatus(
          context,
          "crypto_transfer",
          "failed",
          (error as Error).message,
        );
      }
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Create DexPay quote step with context tracking
   */
  private async createDexPayQuoteStep(
    transaction: OffRampTransaction,
  ): Promise<{ success: boolean; quoteId?: string; error?: string }> {
    const context = this.transactionContexts.get(transaction.id);
    if (context) {
      this.updateStepStatus(context, "quote_creation", "in_progress");
    }

    try {
      // Create quote request from transaction
      // For Stellar: USDC on Stellar is received, but DexPay quote uses USDT on BSC
      const dexpayAsset = transaction.chain === "stellar" ? "USDT" as const : transaction.asset;
      const dexpayChain = transaction.chain === "stellar" ? "bep20" as const : transaction.chain;

      const quoteRequest: QuoteRequest = {
        fiatAmount: transaction.fiatAmount,
        asset: dexpayAsset,
        chain: dexpayChain,
        type: "SELL",
        bankCode: transaction.bankCode,
        accountName: transaction.accountName,
        accountNumber: transaction.accountNumber,
      };

      const quote = await this.createDexpayQuote(quoteRequest);

      if (context) {
        this.updateStepStatus(context, "quote_creation", "completed");
      }

      return {
        success: true,
        quoteId: quote.id,
      };
    } catch (error) {
      if (context) {
        this.updateStepStatus(
          context,
          "quote_creation",
          "failed",
          (error as Error).message,
        );
      }
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Finalize transaction step with context tracking
   */
  private async finalizeTransactionStep(
    transaction: OffRampTransaction,
  ): Promise<{ success: boolean; orderId?: string; error?: string }> {
    const context = this.transactionContexts.get(transaction.id);
    if (context) {
      this.updateStepStatus(context, "finalization", "in_progress");
    }

    try {
      if (!transaction.dexpayQuoteId) {
        throw new Error("No quote ID available for finalization");
      }

      const result = await this.dexPayService.finalizeQuote(
        transaction.dexpayQuoteId,
      );

      if (context) {
        if (result.success) {
          this.updateStepStatus(context, "finalization", "completed");
        } else {
          this.updateStepStatus(
            context,
            "finalization",
            "failed",
            result.error,
          );
        }
      }

      const returnValue: {
        success: boolean;
        orderId?: string;
        error?: string;
      } = {
        success: result.success,
      };

      if (result.orderId) {
        returnValue.orderId = result.orderId;
      }

      if (result.error) {
        returnValue.error = result.error;
      }

      return returnValue;
    } catch (error) {
      if (context) {
        this.updateStepStatus(
          context,
          "finalization",
          "failed",
          (error as Error).message,
        );
      }
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Create transaction context for tracking
   */
  private createTransactionContext(
    transaction: OffRampTransaction,
  ): TransactionContext {
    const steps: TransactionStep[] = [
      { name: "crypto_transfer", status: "pending", retryCount: 0 },
      { name: "quote_creation", status: "pending", retryCount: 0 },
      { name: "finalization", status: "pending", retryCount: 0 },
    ];

    return {
      transactionId: transaction.id,
      userId: transaction.userId,
      workflowId: transaction.workflowId,
      steps,
      metadata: {
        asset: transaction.asset,
        chain: transaction.chain,
        amount: transaction.amount,
        fiatAmount: transaction.fiatAmount,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Update step status in transaction context
   */
  private updateStepStatus(
    context: TransactionContext,
    stepName: string,
    status: TransactionStep["status"],
    error?: string,
  ): void {
    const step = context.steps.find((s) => s.name === stepName);
    if (step) {
      step.status = status;
      if (error !== undefined) {
        step.error = error;
      }

      if (status === "in_progress") {
        step.startedAt = new Date();
      } else if (status === "completed" || status === "failed") {
        step.completedAt = new Date();
      }

      context.updatedAt = new Date();
    }
  }

  /**
   * Update transaction status
   */
  private async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
  ): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.status = status;
      transaction.updatedAt = new Date();

      if (status === TransactionStatus.COMPLETED) {
        transaction.completedAt = new Date();
      }
    }
  }

  /**
   * Generate transaction receipt
   */
  private generateTransactionReceipt(
    transaction: OffRampTransaction,
  ): TransactionReceipt {
    const references: {
      crossmintTxId?: string;
      dexpayQuoteId?: string;
      dexpayOrderId?: string;
    } = {};

    if (transaction.crossmintTransactionId) {
      references.crossmintTxId = transaction.crossmintTransactionId;
    }

    if (transaction.dexpayQuoteId) {
      references.dexpayQuoteId = transaction.dexpayQuoteId;
    }

    if (transaction.dexpayOrderId) {
      references.dexpayOrderId = transaction.dexpayOrderId;
    }

    return {
      transactionId: transaction.id,
      userId: transaction.userId,
      asset: transaction.asset,
      chain: transaction.chain,
      amount: transaction.amount,
      fiatAmount: transaction.fiatAmount,
      exchangeRate: transaction.exchangeRate,
      fees: {
        chainpaye: transaction.chainpayeFee,
        dexpay: transaction.dexpayFee,
        total: transaction.totalFees,
      },
      bankDetails: {
        bankName: transaction.bankName,
        accountName: transaction.accountName,
        accountNumber: transaction.accountNumber,
      },
      timestamps: {
        initiated: transaction.createdAt,
        completed: transaction.completedAt || new Date(),
      },
      references,
    };
  }

  /**
   * Validate transfer request
   */
  private validateTransferRequest(request: TransferRequest): {
    isValid: boolean;
    error?: string;
  } {
    if (!request.walletAddress) {
      return { isValid: false, error: "Wallet address is required" };
    }

    if (!request.token || !request.token.includes(":")) {
      return { isValid: false, error: "Token must be in format chain:symbol" };
    }

    if (!request.recipient) {
      return { isValid: false, error: "Recipient address is required" };
    }

    if (!request.amount || parseFloat(request.amount) <= 0) {
      return { isValid: false, error: "Amount must be greater than zero" };
    }

    if (!request.idempotencyKey) {
      return { isValid: false, error: "Idempotency key is required" };
    }

    return { isValid: true };
  }

  /**
   * Validate quote request
   */
  private validateQuoteRequest(request: QuoteRequest): {
    isValid: boolean;
    error?: string;
  } {
    if (!request.asset || !request.chain) {
      return { isValid: false, error: "Asset and chain are required" };
    }

    if (!request.bankCode || !request.accountNumber || !request.accountName) {
      return {
        isValid: false,
        error: "Complete banking information is required",
      };
    }

    if (!request.fiatAmount && !request.tokenAmount) {
      return {
        isValid: false,
        error: "Either fiat amount or token amount must be specified",
      };
    }

    return { isValid: true };
  }

  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    const nonRetryableMessages = [
      "invalid",
      "not found",
      "unauthorized",
      "forbidden",
      "expired",
      "unsupported",
    ];

    const message = error.message.toLowerCase();
    return nonRetryableMessages.some((msg) => message.includes(msg));
  }

  /**
   * Get receiving address for the specified chain
   */
  private getReceivingAddress(chain: SupportedChain): string {
    // ChainPaye receiving addresses for different chains
    const receivingAddresses: Record<SupportedChain, string> = {
      solana: "3947D9DUMD4Rj4ssjUy17qVXiKN4zCdUe2vEDpHvfdCk",
      bep20: "0xAA7Ee1e18FC9B9D3bf51b6015566c63D8bC2a28f",
      arbitrum: "0xAA7Ee1e18FC9B9D3bf51b6015566c63D8bC2a28f",
      base: "0xAA7Ee1e18FC9B9D3bf51b6015566c63D8bC2a28f",
      hedera: "0xAA7Ee1e18FC9B9D3bf51b6015566c63D8bC2a28f",
      apechain: "0xAA7Ee1e18FC9B9D3bf51b6015566c63D8bC2a28f",
      lisk: "0xAA7Ee1e18FC9B9D3bf51b6015566c63D8bC2a28f",
      stellar: process.env.STELLAR_RECEIVING_ADDRESS || "",
    };

    return receivingAddresses[chain] || receivingAddresses.solana;
  }

  /**
   * Generate idempotency key for transfer
   */
  private generateIdempotencyKey(transactionId: string): string {
    return `tx-${transactionId}-${Date.now()}`;
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Log message if detailed logging is enabled
   */
  private log(message: string): void {
    if (this.config.enableDetailedLogging) {
      console.log(
        `[TransactionManager] ${new Date().toISOString()}: ${message}`,
      );
    }
  }
}

export default TransactionManager;
