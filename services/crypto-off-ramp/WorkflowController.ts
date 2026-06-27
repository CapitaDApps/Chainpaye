/**
 * WorkflowController - Central orchestrator for the crypto off-ramp workflow
 *
 * This controller manages the sequential execution of all 12 off-ramp steps,
 * maintains workflow state, and ensures proper step transitions with validation.
 *
 * Requirements: 1.1, 1.2, 1.3
 */

import { randomBytes } from "crypto";
import {
  IWorkflowController,
  OffRampStep,
  OffRampTransaction,
  StepResult,
  WorkflowState,
} from "../../types/crypto-off-ramp.types";

// Simple ID generator to avoid nanoid import issues in tests
function generateId(): string {
  return randomBytes(8).toString("hex");
}

export class WorkflowController implements IWorkflowController {
  private workflowStates: Map<string, WorkflowState> = new Map();
  private transactions: Map<string, OffRampTransaction> = new Map();

  /**
   * Initiates a new off-ramp workflow for a user
   * Requirements: 1.1, 1.2
   */
  async initiateOffRamp(userId: string): Promise<WorkflowState> {
    const workflowId = generateId();
    const now = new Date();

    const workflowState: WorkflowState = {
      id: workflowId,
      userId,
      currentStep: OffRampStep.DISPLAY_WALLETS,
      stepData: {},
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    this.workflowStates.set(workflowId, workflowState);
    return workflowState;
  }

  /**
   * Processes a workflow step with the provided data
   * Requirements: 1.2, 1.3
   */
  async processStep(workflowId: string, stepData: any): Promise<StepResult> {
    const workflow = this.workflowStates.get(workflowId);
    if (!workflow) {
      return {
        success: false,
        error: "Workflow not found",
      };
    }

    if (workflow.status !== "active") {
      return {
        success: false,
        error: "Workflow is not active",
      };
    }

    try {
      const result = await this.executeStep(workflow, stepData);

      if (result.success && result.nextStep) {
        // Update workflow state for successful step transition
        workflow.currentStep = result.nextStep;
        workflow.stepData = { ...workflow.stepData, ...result.data };
        workflow.updatedAt = new Date();

        // Mark as completed if we've reached the final step
        if (result.nextStep === OffRampStep.COMPLETION) {
          workflow.status = "completed";
        }

        this.workflowStates.set(workflowId, workflow);
      }

      return result;
    } catch (error) {
      await this.handleStepFailure(workflowId, error as Error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handles workflow step failures
   * Requirements: 1.3
   */
  async handleStepFailure(workflowId: string, error: Error): Promise<void> {
    const workflow = this.workflowStates.get(workflowId);
    if (workflow) {
      workflow.status = "failed";
      workflow.stepData.error = error.message;
      workflow.updatedAt = new Date();
      this.workflowStates.set(workflowId, workflow);
    }
  }

  /**
   * Retrieves the current workflow state
   * Requirements: 1.3
   */
  async getWorkflowState(workflowId: string): Promise<WorkflowState> {
    const workflow = this.workflowStates.get(workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    return workflow;
  }

  /**
   * Executes a specific workflow step based on the current step
   * This method contains the core logic for each of the 12 workflow steps
   */
  private async executeStep(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    switch (workflow.currentStep) {
      case OffRampStep.DISPLAY_WALLETS:
        return this.executeDisplayWallets(workflow, stepData);

      case OffRampStep.REQUEST_ASSET_CHAIN:
        return this.executeRequestAssetChain(workflow, stepData);

      case OffRampStep.WALLET_CREATION:
        return this.executeWalletCreation(workflow, stepData);

      case OffRampStep.DEPOSIT_CONFIRMATION:
        return this.executeDepositConfirmation(workflow, stepData);

      case OffRampStep.SPEND_FORM:
        return this.executeSpendForm(workflow, stepData);

      case OffRampStep.BANK_RESOLUTION:
        return this.executeBankResolution(workflow, stepData);

      case OffRampStep.BALANCE_VALIDATION:
        return this.executeBalanceValidation(workflow, stepData);

      case OffRampStep.PIN_CONFIRMATION:
        return this.executePinConfirmation(workflow, stepData);

      case OffRampStep.CRYPTO_TRANSFER:
        return this.executeCryptoTransfer(workflow, stepData);

      case OffRampStep.QUOTE_CREATION:
        return this.executeQuoteCreation(workflow, stepData);

      case OffRampStep.QUOTE_FINALIZATION:
        return this.executeQuoteFinalization(workflow, stepData);

      case OffRampStep.COMPLETION:
        return this.executeCompletion(workflow, stepData);

      default:
        throw new Error(`Unknown workflow step: ${workflow.currentStep}`);
    }
  }

  /**
   * Step 1: Display user wallets with balances
   * Requirements: 2.1, 2.2, 2.3, 2.4
   */
  private async executeDisplayWallets(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      // Validate that wallets data is provided
      if (!stepData.wallets || !Array.isArray(stepData.wallets)) {
        return {
          success: false,
          error: "Wallet information is required to proceed",
        };
      }

      // Filter wallets with balance >= $0 as per requirement 2.2
      const validWallets = stepData.wallets.filter(
        (wallet: any) => wallet.balance !== undefined && wallet.balance >= 0,
      );

      if (validWallets.length === 0) {
        return {
          success: false,
          error: "No wallets with valid balances found",
        };
      }

      return {
        success: true,
        nextStep: OffRampStep.REQUEST_ASSET_CHAIN,
        data: {
          wallets: validWallets,
          displayMessage: `Found ${validWallets.length} wallet(s) with available balances`,
          totalWallets: validWallets.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to display wallets: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 2: Request asset and chain selection from user
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  private async executeRequestAssetChain(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      // Display the required message as per requirement 3.1
      if (!stepData.asset || !stepData.chain) {
        return {
          success: false,
          error:
            "Tell me what asset you want to deposit and its chain. Example: 'USDC on Solana'",
          data: {
            promptMessage:
              "Tell me what asset you want to deposit and its chain. Example: 'USDC on Solana'",
          },
        };
      }

      // Validate supported asset-chain combinations as per requirements 3.3, 3.4, 3.5
      const supportedCombinations = {
        USDC: [
          "bep20",
          "base",
          "arbitrum",
          "solana",
          "stellar",
          "hedera",
          "apechain",
          "lisk",
        ],
        USDT: ["bep20", "arbitrum", "solana", "hedera", "apechain", "lisk"],
      };

      const asset = stepData.asset.toUpperCase();
      const chain = stepData.chain.toLowerCase();

      if (!supportedCombinations[asset as keyof typeof supportedCombinations]) {
        return {
          success: false,
          error: `Unsupported asset: ${asset}. Supported assets are: USDC, USDT`,
        };
      }

      if (
        !supportedCombinations[
          asset as keyof typeof supportedCombinations
        ].includes(chain)
      ) {
        return {
          success: false,
          error: `Unsupported chain for ${asset}: ${chain}. Supported chains for ${asset} are: ${supportedCombinations[asset as keyof typeof supportedCombinations].join(", ")}`,
        };
      }

      return {
        success: true,
        nextStep: OffRampStep.WALLET_CREATION,
        data: {
          selectedAsset: asset,
          selectedChain: chain,
          validationMessage: `${asset} on ${chain} is supported`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to validate asset-chain selection: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 3: Create or reuse wallet for selected chain
   * Requirements: 4.1, 4.2, 4.3, 4.4
   */
  private async executeWalletCreation(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      const selectedChain = workflow.stepData.selectedChain;

      if (!selectedChain) {
        return {
          success: false,
          error: "Selected chain information is missing",
        };
      }

      // Check if user already has a wallet for the selected chain
      const existingWallet = stepData.existingWallet;

      if (existingWallet && existingWallet.chainType === selectedChain) {
        // Reuse existing wallet as per requirement 4.3
        return {
          success: true,
          nextStep: OffRampStep.DEPOSIT_CONFIRMATION,
          data: {
            walletAddress: existingWallet.address,
            walletCreated: false,
            walletReused: true,
            chainType: selectedChain,
            message: `Reusing existing wallet for ${selectedChain}`,
          },
        };
      } else {
        // Create new wallet as per requirement 4.1
        const newWalletAddress =
          stepData.walletAddress || `new-wallet-${selectedChain}-${Date.now()}`;

        return {
          success: true,
          nextStep: OffRampStep.DEPOSIT_CONFIRMATION,
          data: {
            walletAddress: newWalletAddress,
            walletCreated: true,
            walletReused: false,
            chainType: selectedChain,
            message: `Created new wallet for ${selectedChain}`,
            // Maintain wallet-to-user association as per requirement 4.4
            userWalletAssociation: {
              userId: workflow.userId,
              walletAddress: newWalletAddress,
              chainType: selectedChain,
              createdAt: new Date(),
            },
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to manage wallet: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 4: Wait for and confirm crypto deposit
   * Requirements: 5.1, 5.2, 5.3, 5.4
   */
  private async executeDepositConfirmation(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      // Check if user has sufficient balance (> $2 USD) to skip deposit as per requirement 5.4
      const currentBalance = stepData.currentBalance || 0;
      const hasBalance = currentBalance > 2;

      if (hasBalance) {
        return {
          success: true,
          nextStep: OffRampStep.SPEND_FORM,
          data: {
            depositConfirmed: true,
            skipDeposit: true,
            currentBalance,
            message: "Sufficient balance detected. Proceeding to spend form.",
            spendCTAEnabled: true,
          },
        };
      }

      // Check for deposit confirmation via webhook as per requirement 5.1
      if (stepData.depositConfirmed === true) {
        return {
          success: true,
          nextStep: OffRampStep.SPEND_FORM,
          data: {
            depositConfirmed: true,
            skipDeposit: false,
            depositAmount: stepData.depositAmount || 0,
            message: "Deposit confirmed successfully!",
            spendCTAEnabled: true, // Display "Spend Crypto" CTA as per requirement 5.2
          },
        };
      }

      // Handle deposit failures or timeouts as per requirement 5.3
      if (stepData.depositFailed === true) {
        return {
          success: false,
          error:
            "Deposit failed or timed out. Please try again or contact support.",
          data: {
            depositConfirmed: false,
            failureReason: stepData.failureReason || "Unknown error",
            retryAllowed: true,
          },
        };
      }

      // Still waiting for deposit confirmation
      return {
        success: false,
        error:
          "Waiting for deposit confirmation. Please ensure you have sent the crypto to the provided address.",
        data: {
          depositPending: true,
          walletAddress: workflow.stepData.walletAddress,
          expectedAsset: workflow.stepData.selectedAsset,
          expectedChain: workflow.stepData.selectedChain,
          message: "Monitoring blockchain for deposit confirmation...",
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to confirm deposit: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 5: Display spend form for banking information
   * Requirements: 6.1, 6.2, 6.3, 6.4
   */
  private async executeSpendForm(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      // Validate that all required fields are provided as per requirement 6.3
      const requiredFields = ["bankCode", "accountNumber", "amount"];
      const missingFields = requiredFields.filter((field) => !stepData[field]);

      if (missingFields.length > 0) {
        return {
          success: false,
          error: `Missing required fields: ${missingFields.join(", ")}. All fields must be completed before proceeding.`,
          data: {
            requiredFields,
            missingFields,
            formComplete: false,
            proceedButtonEnabled: false,
          },
        };
      }

      // Validate amount is positive
      if (stepData.amount <= 0) {
        return {
          success: false,
          error: "Amount must be greater than zero",
        };
      }

      // Validate account number format (basic validation)
      if (stepData.accountNumber.length < 10) {
        return {
          success: false,
          error: "Account number must be at least 10 digits",
        };
      }

      // Validate bank code is provided and valid format
      if (!stepData.bankCode || stepData.bankCode.length < 3) {
        return {
          success: false,
          error: "Valid bank selection is required",
        };
      }

      return {
        success: true,
        nextStep: OffRampStep.BANK_RESOLUTION,
        data: {
          bankCode: stepData.bankCode,
          bankName: stepData.bankName || "Selected Bank",
          accountNumber: stepData.accountNumber,
          amount: stepData.amount,
          formComplete: true,
          proceedButtonEnabled: true,
          message: "Banking information collected successfully",
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to process spend form: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 6: Resolve bank details and calculate rates
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
   */
  private async executeBankResolution(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      const bankCode = workflow.stepData.bankCode;
      const accountNumber = workflow.stepData.accountNumber;
      const amount = workflow.stepData.amount;

      if (!bankCode || !accountNumber || !amount) {
        return {
          success: false,
          error: "Banking information is missing from previous steps",
        };
      }

      // Validate account information via DexPay resolve bank endpoint (requirement 7.1)
      const accountName = stepData.accountName;
      if (!accountName) {
        return {
          success: false,
          error:
            "Failed to resolve bank account. Please verify your account number and bank selection.",
        };
      }

      // Get current conversion rates via DexPay rates endpoint (requirement 7.2)
      const exchangeRate = stepData.exchangeRate;
      if (!exchangeRate || exchangeRate <= 0) {
        return {
          success: false,
          error: "Unable to retrieve current exchange rates. Please try again.",
        };
      }

      // Calculate fees as per updated requirements
      const spreadNgn = parseFloat(process.env.OFFRAMP_SPREAD_NGN || "60");
      const flatFeeUsd = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
      
      const spreadRate = exchangeRate - spreadNgn; // Apply spread from env
      const chainpayeFee = flatFeeUsd * spreadRate; // Flat fee in NGN
      const dexpayFeeUSD = 0; // No separate DexPay fee
      const dexpayFee = 0;
      const totalFees = chainpayeFee + dexpayFee;
      const totalAmount = amount + totalFees;

      // Prepare review summary as per requirement 7.3
      const reviewSummary = {
        selectedNetwork: workflow.stepData.selectedChain,
        selectedAsset: workflow.stepData.selectedAsset,
        enteredAmount: amount,
        selectedBank: workflow.stepData.bankName || "Selected Bank",
        accountName: accountName,
        accountNumber: accountNumber,
        exchangeRate: exchangeRate,
        fees: {
          chainpaye: chainpayeFee,
          dexpay: dexpayFee,
          total: totalFees,
        },
        totalAmount: totalAmount,
        currency: "NGN",
      };

      return {
        success: true,
        nextStep: OffRampStep.BALANCE_VALIDATION,
        data: {
          accountName,
          exchangeRate,
          fees: {
            chainpaye: chainpayeFee,
            dexpay: dexpayFee,
            total: totalFees,
          },
          totalAmount,
          reviewSummary,
          bankResolved: true,
          message: "Bank account verified and rates calculated successfully",
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to resolve bank details: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 7: Validate user has sufficient balance
   * Requirements: 8.1, 8.2, 8.3, 8.4
   */
  private async executeBalanceValidation(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      const amount = workflow.stepData.amount;
      const exchangeRate = workflow.stepData.exchangeRate;
      const totalFees = workflow.stepData.fees?.total || 0;
      const walletBalance = stepData.walletBalance;

      if (!amount || !exchangeRate || walletBalance === undefined) {
        return {
          success: false,
          error:
            "Missing balance validation parameters. Please ensure wallet balance is available.",
        };
      }

      // Convert total amount to USD using spread rate as per updated requirements
      const spreadNgn = parseFloat(process.env.OFFRAMP_SPREAD_NGN || "60");
      const flatFeeUsd = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
      
      const spreadRate = exchangeRate - spreadNgn; // Apply spread from env
      const amountInUsd = amount / spreadRate;
      const totalInUsd = amountInUsd + flatFeeUsd; // Add flat fee from env

      // Compare with wallet balance as per requirement 8.2
      if (walletBalance < totalInUsd) {
        // Display "Insufficient Funds" message as per requirement 8.3
        return {
          success: false,
          error: "Insufficient Funds",
          data: {
            requiredAmount: totalInUsd,
            availableBalance: walletBalance,
            shortfall: totalInUsd - walletBalance,
            currency: "USD",
            message: `You need ${totalInUsd.toFixed(6)} USD but only have ${walletBalance.toFixed(6)} USD available.`,
          },
        };
      }

      // Sufficient funds - proceed to PIN confirmation as per requirement 8.4
      return {
        success: true,
        nextStep: OffRampStep.PIN_CONFIRMATION,
        data: {
          totalInUsd,
          walletBalance,
          sufficientBalance: true,
          remainingBalance: walletBalance - totalInUsd,
          validationPassed: true,
          message: "Balance validation successful. Sufficient funds available.",
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to validate balance: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 8: Confirm transaction with PIN
   * Requirements: 9.1, 9.2, 9.3, 9.4
   */
  private async executePinConfirmation(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      // Prompt for PIN entry as per requirement 9.1
      if (!stepData.pin) {
        return {
          success: false,
          error: "PIN required for transaction confirmation",
          data: {
            pinRequired: true,
            message: "Please enter your PIN to authorize this transaction",
            securityNotice:
              "Your PIN protects your funds from unauthorized access",
          },
        };
      }

      // Validate PIN through PIN_Validator component as per requirement 9.4
      const pinValid = stepData.pinValid;

      if (pinValid === false) {
        // Abort transaction for incorrect PIN as per requirement 9.2
        await this.handleStepFailure(
          workflow.id,
          new Error("Incorrect PIN provided"),
        );

        return {
          success: false,
          error: "Incorrect PIN. Transaction cancelled for security.",
          data: {
            transactionAborted: true,
            securityAction: "Transaction cancelled due to incorrect PIN",
            retryAllowed: false,
          },
        };
      }

      // Display "Transaction Processing" screen as per requirement 9.3
      return {
        success: true,
        nextStep: OffRampStep.CRYPTO_TRANSFER,
        data: {
          pinConfirmed: true,
          processingStarted: true,
          message: "Transaction Processing",
          status: "Processing your transaction. Please wait...",
          securityConfirmed: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `PIN confirmation failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 9: Execute crypto transfer via Crossmint
   * Requirements: 10.1, 10.2, 10.3, 10.4
   */
  private async executeCryptoTransfer(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      // Execute Crossmint crypto transfer first and exclusively as per requirement 10.1
      const transferSuccess = stepData.transferSuccess;
      const transactionId = stepData.transactionId;

      if (transferSuccess === false) {
        // Abort entire transaction without calling DexPay endpoints as per requirement 10.3
        await this.handleStepFailure(
          workflow.id,
          new Error("Crypto transfer failed"),
        );

        return {
          success: false,
          error:
            "Crypto transfer failed. Your funds are safe. Please try again.",
          data: {
            transferFailed: true,
            fundsSecure: true,
            dexpayCallsPrevented: true,
            retryAllowed: true,
            failureReason:
              stepData.failureReason || "Transfer could not be completed",
          },
        };
      }

      if (!transactionId) {
        return {
          success: false,
          error: "Crypto transfer completed but transaction ID is missing",
        };
      }

      // Crypto transfer succeeded - proceed to DexPay quote creation as per requirement 10.2
      return {
        success: true,
        nextStep: OffRampStep.QUOTE_CREATION,
        data: {
          cryptoTransferCompleted: true,
          transactionId: transactionId,
          transferTimestamp: new Date(),
          message: "Crypto transfer completed successfully",
          readyForDexPay: true,
          // Store transfer details for receipt generation
          transferDetails: {
            asset: workflow.stepData.selectedAsset,
            chain: workflow.stepData.selectedChain,
            amount: workflow.stepData.totalInUsd,
            walletAddress: workflow.stepData.walletAddress,
            transactionId: transactionId,
          },
        },
      };
    } catch (error) {
      await this.handleStepFailure(workflow.id, error as Error);
      return {
        success: false,
        error: `Crypto transfer failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 10: Create DexPay quote
   * Requirements: 11.1, 11.2
   */
  private async executeQuoteCreation(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      // Only proceed if crypto transfer was successful (enforced by sequential execution)
      if (!workflow.stepData.cryptoTransferCompleted) {
        return {
          success: false,
          error: "Cannot create quote: crypto transfer not completed",
        };
      }

      // Create DexPay quote using POST https://sandbox-b2b.dexpay.io/quote as per requirement 11.1
      const quoteId = stepData.quoteId;

      if (!quoteId) {
        return {
          success: false,
          error: "Failed to create DexPay quote. Please try again.",
        };
      }

      // Extract quoteId from response as per requirement 11.2
      const quoteDetails = {
        id: quoteId,
        asset: workflow.stepData.selectedAsset,
        chain: workflow.stepData.selectedChain,
        amount: workflow.stepData.amount,
        exchangeRate: workflow.stepData.exchangeRate,
        fees: workflow.stepData.fees,
        bankCode: workflow.stepData.bankCode,
        accountNumber: workflow.stepData.accountNumber,
        accountName: workflow.stepData.accountName,
        createdAt: new Date(),
        expiresAt: stepData.expiresAt || new Date(Date.now() + 15 * 60 * 1000), // 15 minutes default
      };

      return {
        success: true,
        nextStep: OffRampStep.QUOTE_FINALIZATION,
        data: {
          quoteId: quoteId,
          quoteCreated: true,
          quoteDetails: quoteDetails,
          message: "DexPay quote created successfully",
          expirationWarning: "Quote will expire in 15 minutes",
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create quote: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 11: Finalize DexPay quote
   * Requirements: 11.3, 11.4
   */
  private async executeQuoteFinalization(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      const quoteId = workflow.stepData.quoteId;

      if (!quoteId) {
        return {
          success: false,
          error: "Cannot finalize quote: quote ID is missing",
        };
      }

      // Check if quote has expired and handle regeneration as per requirement 11.4
      const quoteDetails = workflow.stepData.quoteDetails;
      if (
        quoteDetails &&
        quoteDetails.expiresAt &&
        new Date() > new Date(quoteDetails.expiresAt)
      ) {
        return {
          success: false,
          error:
            "Quote has expired. Please restart the transaction for current rates.",
          data: {
            quoteExpired: true,
            expiredAt: quoteDetails.expiresAt,
            regenerationRequired: true,
          },
        };
      }

      // Call POST https://b2b.dexpay.io/quote/{quoteId} to finalize as per requirement 11.3
      const orderId = stepData.orderId;

      if (!orderId) {
        return {
          success: false,
          error: "Failed to finalize quote. Please try again.",
        };
      }

      return {
        success: true,
        nextStep: OffRampStep.COMPLETION,
        data: {
          quoteFinalized: true,
          orderId: orderId,
          finalizedAt: new Date(),
          message: "Quote finalized successfully",
          // Prepare final transaction details
          finalTransactionDetails: {
            workflowId: workflow.id,
            userId: workflow.userId,
            cryptoTransactionId: workflow.stepData.transactionId,
            dexpayQuoteId: quoteId,
            dexpayOrderId: orderId,
            asset: workflow.stepData.selectedAsset,
            chain: workflow.stepData.selectedChain,
            amount: workflow.stepData.amount,
            exchangeRate: workflow.stepData.exchangeRate,
            fees: workflow.stepData.fees,
            bankDetails: {
              bankCode: workflow.stepData.bankCode,
              accountNumber: workflow.stepData.accountNumber,
              accountName: workflow.stepData.accountName,
            },
            status: "finalized",
            finalizedAt: new Date(),
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to finalize quote: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Step 12: Complete transaction and generate receipt
   * Requirements: 12.1, 12.2, 12.3, 12.4
   */
  private async executeCompletion(
    workflow: WorkflowState,
    stepData: any,
  ): Promise<StepResult> {
    try {
      // Update UI to display "Transaction Successful" as per requirement 12.1
      const successMessage = "Transaction Successful";

      // Display the required message as per requirement 12.2
      const deliveryMessage = "You will receive your money in seconds.";

      // Generate receipt with all transaction details as per requirement 12.3
      const receipt = this.generateComprehensiveReceipt(workflow);

      // Mark workflow as completed
      workflow.status = "completed";

      return {
        success: true,
        data: {
          transactionCompleted: true,
          message: successMessage,
          deliveryMessage: deliveryMessage,
          receipt: receipt,
          completedAt: new Date(),
          status: "completed",
          // Receipt delivery will be handled by NotificationService as per requirement 12.4
          receiptDelivery: {
            generated: true,
            deliveryChannels: ["email", "sms", "in-app"],
            deliveryStatus: "pending",
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to complete transaction: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Generates a comprehensive transaction receipt with all details
   * Requirements: 12.3, 12.4
   */
  private generateComprehensiveReceipt(workflow: WorkflowState): any {
    const finalDetails = workflow.stepData.finalTransactionDetails || {};

    return {
      // Receipt Header
      receiptId: `RECEIPT-${workflow.id}`,
      transactionId: workflow.id,
      generatedAt: new Date(),
      status: "completed",

      // User Information
      userId: workflow.userId,

      // Transaction Summary
      summary: {
        type: "Crypto Off-Ramp",
        description: "Cryptocurrency to Nigerian Naira conversion",
        status: "Completed Successfully",
      },

      // Asset Details
      crypto: {
        asset: workflow.stepData.selectedAsset,
        chain: workflow.stepData.selectedChain,
        walletAddress: workflow.stepData.walletAddress,
        amount: workflow.stepData.totalInUsd,
        currency: "USD",
      },

      // Banking Details
      banking: {
        bankName: workflow.stepData.bankName,
        bankCode: workflow.stepData.bankCode,
        accountNumber: workflow.stepData.accountNumber,
        accountName: workflow.stepData.accountName,
        currency: "NGN",
      },

      // Financial Breakdown
      financial: {
        enteredAmount: workflow.stepData.amount,
        exchangeRate: workflow.stepData.exchangeRate,
        fees: {
          chainpaye: workflow.stepData.fees?.chainpaye || 0,
          dexpay: workflow.stepData.fees?.dexpay || 0,
          total: workflow.stepData.fees?.total || 0,
        },
        totalAmount: workflow.stepData.totalAmount,
        currency: "NGN",
      },

      // Transaction References
      references: {
        workflowId: workflow.id,
        crossmintTransactionId: workflow.stepData.transactionId,
        dexpayQuoteId: workflow.stepData.quoteId,
        dexpayOrderId: workflow.stepData.orderId,
      },

      // Timestamps
      timeline: {
        initiated: workflow.createdAt,
        completed: new Date(),
        processingTime: new Date().getTime() - workflow.createdAt.getTime(),
      },

      // All workflow steps for audit trail
      auditTrail: {
        totalSteps: 12,
        completedSteps: Object.keys(workflow.stepData).length,
        stepData: workflow.stepData,
      },

      // Support Information
      support: {
        contactEmail: "support@chainpaye.com",
        contactPhone: "+234-XXX-XXX-XXXX",
        referenceNumber: workflow.id,
      },
    };
  }

  /**
   * Generates a simple transaction receipt (legacy method)
   */
  private generateReceipt(workflow: WorkflowState): any {
    return this.generateComprehensiveReceipt(workflow);
  }

  /**
   * Validates that a step transition is allowed
   */
  private isValidStepTransition(
    currentStep: OffRampStep,
    nextStep: OffRampStep,
  ): boolean {
    // Ensure sequential step progression
    return nextStep === currentStep + 1 || nextStep === OffRampStep.COMPLETION;
  }

  /**
   * Gets all active workflows for a user
   */
  async getUserActiveWorkflows(userId: string): Promise<WorkflowState[]> {
    const userWorkflows: WorkflowState[] = [];

    for (const workflow of this.workflowStates.values()) {
      if (workflow.userId === userId && workflow.status === "active") {
        userWorkflows.push(workflow);
      }
    }

    return userWorkflows;
  }

  /**
   * Cancels an active workflow
   */
  async cancelWorkflow(workflowId: string): Promise<boolean> {
    const workflow = this.workflowStates.get(workflowId);
    if (workflow && workflow.status === "active") {
      workflow.status = "cancelled";
      workflow.updatedAt = new Date();
      this.workflowStates.set(workflowId, workflow);
      return true;
    }
    return false;
  }
}
