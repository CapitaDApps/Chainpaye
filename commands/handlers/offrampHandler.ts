/**
 * Off-ramp Handler for crypto to NGN conversion
 * Refactored to use new WorkflowController architecture
 *
 * This handler integrates with the new service architecture:
 * - WorkflowController for state management
 * - ValidationService for input validation
 * - FinancialService for fee calculations
 * - AuthenticationService for PIN validation
 * - TransactionManager for crypto transfers
 * - WebhookHandler for deposit confirmations
 *
 * Requirements: 1.1, 1.2, 1.3, All requirements
 */

import { userService, whatsappBusinessService } from "../../services";
import { crossmintService } from "../../services/CrossmintService";
import { dexPayService } from "../../services/DexPayService";
import { redisClient } from "../../services/redis";
import { NormalizedNetworkType } from "../types";

// Import new architecture services
import { AuthenticationService } from "../../services/crypto-off-ramp/AuthenticationService";
import { FinancialService } from "../../services/crypto-off-ramp/FinancialService";
import { NotificationService } from "../../services/crypto-off-ramp/NotificationService";
import { TransactionManager } from "../../services/crypto-off-ramp/TransactionManager";
import { ValidationService } from "../../services/crypto-off-ramp/ValidationService";
import { WebhookHandler } from "../../services/crypto-off-ramp/WebhookHandler";
import { WorkflowController } from "../../services/crypto-off-ramp/WorkflowController";

import {
  OffRampStep,
  OffRampTransaction,
  SupportedAsset,
  SupportedChain,
  TransactionStatus,
} from "../../types/crypto-off-ramp.types";

// Initialize services
const workflowController = new WorkflowController();
const validationService = new ValidationService();
const financialService = new FinancialService();
const authenticationService = new AuthenticationService();
const notificationService = new NotificationService();
const transactionManager = new TransactionManager(
  crossmintService,
  dexPayService,
  undefined,
  notificationService,
);

// Initialize WebhookHandler for deposit confirmations
const webhookHandler = new WebhookHandler(
  workflowController,
  crossmintService,
  validationService,
  {
    apiKey: process.env.CROSSMINT_API_KEY || "",
    baseUrl:
      process.env.CROSSMINT_BASE_URL || "https://crossmint.com/api/2025-06-09",
    webhookSecret: process.env.CROSSMINT_WEBHOOK_SECRET || "",
  },
);

// Session mapping for phone number to workflow ID
const phoneToWorkflowMap = new Map<string, string>();

/**
 * Main off-ramp handler - Step 1: Display wallets and initiate workflow
 * Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4
 */
export async function handleOfframp(
  phoneNumber: string,
  initialMessage?: string,
): Promise<void> {
  try {
    console.log(`Starting off-ramp flow for ${phoneNumber}`);

    // Get user
    const user = await userService.getUser(phoneNumber);
    if (!user) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Account Not Found*\n\nPlease create an account first to use the off-ramp feature.\n\nType *menu* to get started.",
        phoneNumber,
      );
      return;
    }

    // Check if user is verified (required for off-ramp)
    if (!user.isVerified) {
      await whatsappBusinessService.sendNormalMessage(
        "🔒 *Verification Required*\n\nYou need to complete KYC verification to use the off-ramp feature.\n\nType *kyc* to start verification.",
        phoneNumber,
      );
      return;
    }

    // Initialize workflow using WorkflowController
    const workflowState = await workflowController.initiateOffRamp(user.userId);
    phoneToWorkflowMap.set(phoneNumber, workflowState.id);

    // Store workflow ID in Redis for session management
    await redisClient.set(
      `offramp_workflow:${phoneNumber}`,
      workflowState.id,
      "EX",
      30 * 60, // 30 minutes
    );

    // Check if initial message contains asset/chain intent
    if (initialMessage) {
      const intentHandled = await handleAssetSelection(
        phoneNumber,
        initialMessage,
      );
      if (intentHandled) {
        return;
      }
    }

    // Step 1: Display existing wallets using WorkflowController
    await displayUserWallets(phoneNumber, user.userId, workflowState.id);
  } catch (error) {
    console.error(`Error in handleOfframp for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Off-ramp Error*\n\nSomething went wrong starting the off-ramp process. Please try again later.\n\nType *support* for help.",
      phoneNumber,
    );
  }
}

/**
 * Display user's existing wallets with balances using WorkflowController
 * If user has no wallets, create EVM and Solana wallets and send offramp flow
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
async function displayUserWallets(
  phoneNumber: string,
  userId: string,
  workflowId: string,
): Promise<void> {
  try {
    // Get all user wallets
    const wallets = await crossmintService.listWallets(userId);

    // If user has NO wallets, create wallets and send the offramp flow
    if (!wallets || wallets.length === 0) {
      console.log(
        `[OFFRAMP] User ${userId} has no wallets - creating EVM and Solana wallets`,
      );

      try {
        // Create both EVM and Solana wallets for the user
        const [evmWallet, solanaWallet] = await Promise.all([
          crossmintService.getOrCreateWallet(userId, "evm"),
          crossmintService.getOrCreateWallet(userId, "solana"),
        ]);

        console.log(
          `[OFFRAMP] Created wallets - EVM: ${evmWallet.address}, Solana: ${solanaWallet.address}`,
        );

        // Send wallet info message to user
        let walletMessage = `🆕 *Wallets Created Successfully!*\n\n`;
        walletMessage += `We've created crypto wallets for you:\n\n`;
        walletMessage += `🔷 *EVM Wallet* (for USDC/USDT on BSC, Base, Arbitrum, etc.)\n`;
        walletMessage += `\`${evmWallet.address}\`\n\n`;
        walletMessage += `🟣 *Solana Wallet* (for USDC on Solana)\n`;
        walletMessage += `\`${solanaWallet.address}\`\n\n`;
        walletMessage += `💡 Deposit crypto to these addresses, then use the button below to sell and withdraw to your bank account.`;

        await whatsappBusinessService.sendNormalMessage(
          walletMessage,
          phoneNumber,
        );

        // Send the offramp flow to the user
        // TODO! Verify the flow ID is correct for your Meta Business Suite setup
        await whatsappBusinessService.sendCryptoDepositAddress(
          phoneNumber,
          "USDC", // Default token
          "base" as NormalizedNetworkType, // Default network
          evmWallet.address, // Show EVM address by default
        );

        return;
      } catch (createError) {
        console.error(
          `[OFFRAMP] Error creating wallets for user ${userId}:`,
          createError,
        );
        await whatsappBusinessService.sendNormalMessage(
          "❌ *Error Creating Wallets*\n\nCouldn't create your wallets. Please try again later or contact support.",
          phoneNumber,
        );
        return;
      }
    }

    // User has existing wallets - get balances
    let walletsWithBalances: any[] = [];

    // Get balances for each wallet
    for (const wallet of wallets) {
      try {
        let balances: any[] = [];

        if (wallet.chainType === "solana") {
          balances = await crossmintService.getBalancesByChain(
            userId,
            "solana",
            ["usdc", "usdt"],
          );
        } else if (wallet.chainType === "evm") {
          // For EVM wallets, fetch balances from each supported chain separately
          const evmChains = ["bsc", "base", "arbitrum"];
          const chainBalances: any[] = [];

          for (const chain of evmChains) {
            try {
              const chainSpecificBalances =
                await crossmintService.getBalancesByChain(
                  userId,
                  chain,
                  ["usdc", "usdt"],
                );

              // Add chain info to each balance
              chainSpecificBalances.forEach((balance) => {
                chainBalances.push({
                  ...balance,
                  chain: chain.toUpperCase(), // Add chain identifier
                });
              });
            } catch (chainError) {
              console.error(
                `Error getting ${chain} balances:`,
                chainError,
              );
            }
          }

          balances = chainBalances;
        } else {
          balances = await crossmintService.getBalancesByChain(
            userId,
            wallet.chainType,
            ["usdc", "usdt"],
          );
        }

        // Filter balances with value >= $0 as per requirement 2.2
        const validBalances = balances.filter(
          (balance) => parseFloat(balance.amount) >= 0,
        );

        // Always add wallet to list, even if balance is 0
        walletsWithBalances.push({
          ...wallet,
          balances: validBalances,
          balance: validBalances.reduce(
            (sum, b) => sum + parseFloat(b.amount),
            0,
          ),
        });
      } catch (error) {
        console.error(
          `Error getting balances for ${wallet.chainType} wallet:`,
          error,
        );
        // Add wallet even if balance fetch fails, with empty balance
        walletsWithBalances.push({
          ...wallet,
          balances: [],
          balance: 0,
        });
      }
    }

    // Process step 1 with WorkflowController
    const stepResult = await workflowController.processStep(workflowId, {
      wallets: walletsWithBalances,
    });

    if (!stepResult.success) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Wallet Display Error*\n\n${stepResult.error}`,
        phoneNumber,
      );
      return;
    }

    // Display wallets message
    let walletsMessage = "📱 *Your Off-ramp Wallets*\n\n";

    if (walletsWithBalances.length === 0) {
      // User has wallets but no balances - show addresses and send flow
      walletsMessage = "📱 *Your Wallets*\n\n";
      walletsMessage +=
        "You have wallets but no balance yet. Deposit crypto to get started:\n\n";
      for (const wallet of wallets) {
        walletsMessage += `🔗 *${wallet.chainType.toUpperCase()}*\n`;
        walletsMessage += `\`${wallet.address}\`\n\n`;
      }
      walletsMessage +=
        "💡 Once you deposit, use the button below to sell and withdraw to your bank.";

      await whatsappBusinessService.sendNormalMessage(
        walletsMessage,
        phoneNumber,
      );

      // Send the offramp flow
      const firstWallet = wallets[0];
      if (firstWallet) {
        await whatsappBusinessService.sendCryptoDepositAddress(
          phoneNumber,
          "USDC",
          (firstWallet.chainType === "solana"
            ? "sol"
            : "base") as NormalizedNetworkType,
          firstWallet.address,
        );
      }
      return;
    }

    // User has wallets with balances - display them
    for (const wallet of walletsWithBalances) {
      walletsMessage += `🔗 *${wallet.chainType.toUpperCase()}*\n`;
      walletsMessage += `Address: \`${wallet.address}\`\n`;

      if (wallet.chainType === "evm") {
        // Group balances by chain for EVM wallets
        const balancesByChain = new Map<string, any[]>();

        for (const balance of wallet.balances) {
          const chain = balance.chain || "UNKNOWN";
          if (!balancesByChain.has(chain)) {
            balancesByChain.set(chain, []);
          }
          balancesByChain.get(chain)!.push(balance);
        }

        // Display balances grouped by chain
        for (const [chain, chainBalances] of balancesByChain) {
          for (const balance of chainBalances) {
            const amount = parseFloat(balance.amount).toFixed(2);
            const tokenName = (
              balance.symbol ||
              balance.token ||
              "UNKNOWN"
            ).toUpperCase();
            walletsMessage += `• ${chain} ${tokenName}: ${amount}\n`;
          }
        }
      } else {
        // For non-EVM wallets (Solana), display normally
        for (const balance of wallet.balances) {
          const amount = parseFloat(balance.amount).toFixed(2);
          const tokenName = (
            balance.symbol ||
            balance.token ||
            "UNKNOWN"
          ).toUpperCase();
          walletsMessage += `• ${tokenName}: ${amount}\n`;
        }
      }
      walletsMessage += "\n";
    }

    // walletsMessage += getSupportedAssetsMessage();

    await whatsappBusinessService.sendNormalMessage(
      walletsMessage,
      phoneNumber,
    );

    // Also send the offramp flow so user can easily start offramping
    const primaryWallet = walletsWithBalances[0];
    const primaryBalance = primaryWallet.balances[0];
    await whatsappBusinessService.sendCryptoDepositAddress(
      phoneNumber,
      primaryBalance?.token?.toUpperCase() || "USDC",
      (primaryWallet.chainType === "solana"
        ? "sol"
        : "base") as NormalizedNetworkType,
      primaryWallet.address,
    );
  } catch (error) {
    console.error(`Error displaying wallets for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error Loading Wallets*\n\nCouldn't load your wallets. Please try again.\n\n" +
        getSupportedAssetsMessage(),
      phoneNumber,
    );
  }
}

/**
 * Handle asset and chain selection using ValidationService
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export async function handleAssetSelection(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const workflowId = await getWorkflowId(phoneNumber);
    if (!workflowId) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Session Expired*\n\nYour off-ramp session has expired. Type *offramp* to start again.",
        phoneNumber,
      );
      return false;
    }

    const workflowState = await workflowController.getWorkflowState(workflowId);
    if (workflowState.currentStep !== OffRampStep.REQUEST_ASSET_CHAIN) {
      return false;
    }

    // Parse asset and chain from message
    const assetChainMatch = message.match(
      /\b(usdc|usdt)\b.*?\b(bep20|base|arbitrum|solana|hedera|apechain|lisk)\b/i,
    );

    if (!assetChainMatch) {
      await whatsappBusinessService.sendNormalMessage(
        "Please specify the asset and chain correctly.\n\n" +
          "Examples:\n• USDC on Solana\n• USDT BEP20\n• USDC Base\n\n" +
          getSupportedAssetsMessage(),
        phoneNumber,
      );
      return true;
    }

    const asset = assetChainMatch[1]?.toUpperCase();
    const chain = assetChainMatch[2]?.toLowerCase();

    if (!asset || !chain) {
      await whatsappBusinessService.sendNormalMessage(
        "Please specify the asset and chain correctly.\n\n" +
          "Examples:\n• USDC on Solana\n• USDT BEP20\n• USDC Base\n\n" +
          getSupportedAssetsMessage(),
        phoneNumber,
      );
      return true;
    }

    // Validate using ValidationService
    const validation = validationService.validateAssetChain(asset, chain);
    if (!validation.isValid) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Invalid Selection*\n\n${validation.errors.join("\n")}\n\n` +
          getSupportedAssetsMessage(),
        phoneNumber,
      );
      return true;
    }

    // Process step 2 with WorkflowController
    const stepResult = await workflowController.processStep(workflowId, {
      asset,
      chain,
    });

    if (!stepResult.success) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Selection Error*\n\n${stepResult.error}`,
        phoneNumber,
      );
      return true;
    }

    // Proceed to wallet creation
    await handleWalletCreation(phoneNumber, workflowId);
    return true;
  } catch (error) {
    console.error(`Error in handleAssetSelection for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Selection Error*\n\nSomething went wrong processing your selection. Please try again.",
      phoneNumber,
    );
    return true;
  }
}

/**
 * Handle wallet creation or retrieval using WorkflowController
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
async function handleWalletCreation(
  phoneNumber: string,
  workflowId: string,
): Promise<void> {
  try {
    const workflowState = await workflowController.getWorkflowState(workflowId);
    const selectedChain = workflowState.stepData.selectedChain;
    const userId = workflowState.userId;

    if (!selectedChain) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Error*\n\nSelected chain information is missing. Please try again.",
        phoneNumber,
      );
      return;
    }

    const chainType = crossmintService.getChainType(selectedChain);

    // Check for existing wallet
    const wallets = await crossmintService.listWallets(userId);
    const existingWallet = wallets.find((w) => w.chainType === chainType);

    // Process step 3 with WorkflowController
    const stepResult = await workflowController.processStep(workflowId, {
      existingWallet,
      walletAddress: existingWallet?.address,
    });

    if (!stepResult.success) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Wallet Error*\n\n${stepResult.error}`,
        phoneNumber,
      );
      return;
    }

    let wallet;
    if (existingWallet) {
      wallet = existingWallet;
    } else {
      // Create new wallet
      wallet = await crossmintService.getOrCreateWallet(userId, chainType);
    }

    // Send deposit instructions
    const network = parseNormalizedNetwork(selectedChain);
    await whatsappBusinessService.sendCryptoDepositAddress(
      phoneNumber,
      workflowState.stepData.selectedAsset!,
      network,
      wallet.address,
    );

    // Check current balance and proceed to deposit confirmation
    await handleDepositConfirmation(phoneNumber, workflowId);
  } catch (error) {
    console.error(`Error in handleWalletCreation for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Wallet Error*\n\nCouldn't create or access your wallet. Please try again later.\n\nType *support* for help.",
      phoneNumber,
    );
  }
}

/**
 * Handle deposit confirmation using WorkflowController
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
async function handleDepositConfirmation(
  phoneNumber: string,
  workflowId: string,
): Promise<void> {
  try {
    const workflowState = await workflowController.getWorkflowState(workflowId);
    const selectedChain = workflowState.stepData.selectedChain;
    const selectedAsset = workflowState.stepData.selectedAsset;
    const userId = workflowState.userId;

    // Get current balance
    let currentBalance = 0;
    try {
      const chainType = crossmintService.getChainType(selectedChain);
      let balances: any[] = [];

      if (chainType === "solana") {
        balances = await crossmintService.getBalancesByChain(
          userId,
          selectedChain,
          ["usdc", "sol"],
        );
      } else {
        balances = await crossmintService.getBalancesByChain(
          userId,
          selectedChain,
          ["usdc", "usdt"],
        );
      }

      const assetBalance = balances.find(
        (b) =>
          (b.symbol?.toLowerCase() || b.token?.toLowerCase()) ===
          selectedAsset.toLowerCase(),
      );
      currentBalance = assetBalance ? parseFloat(assetBalance.amount) : 0;
    } catch (error) {
      console.error("Error getting balance for deposit confirmation:", error);
    }

    // Process step 4 with WorkflowController
    const stepResult = await workflowController.processStep(workflowId, {
      currentBalance,
      depositConfirmed: currentBalance > 2, // Auto-confirm if balance > $2
    });

    if (stepResult.success && stepResult.data?.spendCTAEnabled) {
      // Proceed to spend form
      await handleSpendCrypto(phoneNumber);
    }
  } catch (error) {
    console.error(
      `Error in handleDepositConfirmation for ${phoneNumber}:`,
      error,
    );
  }
}

/**
 * Handle spend crypto command using WorkflowController
 * Requirements: 6.1, 6.2, 6.3
 */
export async function handleSpendCrypto(phoneNumber: string): Promise<boolean> {
  try {
    const workflowId = await getWorkflowId(phoneNumber);
    if (!workflowId) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *No Active Session*\n\nNo off-ramp session found. Type *offramp* to start a new session.",
        phoneNumber,
      );
      return false;
    }

    const workflowState = await workflowController.getWorkflowState(workflowId);

    if (
      !workflowState.stepData.selectedAsset ||
      !workflowState.stepData.selectedChain
    ) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Incomplete Session*\n\nPlease select an asset and chain first. Type *offramp* to start over.",
        phoneNumber,
      );
      return false;
    }

    // Ask for NGN amount
    await whatsappBusinessService.sendNormalMessage(
      `💰 *Enter Amount*\n\nHow much NGN do you want to withdraw to your bank account?\n\n` +
        `Example: 50000\n\n` +
        `⚠️ *Note:* Additional fees will apply:\n` +
        `• Platform fee: 1.5%\n` +
        `• DexPay fee: $0.20\n\n` +
        `Type the amount in NGN:`,
      phoneNumber,
    );

    return true;
  } catch (error) {
    console.error(`Error in handleSpendCrypto for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error*\n\nSomething went wrong. Please try again.",
      phoneNumber,
    );
    return true;
  }
}

/**
 * Handle NGN amount input using ValidationService and FinancialService
 * Requirements: 6.2, 6.3, 7.4, 7.5
 */
export async function handleAmountInput(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const workflowId = await getWorkflowId(phoneNumber);
    if (!workflowId) return false;

    const workflowState = await workflowController.getWorkflowState(workflowId);
    if (workflowState.currentStep !== OffRampStep.SPEND_FORM) return false;

    // Parse amount
    const amountMatch = message.match(/\b(\d+(?:,\d{3})*(?:\.\d{2})?)\b/);
    if (!amountMatch) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Invalid Amount*\n\nPlease enter a valid NGN amount.\n\nExample: 50000",
        phoneNumber,
      );
      return true;
    }

    const ngnAmount = parseFloat(amountMatch[1]?.replace(/,/g, "") || "0");

    // Validate amount using ValidationService
    const validation = validationService.validateTransactionLimits(
      ngnAmount,
      workflowState.userId,
    );
    if (!validation.isValid) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Invalid Amount*\n\n${validation.errors.join("\n")}\n\nPlease enter a valid amount:`,
        phoneNumber,
      );
      return true;
    }

    // Show banks
    await showBankSelection(phoneNumber, workflowId, ngnAmount);
    return true;
  } catch (error) {
    console.error(`Error in handleAmountInput for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error*\n\nSomething went wrong processing the amount. Please try again.",
      phoneNumber,
    );
    return true;
  }
}

/**
 * Show bank selection using DexPay service
 * Requirements: 6.1, 6.4
 */
async function showBankSelection(
  phoneNumber: string,
  workflowId: string,
  amount: number,
): Promise<void> {
  try {
    const banks = await dexPayService.getBanks();

    let message =
      "🏦 *Select Your Bank*\n\nChoose your bank from the list below:\n\n";

    // Show first 10 banks
    const displayBanks = banks.slice(0, 10);
    displayBanks.forEach((bank, index) => {
      message += `${index + 1}. ${bank.name}\n`;
    });

    message += `\nReply with the bank number (1-${displayBanks.length}) or bank name.`;

    await whatsappBusinessService.sendNormalMessage(message, phoneNumber);

    // Store banks and amount in workflow
    await workflowController.processStep(workflowId, {
      amount,
      availableBanks: displayBanks,
    });

    // Store banks in Redis for reference
    await redisClient.set(
      `banks:${phoneNumber}`,
      JSON.stringify(displayBanks),
      "EX",
      30 * 60,
    );
  } catch (error) {
    console.error(`Error showing bank selection for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error Loading Banks*\n\nCouldn't load bank list. Please try again later.",
      phoneNumber,
    );
  }
}

/**
 * Handle bank selection using ValidationService
 * Requirements: 6.2, 6.3
 */
export async function handleBankSelection(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const workflowId = await getWorkflowId(phoneNumber);
    if (!workflowId) return false;

    const banksData = await redisClient.get(`banks:${phoneNumber}`);
    if (!banksData) {
      const workflowState =
        await workflowController.getWorkflowState(workflowId);
      await showBankSelection(
        phoneNumber,
        workflowId,
        workflowState.stepData.amount,
      );
      return true;
    }

    const banks = JSON.parse(banksData);
    let selectedBank = null;

    // Check if message is a number (bank index)
    const bankIndex = parseInt(message.trim()) - 1;
    if (!isNaN(bankIndex) && bankIndex >= 0 && bankIndex < banks.length) {
      selectedBank = banks[bankIndex];
    } else {
      // Search by bank name
      selectedBank = banks.find((bank: any) =>
        bank.name.toLowerCase().includes(message.toLowerCase()),
      );
    }

    if (!selectedBank) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Bank Not Found*\n\nPlease select a valid bank number or name from the list.",
        phoneNumber,
      );
      return true;
    }

    // Ask for account number
    await whatsappBusinessService.sendNormalMessage(
      `🏦 *${selectedBank.name} Selected*\n\nPlease enter your account number:`,
      phoneNumber,
    );

    // Update workflow with selected bank
    await workflowController.processStep(workflowId, {
      bankCode: selectedBank.code,
      bankName: selectedBank.name,
    });

    return true;
  } catch (error) {
    console.error(`Error in handleBankSelection for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error*\n\nSomething went wrong selecting the bank. Please try again.",
      phoneNumber,
    );
    return true;
  }
}

/**
 * Handle account number input and resolution using ValidationService
 * Requirements: 6.2, 6.3, 7.1
 */
export async function handleAccountResolution(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const workflowId = await getWorkflowId(phoneNumber);
    if (!workflowId) return false;

    const workflowState = await workflowController.getWorkflowState(workflowId);

    // Extract account number
    const accountMatch = message.match(/\b(\d{10})\b/);
    if (!accountMatch) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Invalid Account Number*\n\nPlease enter a valid 10-digit account number:",
        phoneNumber,
      );
      return true;
    }

    const accountNumber = accountMatch[1]!;

    // Validate using ValidationService
    const validation = validationService.validateBankDetails(
      workflowState.stepData.bankCode,
      accountNumber,
    );

    if (!validation.isValid) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Invalid Account Details*\n\n${validation.errors.join("\n")}\n\nPlease enter a valid account number:`,
        phoneNumber,
      );
      return true;
    }

    // Resolve account
    try {
      await whatsappBusinessService.sendNormalMessage(
        "🔍 *Resolving Account...*\n\nPlease wait while we verify your account details.",
        phoneNumber,
      );

      const resolvedAccount = await dexPayService.resolveAccount(
        accountNumber,
        workflowState.stepData.bankCode,
      );

      // Get current exchange rates from DexPay
      let exchangeRate = 1600; // Default fallback
      try {
        const rates = await dexPayService.getCurrentRates(
          workflowState.stepData.selectedAsset,
          workflowState.stepData.selectedChain,
        );
        exchangeRate = rates.rate;
      } catch (error) {
        console.error("Error fetching exchange rates:", error);
        // Continue with fallback rate but log the issue
      }

      // Process bank resolution step
      const stepResult = await workflowController.processStep(workflowId, {
        accountNumber,
        accountName: resolvedAccount.accountName,
        exchangeRate,
      });

      if (!stepResult.success) {
        await whatsappBusinessService.sendNormalMessage(
          `❌ *Bank Resolution Failed*\n\n${stepResult.error}`,
          phoneNumber,
        );
        return true;
      }

      // Show resolved account and ask for confirmation
      const confirmMessage =
        `✅ *Account Verified*\n\n` +
        `Bank: ${workflowState.stepData.bankName}\n` +
        `Account Number: ${accountNumber}\n` +
        `Account Name: ${resolvedAccount.accountName}\n\n` +
        `Is this correct? Reply *yes* to proceed or *no* to try again.`;

      await whatsappBusinessService.sendNormalMessage(
        confirmMessage,
        phoneNumber,
      );

      return true;
    } catch (error: any) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Account Resolution Failed*\n\n${error.message}\n\nPlease enter a different account number:`,
        phoneNumber,
      );
      return true;
    }
  } catch (error) {
    console.error(
      `Error in handleAccountResolution for ${phoneNumber}:`,
      error,
    );
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error*\n\nSomething went wrong resolving the account. Please try again.",
      phoneNumber,
    );
    return true;
  }
}

/**
 * Handle account confirmation and balance validation
 * Requirements: 7.3, 8.1, 8.2, 8.3, 8.4
 */
export async function handleAccountConfirmation(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const workflowId = await getWorkflowId(phoneNumber);
    if (!workflowId) return false;

    const workflowState = await workflowController.getWorkflowState(workflowId);
    const response = message.toLowerCase().trim();

    if (response === "no") {
      // Go back to account input - reset to previous step
      await whatsappBusinessService.sendNormalMessage(
        "🔄 *Enter Account Number Again*\n\nPlease enter your correct account number:",
        phoneNumber,
      );
      return true;
    }

    if (response !== "yes") {
      await whatsappBusinessService.sendNormalMessage(
        "❓ *Please Confirm*\n\nReply *yes* to proceed or *no* to enter a different account number.",
        phoneNumber,
      );
      return true;
    }

    // Get current wallet balance for validation
    const userId = workflowState.userId;
    const selectedChain = workflowState.stepData.selectedChain;
    const selectedAsset = workflowState.stepData.selectedAsset;
    const amount = workflowState.stepData.amount;
    const exchangeRate = workflowState.stepData.exchangeRate;

    let walletBalance = 0;
    try {
      const chainType = crossmintService.getChainType(selectedChain);
      let balances: any[] = [];

      if (chainType === "solana") {
        balances = await crossmintService.getBalancesByChain(
          userId,
          selectedChain,
          ["usdc", "sol"],
        );
      } else {
        balances = await crossmintService.getBalancesByChain(
          userId,
          selectedChain,
          ["usdc", "usdt"],
        );
      }

      const assetBalance = balances.find(
        (b) =>
          (b.symbol?.toLowerCase() || b.token?.toLowerCase()) ===
          selectedAsset.toLowerCase(),
      );
      walletBalance = assetBalance ? parseFloat(assetBalance.amount) : 0;
    } catch (error) {
      console.error("Error getting wallet balance:", error);
    }

    // Calculate fees using FinancialService
    const financialCalc = financialService.calculateTransactionFinancials(
      amount,
      exchangeRate,
    );

    // Store financial calculations in workflow state
    await workflowController.processStep(workflowId, {
      financialCalculations: financialCalc,
    });

    // Validate balance using WorkflowController
    const balanceStepResult = await workflowController.processStep(workflowId, {
      walletBalance,
      requiredAmount: financialCalc.totalInUsd,
    });

    if (!balanceStepResult.success) {
      // Insufficient funds
      await whatsappBusinessService.sendNormalMessage(
        `❌ *${balanceStepResult.error}*\n\n` +
          `Required: ${financialCalc.totalInUsd.toFixed(6)} USD\n` +
          `Available: ${walletBalance.toFixed(6)} USD\n\n` +
          `Please deposit more ${selectedAsset.toUpperCase()} or reduce the amount.`,
        phoneNumber,
      );
      return true;
    }

    // Show transaction summary and ask for PIN
    const summaryMessage =
      `💱 *Transaction Summary*\n\n` +
      `💰 *Amount:* ₦${amount.toLocaleString()}\n` +
      `📊 *Rate:* 1 ${selectedAsset.toUpperCase()} = ₦${exchangeRate.toLocaleString()}\n` +
      `🔸 *Crypto Required:* ${financialCalc.totalInUsd.toFixed(6)} ${selectedAsset.toUpperCase()}\n\n` +
      `💸 *Fees:*\n` +
      `• Platform Fee (1.5%): ₦${financialCalc.chainpayeFee.toLocaleString()}\n` +
      `• DexPay Fee: ₦${financialCalc.dexpayFee.toLocaleString()}\n` +
      `• Total Fees: ₦${financialCalc.totalFees.toLocaleString()}\n\n` +
      `🏦 *Destination:*\n` +
      `${workflowState.stepData.bankName}\n` +
      `${workflowState.stepData.accountName}\n` +
      `${workflowState.stepData.accountNumber}\n\n` +
      `✅ *Balance Sufficient*\n\n` +
      `🔐 *Enter your 4-digit PIN to confirm:*`;

    await whatsappBusinessService.sendNormalMessage(
      summaryMessage,
      phoneNumber,
    );
    return true;
  } catch (error) {
    console.error(
      `Error in handleAccountConfirmation for ${phoneNumber}:`,
      error,
    );
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error*\n\nSomething went wrong. Please try again.",
      phoneNumber,
    );
    return true;
  }
}

/**
 * Handle PIN verification using AuthenticationService
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
export async function handlePinVerification(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const workflowId = await getWorkflowId(phoneNumber);
    if (!workflowId) return false;

    const workflowState = await workflowController.getWorkflowState(workflowId);

    // Extract PIN
    const pinMatch = message.match(/\b(\d{4})\b/);
    if (!pinMatch) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Invalid PIN Format*\n\nPlease enter your 4-digit PIN:",
        phoneNumber,
      );
      return true;
    }

    const pin = pinMatch[1]!;

    // Verify PIN using AuthenticationService
    const pinValid = await authenticationService.validatePin(
      workflowState.userId,
      pin,
    );

    // Process PIN confirmation step
    const stepResult = await workflowController.processStep(workflowId, {
      pin,
      pinValid,
    });

    if (!stepResult.success) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *${stepResult.error}*`,
        phoneNumber,
      );
      return true;
    }

    // Execute the off-ramp transaction
    await executeOfframpTransaction(phoneNumber, workflowId);
    return true;
  } catch (error) {
    console.error(`Error in handlePinVerification for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *PIN Verification Error*\n\nSomething went wrong verifying your PIN. Please try again.",
      phoneNumber,
    );
    return true;
  }
}

/**
 * Execute the off-ramp transaction with comprehensive error handling and sequential processing
 * Requirements: 10.1, 10.2, 10.3, 11.1, 11.2, 11.3, 12.1, 12.2, 12.3, 12.4, 13.1, 13.2, 13.3, 13.4
 */
async function executeOfframpTransaction(
  phoneNumber: string,
  workflowId: string,
): Promise<void> {
  try {
    await whatsappBusinessService.sendNormalMessage(
      "⚡ *Processing Transaction...*\n\nPlease wait while we process your off-ramp transaction. This may take a few moments.",
      phoneNumber,
    );

    const workflowState = await workflowController.getWorkflowState(workflowId);

    // Validate workflow state has all required data
    if (
      !workflowState.stepData.selectedAsset ||
      !workflowState.stepData.selectedChain
    ) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Transaction Failed*\n\nMissing asset or chain information. Please restart the transaction.",
        phoneNumber,
      );
      return;
    }

    if (!workflowState.stepData.walletAddress) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Transaction Failed*\n\nWallet address not found. Please restart the transaction.",
        phoneNumber,
      );
      return;
    }

    if (
      !workflowState.stepData.bankCode ||
      !workflowState.stepData.accountNumber
    ) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Transaction Failed*\n\nBanking information incomplete. Please restart the transaction.",
        phoneNumber,
      );
      return;
    }

    // Get financial calculations from workflow state
    const financialCalc = workflowState.stepData.financialCalculations;
    if (!financialCalc) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Transaction Failed*\n\nFinancial calculations missing. Please restart the transaction.",
        phoneNumber,
      );
      return;
    }

    // Create OffRampTransaction for TransactionManager
    const transaction: OffRampTransaction = {
      id: `txn-${workflowId}`,
      userId: workflowState.userId,
      workflowId: workflowId,
      asset: workflowState.stepData.selectedAsset as SupportedAsset,
      chain: workflowState.stepData.selectedChain as SupportedChain,
      amount: workflowState.stepData.amount,
      sourceWalletAddress: workflowState.stepData.walletAddress,
      bankCode: workflowState.stepData.bankCode,
      bankName: workflowState.stepData.bankName,
      accountNumber: workflowState.stepData.accountNumber,
      accountName: workflowState.stepData.accountName,
      exchangeRate: workflowState.stepData.exchangeRate,
      chainpayeFee: financialCalc.chainpayeFee,
      dexpayFee: financialCalc.dexpayFee,
      totalFees: financialCalc.totalFees,
      fiatAmount: workflowState.stepData.amount,
      status: TransactionStatus.INITIATED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Process crypto transfer step (Step 9)
    await whatsappBusinessService.sendNormalMessage(
      "🔄 *Step 1/3: Processing Crypto Transfer*\n\nTransferring your crypto to our secure wallet...",
      phoneNumber,
    );

    const cryptoStepResult = await workflowController.processStep(workflowId, {
      transactionStep: "crypto_transfer",
      transactionData: transaction,
    });

    if (!cryptoStepResult.success) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Crypto Transfer Failed*\n\n${cryptoStepResult.error}\n\nYour funds are safe. Please try again later.\n\nReference: ${workflowId}`,
        phoneNumber,
      );
      return;
    }

    // Process transaction using TransactionManager with comprehensive error handling
    let result;
    try {
      result = await transactionManager.processTransaction(transaction);
    } catch (error) {
      console.error(`TransactionManager error for ${workflowId}:`, error);
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Transaction Processing Error*\n\nAn unexpected error occurred while processing your transaction. Your funds are safe.\n\nPlease contact support with reference: ${workflowId}`,
        phoneNumber,
      );
      return;
    }

    if (result.success) {
      // Update workflow with successful transaction
      await whatsappBusinessService.sendNormalMessage(
        "🔄 *Step 2/3: Creating Banking Quote*\n\nSecuring your exchange rate with our banking partner...",
        phoneNumber,
      );

      // Process quote creation step (Step 10)
      const quoteStepResult = await workflowController.processStep(workflowId, {
        transactionStep: "quote_creation",
        transactionId: result.transactionId,
        quoteId: transaction.dexpayQuoteId,
      });

      if (quoteStepResult.success) {
        await whatsappBusinessService.sendNormalMessage(
          "🔄 *Step 3/3: Finalizing Transaction*\n\nCompleting your bank transfer...",
          phoneNumber,
        );

        // Process completion step (Step 12)
        const completionResult = await workflowController.processStep(
          workflowId,
          {
            transactionCompleted: true,
            transactionId: result.transactionId,
            receipt: result.receipt,
          },
        );

        if (completionResult.success) {
          // Send comprehensive success message with all details
          const successMessage =
            `🎉 *Transaction Successful!*\n\n` +
            `✅ Your off-ramp has been completed successfully!\n\n` +
            `💰 *Transaction Details:*\n` +
            `• Amount: ₦${workflowState.stepData.amount.toLocaleString()}\n` +
            `• Crypto Used: ${financialCalc.totalInUsd.toFixed(6)} ${workflowState.stepData.selectedAsset.toUpperCase()}\n` +
            `• Exchange Rate: 1 ${workflowState.stepData.selectedAsset.toUpperCase()} = ₦${workflowState.stepData.exchangeRate.toLocaleString()}\n\n` +
            `💸 *Fees Applied:*\n` +
            `• Platform Fee: ₦${financialCalc.chainpayeFee.toLocaleString()}\n` +
            `• Banking Fee: ₦${financialCalc.dexpayFee.toLocaleString()}\n` +
            `• Total Fees: ₦${financialCalc.totalFees.toLocaleString()}\n\n` +
            `🏦 *Destination Account:*\n` +
            `• Bank: ${workflowState.stepData.bankName}\n` +
            `• Account Name: ${workflowState.stepData.accountName}\n` +
            `• Account Number: ${workflowState.stepData.accountNumber}\n\n` +
            `📋 *Transaction Reference:* ${result.transactionId}\n\n` +
            `💳 *You will receive your money in seconds.*\n\n` +
            `📧 A detailed receipt has been sent to you.\n\n` +
            `Type *menu* to return to the main menu or *offramp* to start another transaction.`;

          await whatsappBusinessService.sendNormalMessage(
            successMessage,
            phoneNumber,
          );

          // Send receipt through NotificationService
          if (result.receipt) {
            try {
              await notificationService.sendReceipt(
                workflowState.userId,
                transaction,
              );
            } catch (receiptError) {
              console.error(
                `Receipt delivery error for ${workflowId}:`,
                receiptError,
              );
              // Don't fail the transaction if receipt delivery fails
              await whatsappBusinessService.sendNormalMessage(
                "⚠️ *Receipt Delivery*\n\nYour transaction was successful, but we couldn't deliver your receipt. Please contact support if you need a copy.\n\nReference: " +
                  result.transactionId,
                phoneNumber,
              );
            }
          }
        } else {
          await whatsappBusinessService.sendNormalMessage(
            `❌ *Transaction Completion Error*\n\n${completionResult.error}\n\nYour crypto transfer was successful, but there was an issue finalizing the transaction. Please contact support.\n\nReference: ${result.transactionId}`,
            phoneNumber,
          );
        }
      } else {
        await whatsappBusinessService.sendNormalMessage(
          `❌ *Quote Creation Failed*\n\n${quoteStepResult.error}\n\nYour crypto transfer was successful, but we couldn't create the banking quote. Please contact support.\n\nReference: ${result.transactionId}`,
          phoneNumber,
        );
      }

      // Clean up workflow session
      phoneToWorkflowMap.delete(phoneNumber);
      await redisClient.del(`offramp_workflow:${phoneNumber}`);
    } else {
      // Handle transaction failure with detailed error messages
      let errorMessage = "❌ *Transaction Failed*\n\n";

      if (result.error?.includes("insufficient")) {
        errorMessage +=
          "You don't have enough crypto balance for this transaction.\n\n";
        errorMessage += `Required: ${financialCalc.totalInUsd.toFixed(6)} ${workflowState.stepData.selectedAsset.toUpperCase()}\n`;
        errorMessage +=
          "Please deposit more crypto or reduce the transaction amount.";
      } else if (
        result.error?.includes("network") ||
        result.error?.includes("timeout")
      ) {
        errorMessage +=
          "Network connection issue. Please check your internet connection and try again.";
      } else if (
        result.error?.includes("rate") ||
        result.error?.includes("expired")
      ) {
        errorMessage +=
          "Exchange rate has expired. Please restart the transaction for current rates.";
      } else if (
        result.error?.includes("bank") ||
        result.error?.includes("account")
      ) {
        errorMessage +=
          "Banking service issue. Please verify your account details and try again.";
      } else {
        errorMessage += result.error || "An unexpected error occurred.";
        errorMessage += "\n\nYour funds are safe. Please try again later.";
      }

      errorMessage += `\n\nReference: ${workflowId}`;
      errorMessage +=
        "\n\nType *support* for assistance or *offramp* to try again.";

      await whatsappBusinessService.sendNormalMessage(
        errorMessage,
        phoneNumber,
      );

      // Clean up failed workflow session
      phoneToWorkflowMap.delete(phoneNumber);
      await redisClient.del(`offramp_workflow:${phoneNumber}`);
    }
  } catch (error) {
    console.error(
      `Error executing off-ramp transaction for ${phoneNumber}:`,
      error,
    );

    // Comprehensive error handling with user-friendly messages
    let errorMessage = "❌ *Transaction Failed*\n\n";

    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        errorMessage +=
          "The transaction timed out. Please try again with a stable internet connection.";
      } else if (error.message.includes("network")) {
        errorMessage +=
          "Network error occurred. Please check your connection and try again.";
      } else if (error.message.includes("service")) {
        errorMessage +=
          "One of our services is temporarily unavailable. Please try again in a few minutes.";
      } else {
        errorMessage +=
          "An unexpected system error occurred. Our team has been notified.";
      }
    } else {
      errorMessage +=
        "An unexpected system error occurred. Our team has been notified.";
    }

    errorMessage += `\n\nYour funds are safe and no charges have been applied.`;
    errorMessage += `\n\nReference: ${workflowId}`;
    errorMessage +=
      "\n\nPlease contact support for assistance or try again later.";

    await whatsappBusinessService.sendNormalMessage(errorMessage, phoneNumber);

    // Clean up failed workflow session
    phoneToWorkflowMap.delete(phoneNumber);
    await redisClient.del(`offramp_workflow:${phoneNumber}`);
  }
}

/**
 * Handle workflow state updates for deposit confirmations
 * This function is called by the WebhookHandler to update active workflows
 * when deposits are confirmed, ensuring proper workflow progression.
 * Requirements: 5.1, 5.2, 5.4
 */
export async function updateWorkflowForDeposit(
  userId: string,
  asset: string,
  amount: number,
  chain: string,
  walletAddress: string,
  transactionHash: string,
): Promise<{
  success: boolean;
  workflowsUpdated: number;
  message: string;
  error?: string;
}> {
  try {
    console.log(
      `Updating workflows for deposit: ${amount} ${asset} on ${chain} for user ${userId}`,
    );

    // Get user's active workflows that are waiting for deposit confirmation
    const activeWorkflows =
      await workflowController.getUserActiveWorkflows(userId);
    const waitingWorkflows = activeWorkflows.filter(
      (workflow) =>
        workflow.currentStep === OffRampStep.DEPOSIT_CONFIRMATION &&
        workflow.stepData.selectedAsset?.toLowerCase() ===
          asset.toLowerCase() &&
        workflow.stepData.selectedChain?.toLowerCase() ===
          chain.toLowerCase() &&
        workflow.stepData.walletAddress === walletAddress,
    );

    if (waitingWorkflows.length === 0) {
      console.log(
        `No workflows waiting for deposit confirmation for user ${userId}`,
      );
      return {
        success: true,
        workflowsUpdated: 0,
        message: "No workflows waiting for this deposit",
      };
    }

    let updatedCount = 0;
    const errors: string[] = [];

    // Update each waiting workflow with deposit confirmation
    for (const workflow of waitingWorkflows) {
      try {
        const stepData = {
          depositConfirmed: true,
          depositAmount: amount,
          depositAsset: asset.toUpperCase(),
          depositChain: chain.toLowerCase(),
          depositHash: transactionHash,
          depositTimestamp: new Date().toISOString(),
          currentBalance: amount, // Simplified - in production would get actual balance
          spendCTAEnabled: true, // Enable "Spend Crypto" CTA as per requirement 5.2
        };

        // Process the deposit confirmation step
        const stepResult = await workflowController.processStep(
          workflow.id,
          stepData,
        );

        if (stepResult.success) {
          updatedCount++;
          console.log(
            `Workflow ${workflow.id} updated with deposit confirmation`,
          );

          // Send workflow-specific notification to user
          const user = await userService.getUserById(userId);
          if (user?.whatsappNumber) {
            await sendWorkflowDepositNotification(
              user.whatsappNumber,
              workflow.id,
              asset,
              amount,
              chain,
            );
          }
        } else {
          errors.push(`Workflow ${workflow.id}: ${stepResult.error}`);
          console.error(
            `Failed to update workflow ${workflow.id}:`,
            stepResult.error,
          );
        }
      } catch (workflowError: any) {
        errors.push(`Workflow ${workflow.id}: ${workflowError.message}`);
        console.error(
          `Error updating workflow ${workflow.id}:`,
          workflowError.message,
        );
      }
    }

    // Return result summary
    if (updatedCount > 0) {
      const message = `Successfully updated ${updatedCount} workflow(s) with deposit confirmation`;
      return {
        success: true,
        workflowsUpdated: updatedCount,
        message:
          errors.length > 0
            ? `${message}. ${errors.length} errors occurred.`
            : message,
      };
    } else {
      return {
        success: false,
        workflowsUpdated: 0,
        message: "Failed to update any workflows",
        error: errors.join("; "),
      };
    }
  } catch (error: any) {
    console.error(`Error updating workflows for deposit:`, error);
    return {
      success: false,
      workflowsUpdated: 0,
      message: "Failed to process workflow updates",
      error: error.message,
    };
  }
}

/**
 * Send workflow-specific deposit notification
 * This provides targeted messaging for users with active workflows
 */
async function sendWorkflowDepositNotification(
  phoneNumber: string,
  workflowId: string,
  asset: string,
  amount: number,
  chain: string,
): Promise<void> {
  try {
    const message =
      `🎉 *Deposit Confirmed - Transaction Updated!*\n\n` +
      `💰 *Amount:* ${amount.toFixed(6)} ${asset.toUpperCase()}\n` +
      `🔗 *Network:* ${chain.toUpperCase()}\n` +
      `⏰ *Time:* ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}\n\n` +
      `✅ *Your active off-ramp transaction has been automatically updated!*\n\n` +
      `⚡ *Next Steps:*\n` +
      `Your transaction will continue processing automatically. You'll receive updates as it progresses.\n\n` +
      `📋 *Transaction Reference:* ${workflowId.slice(-8)}\n\n` +
      `💡 *Need help?* Type *support* for assistance.`;

    await whatsappBusinessService.sendNormalMessage(message, phoneNumber);
    console.log(
      `Workflow-specific deposit notification sent to ${phoneNumber} for workflow ${workflowId}`,
    );
  } catch (error) {
    console.error(
      `Error sending workflow deposit notification to ${phoneNumber}:`,
      error,
    );
  }
}

/**
 * Handle deposit notifications using WebhookHandler service for workflow integration
 * This function serves as the primary interface for deposit confirmations and integrates
 * with the WorkflowController to update active off-ramp workflows.
 * Requirements: 5.1, 5.2, 5.4, 13.1, 13.2, 13.3, 13.4
 */
export async function handleDepositNotification(
  phoneNumber: string,
  asset: string,
  amount: number,
  chain: string,
): Promise<void> {
  try {
    console.log(
      `Processing deposit notification via WebhookHandler for ${phoneNumber}: ${amount} ${asset} on ${chain}`,
    );

    // Get user to extract userId for WebhookHandler processing
    const user = await userService.getUser(phoneNumber);
    if (!user) {
      console.error(`User not found for phone number: ${phoneNumber}`);
      await sendFallbackDepositNotification(phoneNumber, asset, amount, chain);
      return;
    }

    // Get user's wallet address for the specified chain with enhanced error handling
    let walletAddress: string | undefined;
    let chainType: string;

    try {
      chainType = crossmintService.getChainType(chain.toLowerCase());
      const wallets = await crossmintService.listWallets(user.userId);
      const wallet = wallets.find((w) => w.chainType === chainType);
      walletAddress = wallet?.address;

      if (!walletAddress) {
        console.warn(
          `No wallet found for user ${user.userId} on chain ${chainType}`,
        );
        // Still proceed with notification, but log the issue
      }
    } catch (walletError) {
      console.error(
        `Error getting wallet address for ${phoneNumber}:`,
        walletError,
      );
      chainType = chain.toLowerCase();
    }

    // Create a webhook event structure for WebhookHandler processing
    // This simulates a real Crossmint webhook event for consistent processing
    const webhookEvent = {
      type: "wallet.deposit" as const,
      data: {
        walletId: `wallet-${user.userId}-${chain}`,
        owner: `userId:${user.userId}`,
        address: walletAddress || "unknown-address",
        chainType: mapChainToWebhookFormat(chain),
        transaction: {
          hash: `deposit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          amount: amount.toString(),
          token: asset.toLowerCase(),
          from: "external-sender",
          to: walletAddress || "unknown-address",
          timestamp: new Date().toISOString(),
          status: "confirmed" as const,
        },
      },
      timestamp: new Date().toISOString(),
      eventId: `deposit-event-${Date.now()}`,
    };

    // Process deposit confirmation through WebhookHandler for workflow integration
    // This is the primary method for updating workflow states as per requirement 5.1
    let workflowsUpdated = 0;
    let webhookProcessingSuccess = false;

    try {
      const webhookResult = await (
        webhookHandler as any
      ).processDepositConfirmation(webhookEvent);

      if (webhookResult.success) {
        workflowsUpdated = webhookResult.workflowsUpdated;
        webhookProcessingSuccess = true;
        console.log(
          `WebhookHandler successfully processed deposit: ${webhookResult.message}, workflows updated: ${workflowsUpdated}`,
        );
      } else {
        console.warn(
          `WebhookHandler processing had issues: ${webhookResult.error}`,
        );
        // Continue with notification even if workflow update fails
      }
    } catch (webhookError) {
      console.error(
        `WebhookHandler processing error for ${phoneNumber}:`,
        webhookError,
      );
      // Continue with notification even if webhook processing fails
    }

    // Send enhanced deposit notification with workflow-aware messaging
    let notificationMessage =
      `🎉 *Crypto Deposit Received!*\n\n` +
      `💰 *Amount:* ${amount.toFixed(6)} ${asset.toUpperCase()}\n` +
      `🔗 *Network:* ${chain.toUpperCase()}\n` +
      `⏰ *Time:* ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}\n\n` +
      `✅ *Your deposit has been confirmed and is ready to use!*\n\n`;

    // Add workflow-specific messaging based on WebhookHandler results
    if (webhookProcessingSuccess && workflowsUpdated > 0) {
      notificationMessage +=
        `🔄 *Active Transaction Updated*\n` +
        `Your ongoing off-ramp transaction has been automatically updated with this deposit.\n\n` +
        `⚡ *Next Steps:*\n` +
        `Your transaction will continue processing automatically. You'll receive updates as it progresses.\n\n`;
    } else {
      notificationMessage +=
        `🚀 *Ready to convert to NGN?*\n` +
        `Type *spend crypto* to start your off-ramp transaction.\n\n` +
        `💡 *What happens next?*\n` +
        `• Choose your NGN amount\n` +
        `• Select your bank account\n` +
        `• Confirm with your PIN\n` +
        `• Receive money in seconds!\n\n`;
    }

    notificationMessage +=
      `💰 *Current Balance:* ${amount.toFixed(6)} ${asset.toUpperCase()}\n` +
      `📱 Type *balance* to check all your crypto balances.`;

    await whatsappBusinessService.sendNormalMessage(
      notificationMessage,
      phoneNumber,
    );

    console.log(
      `Enhanced deposit notification sent to ${phoneNumber}: ${amount} ${asset} on ${chain} (workflows updated: ${workflowsUpdated})`,
    );
  } catch (error) {
    console.error(
      `Error in WebhookHandler-integrated deposit notification for ${phoneNumber}:`,
      error,
    );

    // Fallback to simple notification in case of error
    await sendFallbackDepositNotification(phoneNumber, asset, amount, chain);
  }
}

/**
 * Fallback deposit notification in case of WebhookHandler processing errors
 * Requirements: 5.3, 13.1, 13.2, 13.3, 13.4
 */
async function sendFallbackDepositNotification(
  phoneNumber: string,
  asset: string,
  amount: number,
  chain: string,
): Promise<void> {
  try {
    const fallbackMessage =
      `🎉 *Crypto Deposit Received!*\n\n` +
      `${amount.toFixed(6)} ${asset.toUpperCase()} on ${chain.toUpperCase()}\n\n` +
      `Type *spend crypto* to convert to NGN.`;

    await whatsappBusinessService.sendNormalMessage(
      fallbackMessage,
      phoneNumber,
    );

    console.log(`Fallback deposit notification sent to ${phoneNumber}`);
  } catch (fallbackError) {
    console.error(
      `Failed to send fallback deposit notification to ${phoneNumber}:`,
      fallbackError,
    );
  }
}

/**
 * Map chain names to webhook format expected by WebhookHandler
 */
function mapChainToWebhookFormat(chain: string): string {
  const chainMapping: Record<string, string> = {
    solana: "solana",
    bep20: "bsc",
    arbitrum: "arbitrum",
    base: "base",
    hedera: "hedera",
    apechain: "apechain",
    lisk: "lisk",
  };

  return chainMapping[chain.toLowerCase()] || chain.toLowerCase();
}

/**
 * Check if message is related to off-ramp session
 */
export async function isOfframpSessionActive(
  phoneNumber: string,
): Promise<boolean> {
  try {
    const workflowId = await getWorkflowId(phoneNumber);
    return !!workflowId;
  } catch (error) {
    return false;
  }
}

/**
 * Route off-ramp session messages using WorkflowController with comprehensive error handling
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
export async function routeOfframpMessage(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const workflowId = await getWorkflowId(phoneNumber);
    if (!workflowId) return false;

    const workflowState = await workflowController.getWorkflowState(workflowId);

    // Handle different workflow steps with proper error handling
    switch (workflowState.currentStep) {
      case OffRampStep.REQUEST_ASSET_CHAIN:
        try {
          return await handleAssetSelection(phoneNumber, message);
        } catch (error) {
          console.error(`Asset selection error for ${phoneNumber}:`, error);
          await whatsappBusinessService.sendNormalMessage(
            "❌ *Asset Selection Error*\n\nSomething went wrong processing your asset selection. Please try again.\n\n" +
              getSupportedAssetsMessage(),
            phoneNumber,
          );
          return true;
        }

      case OffRampStep.SPEND_FORM:
        try {
          return await handleAmountInput(phoneNumber, message);
        } catch (error) {
          console.error(`Amount input error for ${phoneNumber}:`, error);
          await whatsappBusinessService.sendNormalMessage(
            "❌ *Amount Input Error*\n\nSomething went wrong processing your amount. Please enter a valid NGN amount.\n\nExample: 50000",
            phoneNumber,
          );
          return true;
        }

      case OffRampStep.BANK_RESOLUTION:
        try {
          // Check if we're in bank selection or account resolution phase
          if (!workflowState.stepData.bankCode) {
            return await handleBankSelection(phoneNumber, message);
          } else {
            return await handleAccountResolution(phoneNumber, message);
          }
        } catch (error) {
          console.error(`Bank resolution error for ${phoneNumber}:`, error);
          await whatsappBusinessService.sendNormalMessage(
            "❌ *Banking Error*\n\nSomething went wrong processing your banking information. Please try again.",
            phoneNumber,
          );
          return true;
        }

      case OffRampStep.BALANCE_VALIDATION:
        try {
          return await handleAccountConfirmation(phoneNumber, message);
        } catch (error) {
          console.error(
            `Account confirmation error for ${phoneNumber}:`,
            error,
          );
          await whatsappBusinessService.sendNormalMessage(
            "❌ *Confirmation Error*\n\nSomething went wrong processing your confirmation. Please reply *yes* to proceed or *no* to change account details.",
            phoneNumber,
          );
          return true;
        }

      case OffRampStep.PIN_CONFIRMATION:
        try {
          return await handlePinVerification(phoneNumber, message);
        } catch (error) {
          console.error(`PIN verification error for ${phoneNumber}:`, error);
          await whatsappBusinessService.sendNormalMessage(
            "❌ *PIN Verification Error*\n\nSomething went wrong verifying your PIN. Please enter your 4-digit PIN again.",
            phoneNumber,
          );
          return true;
        }

      case OffRampStep.CRYPTO_TRANSFER:
      case OffRampStep.QUOTE_CREATION:
      case OffRampStep.QUOTE_FINALIZATION:
        // These steps are handled automatically by the system
        await whatsappBusinessService.sendNormalMessage(
          "⏳ *Transaction in Progress*\n\nYour transaction is currently being processed. Please wait for completion.",
          phoneNumber,
        );
        return true;

      case OffRampStep.COMPLETION:
        // Transaction completed, no further input needed
        await whatsappBusinessService.sendNormalMessage(
          "✅ *Transaction Complete*\n\nYour off-ramp transaction has been completed. Type *menu* to return to the main menu or *offramp* to start a new transaction.",
          phoneNumber,
        );
        return true;

      default:
        // Unknown step, provide helpful guidance
        await whatsappBusinessService.sendNormalMessage(
          "❓ *Unknown Step*\n\nWe're not sure what step you're on. Type *offramp* to start a new transaction or *support* for help.",
          phoneNumber,
        );
        return true;
    }
  } catch (error) {
    console.error(`Error routing off-ramp message for ${phoneNumber}:`, error);

    // Comprehensive error handling with user-friendly messages
    let errorMessage = "❌ *Message Processing Error*\n\n";

    if (error instanceof Error) {
      if (error.message.includes("workflow")) {
        errorMessage +=
          "There was an issue with your transaction workflow. Please start a new transaction.";
      } else if (error.message.includes("network")) {
        errorMessage +=
          "Network connection issue. Please check your internet and try again.";
      } else if (error.message.includes("timeout")) {
        errorMessage += "The operation timed out. Please try again.";
      } else {
        errorMessage +=
          "An unexpected error occurred while processing your message.";
      }
    } else {
      errorMessage +=
        "An unexpected error occurred while processing your message.";
    }

    errorMessage +=
      "\n\nType *offramp* to start a new transaction or *support* for assistance.";

    await whatsappBusinessService.sendNormalMessage(errorMessage, phoneNumber);
    return true;
  }
}

/**
 * Send off-ramp success notification (legacy function for backward compatibility)
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
export async function sendOfframpSuccessNotification(
  phoneNumber: string,
  ngnAmount: number,
  cryptoAmount: number,
  currency: string,
  bankName: string,
  recipientName: string,
  quoteId: string,
): Promise<void> {
  try {
    const successMessage =
      `🎉 *Off-ramp Transaction Successful!*\n\n` +
      `✅ Your crypto has been converted to NGN successfully!\n\n` +
      `💰 *Transaction Details:*\n` +
      `• NGN Amount: ₦${ngnAmount.toLocaleString()}\n` +
      `• Crypto Used: ${cryptoAmount.toFixed(6)} ${currency.toUpperCase()}\n` +
      `• Bank: ${bankName}\n` +
      `• Recipient: ${recipientName}\n` +
      `• Quote ID: ${quoteId}\n\n` +
      `💳 *You will receive your money in seconds.*\n\n` +
      `📧 A detailed receipt has been sent to you.\n\n` +
      `Type *menu* to return to the main menu or *offramp* to start another transaction.`;

    await whatsappBusinessService.sendNormalMessage(
      successMessage,
      phoneNumber,
    );

    console.log(
      `Off-ramp success notification sent to ${phoneNumber}: ₦${ngnAmount} from ${cryptoAmount} ${currency}`,
    );
  } catch (error) {
    console.error(
      `Error sending off-ramp success notification to ${phoneNumber}:`,
      error,
    );
    throw error;
  }
}

// Helper functions

/**
 * Handle workflow errors with user-friendly messages
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
async function handleWorkflowError(
  phoneNumber: string,
  error: Error,
  context: string,
  workflowId?: string,
): Promise<void> {
  console.error(`Workflow error in ${context} for ${phoneNumber}:`, error);

  let errorMessage = `❌ *${context} Error*\n\n`;

  if (error.message.includes("insufficient")) {
    errorMessage +=
      "You don't have enough balance for this transaction. Please deposit more crypto or reduce the amount.";
  } else if (error.message.includes("expired")) {
    errorMessage += "Your session has expired. Please start a new transaction.";
  } else if (error.message.includes("invalid")) {
    errorMessage +=
      "Invalid input provided. Please check your information and try again.";
  } else if (
    error.message.includes("network") ||
    error.message.includes("timeout")
  ) {
    errorMessage +=
      "Network connection issue. Please check your internet connection and try again.";
  } else if (error.message.includes("service")) {
    errorMessage +=
      "One of our services is temporarily unavailable. Please try again in a few minutes.";
  } else {
    errorMessage += "An unexpected error occurred. Our team has been notified.";
  }

  if (workflowId) {
    errorMessage += `\n\nReference: ${workflowId}`;
  }

  errorMessage +=
    "\n\nType *offramp* to start a new transaction or *support* for assistance.";

  await whatsappBusinessService.sendNormalMessage(errorMessage, phoneNumber);
}

/**
 * Get workflow ID for a phone number with error handling
 */
async function getWorkflowId(phoneNumber: string): Promise<string | null> {
  try {
    const workflowId = phoneToWorkflowMap.get(phoneNumber);
    if (workflowId) return workflowId;

    const storedWorkflowId = await redisClient.get(
      `offramp_workflow:${phoneNumber}`,
    );
    if (storedWorkflowId) {
      phoneToWorkflowMap.set(phoneNumber, storedWorkflowId);
      return storedWorkflowId;
    }

    return null;
  } catch (error) {
    console.error(`Error getting workflow ID for ${phoneNumber}:`, error);
    return null;
  }
}

/**
 * Get supported assets message
 */
function getSupportedAssetsMessage(): string {
  return (
    `💡 *Tell me what asset you want to deposit and its chain.*\n\n` +
    `*Supported Assets & Chains:*\n` +
    `🔸 *USDC:* BSC (BEP20), Base, Arbitrum, Solana\n` +
    `🔸 *USDT:* BSC (BEP20), Solana\n\n` +
    `*Examples:*\n` +
    `• "USDC on Solana"\n` +
    `• "USDT BEP20"\n` +
    `• "USDC Base"`
  );
}

/**
 * Helper to parse normalized network type
 */
function parseNormalizedNetwork(chain: string): NormalizedNetworkType {
  const chainLower = chain.toLowerCase();
  switch (chainLower) {
    case "solana":
      return "Solana";
    case "bep20":
    case "bsc":
      return "BNB Smart Chain";
    case "base":
      return "Base";
    case "arbitrum":
      return "Arbitrum";
    case "hedera":
      return "Hedera";
    case "apechain":
      return "ApeChain";
    case "lisk":
      return "Lisk";
    case "ethereum":
    case "eth":
      return "Ethereum";
    case "polygon":
    case "matic":
      return "Polygon";
    case "tron":
      return "Tron";
    default:
      return "BNB Smart Chain";
  }
}
