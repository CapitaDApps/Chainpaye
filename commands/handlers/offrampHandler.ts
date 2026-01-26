/**
 * Off-ramp Handler for crypto to NGN conversion
 * Handles the complete off-ramp flow using Crossmint and DexPay
 */

import { userService, whatsappBusinessService } from "../../services";
import { crossmintService } from "../../services/CrossmintService";
import { dexPayService } from "../../services/DexPayService";
import { redisClient } from "../../services/redis";

interface OfframpSession {
  step:
    | "ASSET_SELECTION"
    | "DEPOSIT_WAITING"
    | "AMOUNT_INPUT"
    | "BANK_SELECTION"
    | "ACCOUNT_RESOLUTION"
    | "QUOTE_GENERATION"
    | "CONFIRMATION"
    | "PIN_VERIFICATION";
  userId: string;
  phoneNumber: string;
  selectedAsset?: string;
  selectedChain?: string;
  walletAddress?: string;
  ngnAmount?: number;
  selectedBank?: any;
  accountNumber?: string;
  resolvedAccount?: any;
  quote?: any;
  createdAt: number;
}

/**
 * Main off-ramp handler - Step 1: Display wallets and prompt for asset selection
 */
export async function handleOfframp(phoneNumber: string): Promise<void> {
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

    // Initialize off-ramp session
    const session: OfframpSession = {
      step: "ASSET_SELECTION",
      userId: user.userId,
      phoneNumber,
      createdAt: Date.now(),
    };

    await redisClient.set(
      `offramp_session:${phoneNumber}`,
      JSON.stringify(session),
      "EX",
      30 * 60, // 30 minutes
    );

    // Step 1: Display existing wallets
    await displayUserWallets(phoneNumber, user.userId);
  } catch (error) {
    console.error(`Error in handleOfframp for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Off-ramp Error*\n\nSomething went wrong starting the off-ramp process. Please try again later.\n\nType *support* for help.",
      phoneNumber,
    );
  }
}

/**
 * Display user's existing wallets with balances
 */
async function displayUserWallets(
  phoneNumber: string,
  userId: string,
): Promise<void> {
  try {
    // Get all user wallets
    const wallets = await crossmintService.listWallets(userId);

    if (wallets.length === 0) {
      await whatsappBusinessService.sendNormalMessage(
        "📱 *No Wallets Found*\n\nYou don't have any off-ramp wallets yet. When you select an asset and chain, we'll create a wallet for you.\n\n" +
          getSupportedAssetsMessage(),
        phoneNumber,
      );
      return;
    }

    let walletsMessage = "📱 *Your Off-ramp Wallets*\n\n";
    let hasBalances = false;

    // Get balances for each wallet
    for (const wallet of wallets) {
      try {
        let balances: any[] = [];

        if (wallet.chainType === "solana") {
          balances = await crossmintService.getBalancesByChain(
            userId,
            "solana",
            ["usdc", "sol"],
          );
        } else {
          balances = await crossmintService.getBalancesByChain(
            userId,
            wallet.chainType,
            ["usdc", "usdt"],
          );
        }

        // Filter balances with value > 0
        const nonZeroBalances = balances.filter(
          (balance) => parseFloat(balance.amount) > 0,
        );

        if (nonZeroBalances.length > 0) {
          hasBalances = true;
          walletsMessage += `🔗 *${wallet.chainType.toUpperCase()}*\n`;
          walletsMessage += `Address: \`${wallet.address}\`\n`;

          for (const balance of nonZeroBalances) {
            const amount = parseFloat(balance.amount).toFixed(6);
            const usdValue = balance.usdValue
              ? ` (~$${balance.usdValue.toFixed(2)})`
              : "";
            walletsMessage += `• ${balance.token.toUpperCase()}: ${amount}${usdValue}\n`;
          }
          walletsMessage += "\n";
        }
      } catch (error) {
        console.error(
          `Error getting balances for ${wallet.chainType} wallet:`,
          error,
        );
      }
    }

    if (!hasBalances) {
      walletsMessage += "⚠️ All wallets have zero balance.\n\n";
    }

    walletsMessage += getSupportedAssetsMessage();

    await whatsappBusinessService.sendNormalMessage(
      walletsMessage,
      phoneNumber,
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
 * Handle asset and chain selection
 */
export async function handleAssetSelection(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`offramp_session:${phoneNumber}`);
    if (!sessionData) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Session Expired*\n\nYour off-ramp session has expired. Type *offramp* to start again.",
        phoneNumber,
      );
      return false;
    }

    const session: OfframpSession = JSON.parse(sessionData);
    if (session.step !== "ASSET_SELECTION") {
      return false;
    }

    // Parse asset and chain from message (e.g., "USDC on Solana", "USDT BEP20")
    const assetChainMatch = message.match(
      /\b(usdc|usdt)\b.*?\b(bep20|base|arbitrium|solana|hedera|apechain|lisk)\b/i,
    );

    if (!assetChainMatch) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Invalid Format*\n\nPlease specify the asset and chain correctly.\n\n" +
          "Examples:\n• USDC on Solana\n• USDT BEP20\n• USDC Base\n\n" +
          getSupportedAssetsMessage(),
        phoneNumber,
      );
      return true;
    }

    const asset = assetChainMatch[1]?.toLowerCase();
    const chain = assetChainMatch[2]?.toLowerCase();

    if (!asset || !chain) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Invalid Format*\n\nPlease specify the asset and chain correctly.\n\n" +
          "Examples:\n• USDC on Solana\n• USDT BEP20\n• USDC Base\n\n" +
          getSupportedAssetsMessage(),
        phoneNumber,
      );
      return true;
    }

    // Validate asset and chain combination
    if (!dexPayService.isSupportedAssetChain(asset, chain)) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Unsupported Combination*\n\n${asset.toUpperCase()} is not supported on ${chain.toUpperCase()}.\n\n` +
          getSupportedAssetsMessage(),
        phoneNumber,
      );
      return true;
    }

    // Update session
    session.selectedAsset = asset;
    session.selectedChain = chain;
    session.step = "DEPOSIT_WAITING";

    await redisClient.set(
      `offramp_session:${phoneNumber}`,
      JSON.stringify(session),
      "EX",
      30 * 60,
    );

    // Get or create wallet for the selected chain
    await handleWalletCreation(phoneNumber, session);

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
 * Handle wallet creation or retrieval
 */
async function handleWalletCreation(
  phoneNumber: string,
  session: OfframpSession,
): Promise<void> {
  try {
    const chainType = crossmintService.getChainType(session.selectedChain!);

    // Get or create wallet
    const wallet = await crossmintService.getOrCreateWallet(
      session.userId,
      chainType,
    );

    // Get current balance
    let balances: any[] = [];
    try {
      if (chainType === "solana") {
        balances = await crossmintService.getBalancesByChain(
          session.userId,
          session.selectedChain!,
          ["usdc", "sol"],
        );
      } else {
        balances = await crossmintService.getBalancesByChain(
          session.userId,
          session.selectedChain!,
          ["usdc", "usdt"],
        );
      }
    } catch (error) {
      console.error("Error getting balances:", error);
    }

    // Find balance for selected asset
    const assetBalance = balances.find(
      (b) => b.token.toLowerCase() === session.selectedAsset,
    );
    const currentBalance = assetBalance ? parseFloat(assetBalance.amount) : 0;
    const usdValue = assetBalance?.usdValue || 0;

    // Update session with wallet address
    session.walletAddress = wallet.address;
    await redisClient.set(
      `offramp_session:${phoneNumber}`,
      JSON.stringify(session),
      "EX",
      30 * 60,
    );

    // Send deposit instructions
    const selectedAsset = session.selectedAsset!;
    const selectedChain = session.selectedChain!;
    const message =
      `🏦 *${selectedAsset.toUpperCase()} Wallet Ready*\n\n` +
      `Chain: ${selectedChain.toUpperCase()}\n` +
      `Address: \`${wallet.address}\`\n\n` +
      `Current Balance: ${currentBalance.toFixed(6)} ${selectedAsset.toUpperCase()}` +
      (usdValue > 0 ? ` (~$${usdValue.toFixed(2)})` : "") +
      "\n\n" +
      `📥 *Deposit Instructions*\n` +
      `Send ${selectedAsset.toUpperCase()} on ${selectedChain.toUpperCase()} to the address above.\n\n` +
      `⚠️ *Important:*\n` +
      `• Only send ${selectedAsset.toUpperCase()} on ${selectedChain.toUpperCase()} network\n` +
      `• Sending other tokens or wrong network will result in loss\n` +
      `• You'll receive a notification when deposit is detected\n\n` +
      `After depositing, you can type *spend crypto* to continue.`;

    await whatsappBusinessService.sendNormalMessage(message, phoneNumber);
  } catch (error) {
    console.error(`Error in handleWalletCreation for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Wallet Error*\n\nCouldn't create or access your wallet. Please try again later.\n\nType *support* for help.",
      phoneNumber,
    );
  }
}

/**
 * Handle spend crypto command
 */
export async function handleSpendCrypto(phoneNumber: string): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`offramp_session:${phoneNumber}`);
    if (!sessionData) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *No Active Session*\n\nNo off-ramp session found. Type *offramp* to start a new session.",
        phoneNumber,
      );
      return false;
    }

    const session: OfframpSession = JSON.parse(sessionData);

    if (!session.selectedAsset || !session.selectedChain) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Incomplete Session*\n\nPlease select an asset and chain first. Type *offramp* to start over.",
        phoneNumber,
      );
      return false;
    }

    // Update session step
    session.step = "AMOUNT_INPUT";
    await redisClient.set(
      `offramp_session:${phoneNumber}`,
      JSON.stringify(session),
      "EX",
      30 * 60,
    );

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
 * Handle NGN amount input
 */
export async function handleAmountInput(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`offramp_session:${phoneNumber}`);
    if (!sessionData) return false;

    const session: OfframpSession = JSON.parse(sessionData);
    if (session.step !== "AMOUNT_INPUT") return false;

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

    if (ngnAmount < 1000) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Minimum Amount*\n\nMinimum withdrawal amount is ₦1,000.\n\nPlease enter a higher amount:",
        phoneNumber,
      );
      return true;
    }

    if (ngnAmount > 5000000) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Maximum Amount*\n\nMaximum withdrawal amount is ₦5,000,000.\n\nPlease enter a lower amount:",
        phoneNumber,
      );
      return true;
    }

    // Update session
    session.ngnAmount = ngnAmount;
    session.step = "BANK_SELECTION";
    await redisClient.set(
      `offramp_session:${phoneNumber}`,
      JSON.stringify(session),
      "EX",
      30 * 60,
    );

    // Show banks
    await showBankSelection(phoneNumber);

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
 * Show bank selection
 */
async function showBankSelection(phoneNumber: string): Promise<void> {
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
 * Get supported assets message
 */
function getSupportedAssetsMessage(): string {
  return (
    `💡 *Tell me what asset you want to deposit and its chain.*\n\n` +
    `*Supported Assets & Chains:*\n` +
    `🔸 *USDC:* BEP20, Base, Arbitrium, Solana, Hedera, ApeChain, Lisk\n` +
    `🔸 *USDT:* BEP20, Arbitrium, Solana, Hedera, ApeChain, Lisk\n\n` +
    `*Examples:*\n` +
    `• "USDC on Solana"\n` +
    `• "USDT BEP20"\n` +
    `• "USDC Base"`
  );
}

/**
 * Handle bank selection
 */
export async function handleBankSelection(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`offramp_session:${phoneNumber}`);
    if (!sessionData) return false;

    const session: OfframpSession = JSON.parse(sessionData);
    if (session.step !== "BANK_SELECTION") return false;

    const banksData = await redisClient.get(`banks:${phoneNumber}`);
    if (!banksData) {
      await showBankSelection(phoneNumber);
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

    // Update session
    session.selectedBank = selectedBank;
    session.step = "ACCOUNT_RESOLUTION";
    await redisClient.set(
      `offramp_session:${phoneNumber}`,
      JSON.stringify(session),
      "EX",
      30 * 60,
    );

    // Ask for account number
    await whatsappBusinessService.sendNormalMessage(
      `🏦 *${selectedBank.name} Selected*\n\nPlease enter your account number:`,
      phoneNumber,
    );

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
 * Handle account number input and resolution
 */
export async function handleAccountResolution(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`offramp_session:${phoneNumber}`);
    if (!sessionData) return false;

    const session: OfframpSession = JSON.parse(sessionData);
    if (session.step !== "ACCOUNT_RESOLUTION") return false;

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
    session.accountNumber = accountNumber;

    // Resolve account
    try {
      await whatsappBusinessService.sendNormalMessage(
        "🔍 *Resolving Account...*\n\nPlease wait while we verify your account details.",
        phoneNumber,
      );

      const resolvedAccount = await dexPayService.resolveAccount(
        accountNumber!,
        session.selectedBank!.code,
      );

      session.resolvedAccount = resolvedAccount;
      session.step = "QUOTE_GENERATION";
      await redisClient.set(
        `offramp_session:${phoneNumber}`,
        JSON.stringify(session),
        "EX",
        30 * 60,
      );

      // Show resolved account and ask for confirmation
      const confirmMessage =
        `✅ *Account Verified*\n\n` +
        `Bank: ${resolvedAccount.bankName}\n` +
        `Account Number: ${resolvedAccount.accountNumber}\n` +
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

// Continue with more handler functions...
// This is getting quite long, so I'll create the remaining functions in the next part
/**
 * Handle account confirmation and generate quote
 */
export async function handleAccountConfirmation(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`offramp_session:${phoneNumber}`);
    if (!sessionData) return false;

    const session: OfframpSession = JSON.parse(sessionData);
    if (session.step !== "QUOTE_GENERATION") return false;

    const response = message.toLowerCase().trim();

    if (response === "no") {
      // Go back to account input
      session.step = "ACCOUNT_RESOLUTION";
      await redisClient.set(
        `offramp_session:${phoneNumber}`,
        JSON.stringify(session),
        "EX",
        30 * 60,
      );

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

    // Generate quote
    await generateQuote(phoneNumber, session);
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
 * Generate quote for the off-ramp
 */
async function generateQuote(
  phoneNumber: string,
  session: OfframpSession,
): Promise<void> {
  try {
    await whatsappBusinessService.sendNormalMessage(
      "💱 *Generating Quote...*\n\nPlease wait while we calculate the best rate for you.",
      phoneNumber,
    );

    // Generate quote
    const quoteRequest = {
      fiatAmount: session.ngnAmount!.toString(),
      asset: session.selectedAsset!,
      chain: session.selectedChain!,
      type: "SELL" as const,
      bankCode: session.selectedBank!.code,
      accountName: session.resolvedAccount!.accountName,
      accountNumber: session.resolvedAccount!.accountNumber,
      receivingAddress: dexPayService.getReceivingAddress(
        session.selectedChain!,
      ),
    };

    const quote = await dexPayService.getQuote(quoteRequest);

    // Calculate fees
    const fees = dexPayService.calculateFees(session.ngnAmount!, quote.rate);

    // Check if user has sufficient balance
    const selectedChain = session.selectedChain!;
    const selectedAsset = session.selectedAsset!;
    const chainType = crossmintService.getChainType(selectedChain);
    let balances: any[] = [];

    try {
      if (chainType === "solana") {
        balances = await crossmintService.getBalancesByChain(
          session.userId,
          selectedChain,
          ["usdc", "sol"],
        );
      } else {
        balances = await crossmintService.getBalancesByChain(
          session.userId,
          selectedChain,
          ["usdc", "usdt"],
        );
      }
    } catch (error) {
      console.error("Error getting balances for quote:", error);
    }

    const assetBalance = balances.find(
      (b) => b.token.toLowerCase() === selectedAsset,
    );
    const currentBalance = assetBalance ? parseFloat(assetBalance.amount) : 0;

    // Calculate total required amount including all fees
    const totalFees = dexPayService.calculateFees(
      session.ngnAmount!,
      quote.rate,
    );
    const feesInCrypto = totalFees.totalFees / quote.rate; // Convert fees to crypto amount
    const requiredAmount =
      quote.cryptoAmount + feesInCrypto + (quote.fees?.networkFee || 0);

    // Update session with quote
    session.quote = quote;
    session.step = "CONFIRMATION";
    await redisClient.set(
      `offramp_session:${phoneNumber}`,
      JSON.stringify(session),
      "EX",
      30 * 60,
    );

    // Display quote details
    let quoteMessage = `💱 *Quote Generated*\n\n`;
    quoteMessage += `💰 *Amount:* ${dexPayService.formatNGN(session.ngnAmount!)}\n`;
    quoteMessage += `📊 *Rate:* 1 ${selectedAsset.toUpperCase()} = ${dexPayService.formatNGN(quote.rate)}\n`;
    quoteMessage += `🔸 *Crypto for NGN:* ${quote.cryptoAmount.toFixed(6)} ${selectedAsset.toUpperCase()}\n`;
    quoteMessage += `🔸 *Fees in Crypto:* ${feesInCrypto.toFixed(6)} ${selectedAsset.toUpperCase()}\n\n`;

    quoteMessage += `💸 *Fees Breakdown:*\n`;
    quoteMessage += `• Platform Fee (1.5%): ${dexPayService.formatNGN(totalFees.platformFee)}\n`;
    quoteMessage += `• DexPay Fee: ${dexPayService.formatNGN(totalFees.dexPayFee)}\n`;
    quoteMessage += `• Total Fees: ${dexPayService.formatNGN(totalFees.totalFees)}\n\n`;

    quoteMessage += `📊 *Summary:*\n`;
    quoteMessage += `• You Receive: ${dexPayService.formatNGN(session.ngnAmount!)}\n`;
    quoteMessage += `• Total Deducted: ${requiredAmount.toFixed(6)} ${selectedAsset.toUpperCase()}\n`;
    quoteMessage += `• Your Balance: ${currentBalance.toFixed(6)} ${selectedAsset.toUpperCase()}\n\n`;

    if (currentBalance < requiredAmount) {
      quoteMessage += `❌ *Insufficient Balance*\n\n`;
      quoteMessage += `You need ${(requiredAmount - currentBalance).toFixed(6)} more ${selectedAsset.toUpperCase()}.\n\n`;
      quoteMessage += `Please:\n`;
      quoteMessage += `1. Deposit more ${selectedAsset.toUpperCase()} to your wallet\n`;
      quoteMessage += `2. Or reduce the withdrawal amount\n\n`;
      quoteMessage += `Type a lower amount to try again:`;

      // Go back to amount input
      session.step = "AMOUNT_INPUT";
      await redisClient.set(
        `offramp_session:${phoneNumber}`,
        JSON.stringify(session),
        "EX",
        30 * 60,
      );
    } else {
      quoteMessage += `✅ *Sufficient Balance*\n\n`;
      quoteMessage += `🏦 *Destination:*\n`;
      quoteMessage += `${session.resolvedAccount!.bankName}\n`;
      quoteMessage += `${session.resolvedAccount!.accountName}\n`;
      quoteMessage += `${session.resolvedAccount!.accountNumber}\n\n`;
      quoteMessage += `⏰ *Quote expires in 10 minutes*\n\n`;
      quoteMessage += `Reply *proceed* to continue or *cancel* to stop.`;
    }

    await whatsappBusinessService.sendNormalMessage(quoteMessage, phoneNumber);
  } catch (error: any) {
    console.error(`Error generating quote for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      `❌ *Quote Generation Failed*\n\n${error.message}\n\nPlease try again later.`,
      phoneNumber,
    );
  }
}

/**
 * Handle transaction confirmation
 */
export async function handleTransactionConfirmation(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`offramp_session:${phoneNumber}`);
    if (!sessionData) return false;

    const session: OfframpSession = JSON.parse(sessionData);
    if (session.step !== "CONFIRMATION") return false;

    const response = message.toLowerCase().trim();

    if (response === "cancel") {
      await redisClient.del(`offramp_session:${phoneNumber}`);
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Off-ramp Cancelled*\n\nYour off-ramp transaction has been cancelled.\n\nType *offramp* to start a new transaction.",
        phoneNumber,
      );
      return true;
    }

    if (response !== "proceed") {
      await whatsappBusinessService.sendNormalMessage(
        "❓ *Please Confirm*\n\nReply *proceed* to continue with the transaction or *cancel* to stop.",
        phoneNumber,
      );
      return true;
    }

    // Move to PIN verification
    session.step = "PIN_VERIFICATION";
    await redisClient.set(
      `offramp_session:${phoneNumber}`,
      JSON.stringify(session),
      "EX",
      30 * 60,
    );

    await whatsappBusinessService.sendNormalMessage(
      "🔐 *Enter Your PIN*\n\nPlease enter your 4-digit transaction PIN to confirm this off-ramp:",
      phoneNumber,
    );

    return true;
  } catch (error) {
    console.error(
      `Error in handleTransactionConfirmation for ${phoneNumber}:`,
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
 * Handle PIN verification and execute transaction
 */
export async function handlePinVerification(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`offramp_session:${phoneNumber}`);
    if (!sessionData) return false;

    const session: OfframpSession = JSON.parse(sessionData);
    if (session.step !== "PIN_VERIFICATION") return false;

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

    // Verify PIN
    const user = await userService.getUser(phoneNumber, true);
    if (!user || !user.pin) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *PIN Verification Failed*\n\nCouldn't verify your PIN. Please try again.",
        phoneNumber,
      );
      return true;
    }

    const pinValid = await user.comparePin(pin);
    if (!pinValid) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Incorrect PIN*\n\nThe PIN you entered is incorrect. Please try again:",
        phoneNumber,
      );
      return true;
    }

    // Execute the off-ramp transaction
    await executeOfframpTransaction(phoneNumber, session);
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
 * Execute the off-ramp transaction
 */
async function executeOfframpTransaction(
  phoneNumber: string,
  session: OfframpSession,
): Promise<void> {
  try {
    await whatsappBusinessService.sendNormalMessage(
      "⚡ *Processing Transaction...*\n\nPlease wait while we process your off-ramp transaction. This may take a few moments.",
      phoneNumber,
    );

    // Step 1: Transfer crypto from user wallet to DexPay (including all fees)
    const selectedChain = session.selectedChain!;
    const selectedAsset = session.selectedAsset!;
    const chainType = crossmintService.getChainType(selectedChain);

    // Calculate total amount to transfer (crypto amount + all fees)
    const quote = session.quote!;
    const platformFees = dexPayService.calculateFees(
      session.ngnAmount!,
      quote.rate,
    );
    const totalCryptoAmount =
      quote.cryptoAmount + platformFees.totalFees / quote.rate; // Convert fees to crypto
    const transferAmount = totalCryptoAmount.toString();

    const receivingAddress = dexPayService.getReceivingAddress(selectedChain);

    try {
      const transferResult = await crossmintService.transferTokens(
        session.userId,
        chainType,
        selectedAsset,
        transferAmount,
        receivingAddress,
      );

      console.log(`Transfer successful (including fees):`, transferResult);
    } catch (error: any) {
      console.error(`Transfer failed:`, error);
      await whatsappBusinessService.sendNormalMessage(
        `❌ *Transfer Failed*\n\nCouldn't transfer crypto from your wallet. ${error.message}\n\nPlease try again later.`,
        phoneNumber,
      );
      return;
    }

    // Step 2: Complete off-ramp through DexPay (validates quote and processes payment)
    try {
      const offrampResult = await dexPayService.completeOfframp(
        session.quote!.id,
      );

      // Clean up session
      await redisClient.del(`offramp_session:${phoneNumber}`);

      // Send success message
      const selectedAsset = session.selectedAsset!;
      const successMessage =
        `🎉 *Off-ramp Successful!*\n\n` +
        `✅ Transaction completed successfully\n\n` +
        `💰 *Details:*\n` +
        `• Amount: ${dexPayService.formatNGN(session.ngnAmount!)}\n` +
        `• Crypto Used: ${quote.cryptoAmount.toFixed(6)} ${selectedAsset.toUpperCase()}\n` +
        `• Platform Fee: ${dexPayService.formatNGN(platformFees.platformFee)}\n` +
        `• DexPay Fee: ${dexPayService.formatNGN(platformFees.dexPayFee)}\n` +
        `• Total Fees: ${dexPayService.formatNGN(platformFees.totalFees)}\n` +
        `• Bank: ${session.resolvedAccount!.bankName}\n` +
        `• Account: ${session.resolvedAccount!.accountName}\n` +
        `• Account Number: ${session.resolvedAccount!.accountNumber}\n\n` +
        `💳 *Your NGN will be credited to your bank account within 5-10 minutes.*\n\n` +
        `📧 You'll receive a confirmation email shortly.\n\n` +
        `Type *menu* to return to the main menu.`;

      await whatsappBusinessService.sendNormalMessage(
        successMessage,
        phoneNumber,
      );

      // Send additional success notification
      await sendOfframpSuccessNotification(
        phoneNumber,
        session.ngnAmount!,
        quote.cryptoAmount,
        selectedAsset,
        session.resolvedAccount!.bankName,
        session.resolvedAccount!.accountName,
        session.quote!.id,
      );

      console.log(
        `Off-ramp completed successfully for ${phoneNumber}:`,
        offrampResult,
      );
    } catch (error: any) {
      console.error(`Off-ramp completion failed:`, error);

      if (error.message.includes("expired")) {
        await whatsappBusinessService.sendNormalMessage(
          `❌ *Quote Expired*\n\n${error.message}\n\nThe crypto transfer was successful, but the quote expired. Our team will investigate and resolve this.\n\nReference: ${session.quote!.id}\n\nContact support for assistance.`,
          phoneNumber,
        );
      } else {
        await whatsappBusinessService.sendNormalMessage(
          `❌ *Off-ramp Failed*\n\nThe crypto transfer was successful, but the off-ramp processing failed. Our team will investigate and resolve this.\n\nReference: ${session.quote!.id}\n\nContact support for assistance.`,
          phoneNumber,
        );
      }
    }
  } catch (error) {
    console.error(
      `Error executing off-ramp transaction for ${phoneNumber}:`,
      error,
    );
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Transaction Failed*\n\nSomething went wrong processing your transaction. Please contact support for assistance.",
      phoneNumber,
    );
  }
}

/**
 * Handle deposit notifications (called when deposit is detected)
 */
export async function handleDepositNotification(
  phoneNumber: string,
  asset: string,
  amount: number,
  chain: string,
): Promise<void> {
  try {
    // Enhanced deposit notification with better formatting
    const notificationMessage =
      `🎉 *Crypto Deposit Received!*\n\n` +
      `💰 *Amount:* ${amount.toFixed(6)} ${asset.toUpperCase()}\n` +
      `🔗 *Network:* ${chain.toUpperCase()}\n` +
      `⏰ *Time:* ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}\n\n` +
      `✅ *Your deposit has been confirmed and is ready to use!*\n\n` +
      `🚀 *Ready to convert to NGN?*\n` +
      `Type *spend crypto* to start your off-ramp transaction.\n\n` +
      `💡 *Tip:* You can convert your crypto to NGN and receive it directly in your bank account within minutes!`;

    await whatsappBusinessService.sendNormalMessage(
      notificationMessage,
      phoneNumber,
    );

    // Log the deposit notification
    console.log(
      `Deposit notification sent to ${phoneNumber}: ${amount} ${asset} on ${chain}`,
    );

    // TODO: Send utility template message with "Spend Crypto" CTA button
    // This would require creating a template in Meta Business Suite
  } catch (error) {
    console.error(
      `Error sending deposit notification to ${phoneNumber}:`,
      error,
    );
  }
}

/**
 * Send off-ramp success notification (separate from the transaction completion message)
 */
export async function sendOfframpSuccessNotification(
  phoneNumber: string,
  ngnAmount: number,
  cryptoAmount: number,
  asset: string,
  bankName: string,
  accountName: string,
  transactionId: string,
): Promise<void> {
  try {
    const successNotification =
      `🎉 *Off-ramp Completed Successfully!*\n\n` +
      `✅ *Transaction Status:* Completed\n` +
      `💰 *Amount:* ${dexPayService.formatNGN(ngnAmount)}\n` +
      `🪙 *Crypto Used:* ${cryptoAmount.toFixed(6)} ${asset.toUpperCase()}\n` +
      `🏦 *Bank:* ${bankName}\n` +
      `👤 *Account:* ${accountName}\n` +
      `📋 *Reference:* ${transactionId}\n` +
      `⏰ *Completed:* ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}\n\n` +
      `💳 *Your NGN has been sent to your bank account.*\n` +
      `⏱️ *Expected arrival:* 5-10 minutes\n\n` +
      `📧 *A confirmation email has been sent to you.*\n\n` +
      `🙏 *Thank you for using ChainPaye!*\n\n` +
      `Type *menu* to return to the main menu or *offramp* for another transaction.`;

    await whatsappBusinessService.sendNormalMessage(
      successNotification,
      phoneNumber,
    );

    // Log the success notification
    console.log(
      `Off-ramp success notification sent to ${phoneNumber}: ${ngnAmount} NGN`,
    );
  } catch (error) {
    console.error(
      `Error sending off-ramp success notification to ${phoneNumber}:`,
      error,
    );
  }
}

/**
 * Check if message is related to off-ramp session
 */
export async function isOfframpSessionActive(
  phoneNumber: string,
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`offramp_session:${phoneNumber}`);
    return !!sessionData;
  } catch (error) {
    return false;
  }
}

/**
 * Route off-ramp session messages
 */
export async function routeOfframpMessage(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  try {
    const sessionData = await redisClient.get(`offramp_session:${phoneNumber}`);
    if (!sessionData) return false;

    const session: OfframpSession = JSON.parse(sessionData);

    switch (session.step) {
      case "ASSET_SELECTION":
        return await handleAssetSelection(phoneNumber, message);

      case "AMOUNT_INPUT":
        return await handleAmountInput(phoneNumber, message);

      case "BANK_SELECTION":
        return await handleBankSelection(phoneNumber, message);

      case "ACCOUNT_RESOLUTION":
        return await handleAccountResolution(phoneNumber, message);

      case "QUOTE_GENERATION":
        return await handleAccountConfirmation(phoneNumber, message);

      case "CONFIRMATION":
        return await handleTransactionConfirmation(phoneNumber, message);

      case "PIN_VERIFICATION":
        return await handlePinVerification(phoneNumber, message);

      default:
        return false;
    }
  } catch (error) {
    console.error(`Error routing off-ramp message for ${phoneNumber}:`, error);
    return false;
  }
}
