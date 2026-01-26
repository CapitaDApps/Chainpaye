import { User } from "../models/User";
import { whatsappBusinessService } from "../services";
import { COMMANDS, TriggerPhrase } from "./config";
import {
  handleAccountInfo,
  handleConversion,
  handleOfframp,
  handleSupport,
  handleTopUp,
  handleTransactionHistory,
  handleTransfer,
  handleWithdrawal,
} from "./handlers";

/**
 * Checks if a message is a crypto sell request (e.g., "usdc solana", "usdt on ethereum")
 * This has highest priority and is checked before other commands
 */
function isCryptoSellRequest(message: string): boolean {
  const normalizedMessage = message.toLowerCase().trim();

  // Check if message contains a token (usdc, usdt) and a network
  const hasToken = /\b(usdc|usdt)\b/i.test(normalizedMessage);
  const hasNetwork =
    /\b(bsc|sol(ana)?|eth(ereum)?|poly(gon)?|tron?|base)\b/i.test(
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

    case "transfer":
      await handleTransfer(from);
      break;

    case "offramp":
      await handleOfframp(from, message);
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
