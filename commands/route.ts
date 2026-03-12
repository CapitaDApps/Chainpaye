import { User } from "../models/User";
import { whatsappBusinessService } from "../services";
import { crossmintService } from "../services/CrossmintService";
import { COMMANDS, TriggerPhrase } from "./config";
import {
  handleAccountInfo,
  handleConversion,
  handleOfframp,
  handlePaymentLink,
  handleSupport,
  handleTopUp,
  handleTransactionHistory,
  handleTransfer,
  handleWithdrawal,
  handleUsdDeposit,
} from "./handlers";
import { handleStartCommand } from "./handlers/startCommandHandler";
import { handleReferralCommand } from "./handlers/referralHandler";

/**
 * Handle wallet command - show all crypto wallet addresses and balances
 */
async function handleWallets(phoneNumber: string): Promise<void> {
  try {
    const phone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    const user = await User.findOne({ whatsappNumber: phone });

    if (!user) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Account Not Found*\n\nPlease create an account first.\n\nType *menu* to get started.",
        phoneNumber,
      );
      return;
    }

    // Get or create wallets for the user
    let wallets = await crossmintService.listWallets(user.userId);

    // If no wallets exist, create them
    if (!wallets || wallets.length === 0) {
      console.log(`Creating wallets for user ${user.userId}`);
      
      try {
        const [evmWallet, solanaWallet] = await Promise.all([
          crossmintService.getOrCreateWallet(user.userId, "evm"),
          crossmintService.getOrCreateWallet(user.userId, "solana"),
        ]);
        
        // Fetch the wallets again after creation
        wallets = await crossmintService.listWallets(user.userId);
      } catch (createError) {
        console.error("Error creating wallets:", createError);
        await whatsappBusinessService.sendNormalMessage(
          "❌ *Error Creating Wallets*\n\nCouldn't create your wallets. Please try again later.",
          phoneNumber,
        );
        return;
      }
    }

    console.log(`Found ${wallets.length} wallets for user ${user.userId}:`, 
      wallets.map(w => `${w.chainType}: ${w.address}`));

    let message = "💼 *Your Crypto Wallets*\n\n";

    // Process EVM wallet first
    const evmWallet = wallets.find(w => w.chainType === "evm");
    if (evmWallet) {
      message += `🔷 *EVM Wallet* (Multi-Chain)\n`;
      message += `\`${evmWallet.address}\`\n\n`;
      message += `*Supported Networks:* BSC, Base, Arbitrum\n\n`;
      
      // Get balances for each EVM chain
      const evmChains = ["bsc", "base", "arbitrum"];
      let hasBalances = false;
      
      for (const chain of evmChains) {
        try {
          const chainBalances = await crossmintService.getBalancesByChain(
            user.userId,
            chain,
            ["usdc", "usdt"],
          );
          
          if (chainBalances.length > 0) {
            const chainName = chain.toUpperCase();
            message += `*${chainName} Balances:*\n`;
            
            for (const balance of chainBalances) {
              const amount = parseFloat(balance.amount).toFixed(2);
              const tokenName = (balance.symbol || balance.token || "UNKNOWN").toUpperCase();
              message += `• ${tokenName}: ${amount}\n`;
              hasBalances = true;
            }
            message += `\n`;
          }
        } catch (error) {
          console.error(`Error fetching ${chain} balances:`, error);
        }
      }
      
      if (!hasBalances) {
        message += `*Balance:* 0.00\n\n`;
      }
    }

    // Process Solana wallet
    const solanaWallet = wallets.find(w => w.chainType === "solana");
    if (solanaWallet) {
      message += `� *Solana Wallet*\n`;
      message += `\`${solanaWallet.address}\`\n\n`;
      
      try {
        const balances = await crossmintService.getBalancesByChain(
          user.userId,
          "solana",
          ["usdc", "usdt"],
        );
        
        console.log(`Solana balances for ${user.userId}:`, balances);
        
        if (balances.length > 0) {
          message += `*Balances:*\n`;
          for (const balance of balances) {
            const amount = parseFloat(balance.amount).toFixed(2);
            const tokenName = (balance.symbol || balance.token || "UNKNOWN").toUpperCase();
            message += `• ${tokenName}: ${amount}\n`;
          }
        } else {
          message += `*Balance:* 0.00\n`;
        }
        message += `\n`;
      } catch (error) {
        console.error("Error fetching Solana balances:", error);
        message += `*Balance:* 0.00\n\n`;
      }
    }

    message += `💡 *Tip:* Your wallet addresses will be sent in separate messages for easy copying.`;

    // Send main message with balances
    await whatsappBusinessService.sendNormalMessage(message, phoneNumber);
    
    // Send EVM wallet messages
    if (evmWallet) {
      // Message 2: EVM instruction
      // await whatsappBusinessService.sendNormalMessage(
      //   "You can copy the address below to send crypto into your EVM wallet:",
      //   phoneNumber
      // );
      
      // Message 3: EVM address only
      await whatsappBusinessService.sendNormalMessage(
        evmWallet.address,
        phoneNumber
      );
    }
    
    // Send Solana wallet messages
    if (solanaWallet) {
      // Message 4: Solana instruction
      // await whatsappBusinessService.sendNormalMessage(
      //   "You can copy the address below to send crypto into your Solana wallet:",
      //   phoneNumber
      // );
      
      // Message 5: Solana address only
      await whatsappBusinessService.sendNormalMessage(
        solanaWallet.address,
        phoneNumber
      );
    }
  } catch (error) {
    console.error("Error in handleWallets:", error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error*\n\nCouldn't fetch your wallets. Please try again later.",
      phoneNumber,
    );
  }
}

/**
 * Checks if a message is a crypto sell request (e.g., "usdc solana", "usdt on ethereum")
 * This has highest priority and is checked before other commands
 */
function isCryptoSellRequest(message: string): boolean {
  const normalizedMessage = message.toLowerCase().trim();

  // Check if message contains a token (usdc, usdt) and a network
  const hasToken = /\b(usdc|usdt)\b/i.test(normalizedMessage);
  const hasNetwork =
    /\b(bsc|bep20|sol(ana)?|eth(ereum)?|poly(gon)?|tron?|base|arbitrum|hedera|apechain|lisk)\b/i.test(
      normalizedMessage,
    );

  // Check if it has words like "sell", "cash out", "convert", "withdraw" or just token+network
  const hasActionWord = /^(sell|cash out|convert|withdraw)\s+/i.test(
    normalizedMessage,
  );

  return (
    hasToken &&
    hasNetwork &&
    (hasActionWord || /^\s*\w+\s+(on|to|at)?\s*\w+\s*$/.test(normalizedMessage))
  );
}

/**
 * Calculates a match score for how well a message matches a trigger
 * Higher score = better match
 *
 * Scoring:
 * - 100: Exact match (message equals trigger exactly)
 * - 80: Message starts with trigger (for slash commands)
 * - 60: Message contains trigger as complete word(s)
 * - 0: No match
 *
 * @param message - The user's message (lowercased and trimmed)
 * @param trigger - The trigger phrase to match against
 * @returns Match score (0-100)
 */
function getMatchScore(message: string, trigger: TriggerPhrase): number {
  if (trigger instanceof RegExp) {
    return trigger.test(message) ? 60 : 0;
  }

  const triggerLower = trigger.toLowerCase();

  // Exact match - highest priority
  if (message === triggerLower) {
    return 100;
  }

  // Slash command match - message starts with the command
  if (triggerLower.startsWith("/") && message.startsWith(triggerLower)) {
    return 80;
  }

  // Word boundary match - trigger appears as complete word(s) in message
  // This prevents "hi" matching "history" or "transaction" matching "transactionhistory"
  const escapedTrigger = triggerLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordBoundaryRegex = new RegExp(`(^|\\s)${escapedTrigger}(\\s|$)`, "i");

  if (wordBoundaryRegex.test(message)) {
    return 60;
  }

  // Message is a substring of trigger (e.g., "balance" should match for "balance" trigger)
  // Only if the message is at least 3 characters to avoid too short matches
  if (message.length >= 3 && triggerLower.startsWith(message)) {
    return 50;
  }

  // No match
  return 0;
}

/**
 * Finds the best matching command based on the user's message
 * Uses priority and match scores to determine the best match
 *
 * @param message - The user's message
 * @returns The command key or null if no match
 */
function findMatchingCommand(message: string): string | null {
  const normalizedMessage = message.toLowerCase().trim();

  // Store all matches with their scores
  const matches: Array<{
    commandKey: string;
    priority: number;
    maxScore: number;
  }> = [];

  for (const [commandKey, config] of Object.entries(COMMANDS)) {
    let maxScore = 0;

    // Find the best matching trigger for this command
    for (const trigger of config.triggers) {
      const score = getMatchScore(normalizedMessage, trigger);
      if (score > maxScore) {
        maxScore = score;
      }
    }

    if (maxScore > 0) {
      matches.push({
        commandKey,
        priority: config.priority ?? 0,
        maxScore,
      });
    }
  }

  if (matches.length === 0) {
    return null;
  }

  // Sort by: 1) match score (higher first), 2) priority (higher first)
  matches.sort((a, b) => {
    if (b.maxScore !== a.maxScore) {
      return b.maxScore - a.maxScore;
    }
    return b.priority - a.priority;
  });

  return matches[0]?.commandKey ?? "menu";
}

export async function commandRouteHandler(from: string, message: string) {
  // Check for "start [referral_code]" command first (highest priority)
  const startMatch = message.trim().match(/^start\s+([A-Z0-9]+)$/i);
  if (startMatch) {
    // Check if user is already registered
    const phone = from.startsWith("+") ? from : `+${from}`;
    const user = await User.findOne({ whatsappNumber: phone });
    
    if (user && (user.fullName || (user.firstName && user.lastName))) {
      // User is already registered - don't process start command
      await whatsappBusinessService.sendNormalMessage(
        "You already have an account with ChainPaye! 🎉\n\nType *menu* to see available options or *referral* to view your referral dashboard.",
        from
      );
      return;
    }
    
    // User is not registered - process start command
    await handleStartCommand(from, message);
    return;
  }

  if (isCryptoSellRequest(message)) {
    await handleOfframp(from, message);
    return;
  }

  const matchingCommand = findMatchingCommand(message);

  // Route to the appropriate handler
  switch (matchingCommand) {
    case "menu":
      // Greetings and navigation - show main menu
      try {
        await whatsappBusinessService.sendMenuMessageMyFlowId(from);
      } catch (err) {
        console.log(
          "Error sending menu flow",
          (err as { response: any }).response?.data,
        );
      }
      break;

    case "myAccount":
      await handleAccountInfo(from);
      break;

    case "wallets":
      await handleWallets(from);
      break;

    case "withdraw":
      await handleWithdrawal(from);
      break;

    case "convert":
      await handleConversion(from);
      break;

    case "transactionHistory":
      await handleTransactionHistory(from);
      break;

    case "deposit":
      await handleTopUp(from);
      break;

    case "usdDeposit":
      await handleUsdDeposit(from);
      break;

    case "transfer":
      await handleTransfer(from);
      break;

    case "offramp":
      await handleOfframp(from, message);
      break;

    case "paymentLink":
      await handlePaymentLink(from);
      break;

    case "kyc":
      // KYC verification flow for Nigerian users
      try {
        const phone = from.startsWith("+") ? from : `+${from}`;
        const user = await User.findOne({ whatsappNumber: phone });

        if (user?.isVerified) {
          const displayName = user.firstName
            ? `${user.firstName} ${user.lastName}`
            : user.fullName;
          await whatsappBusinessService.sendNormalMessage(
            `Hi ${displayName}, your account is already verified! ✅\n\nYou have full access to all features. No need to verify again.`,
            from,
          );
        } else {
          await whatsappBusinessService.sendKycFlowById(from);
        }
      } catch (err) {
        console.log(
          "Error sending KYC flow",
          (err as { response: any }).response?.data,
        );
        // Fallback message if flow fails
        await whatsappBusinessService.sendNormalMessage(
          "To complete your verification, please contact our support team.",
          from,
        );
      }
      break;

    case "support":
      await handleSupport(from);
      break;

    case "signup":
      // Handle signup attempts from existing users
      await whatsappBusinessService.sendNormalMessage(
        "You already have an account with ChainPaye! 🎉\n\n" +
        "Your account is ready to use. Here's what you can do:\n\n" +
        "💰 *balance* - Check your wallet balance\n" +
        "💸 *transfer* - Send money to friends\n" +
        "🏦 *withdraw* - Transfer to your bank\n" +
        "🔗 *referral* - Earn by referring friends\n" +
        "📱 *menu* - See all options\n\n" +
        "Need help? Type *support* to contact us.",
        from
      );
      break;

    case "referral":
      // Show referral dashboard with earnings and referral link
      try {
        const phone = from.startsWith("+") ? from : `+${from}`;
        const user = await User.findOne({ whatsappNumber: phone });

        if (!user) {
          await whatsappBusinessService.sendNormalMessage(
            "❌ *Account Not Found*\n\nPlease create an account first.\n\nType *menu* to get started.",
            from
          );
          return;
        }

        const dashboardMessage = await handleReferralCommand(user.userId);
        await whatsappBusinessService.sendNormalMessage(dashboardMessage, from);
      } catch (err) {
        console.error("Error showing referral dashboard:", err);
        await whatsappBusinessService.sendNormalMessage(
          "❌ *Error*\n\nCouldn't load your referral dashboard. Please try again later.",
          from
        );
      }
      break;

    default:
      // No command matched - show the main menu
      try {
        await whatsappBusinessService.sendMenuMessageMyFlowId(from);
      } catch (err) {
        console.log(
          "Error sending intro flow",
          (err as { response: any }).response?.data,
        );
      }
      break;
  }
}
