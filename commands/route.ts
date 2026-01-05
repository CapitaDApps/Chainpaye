import { whatsappBusinessService } from "../services";
import { COMMANDS, TriggerPhrase } from "./config";
import {
  handleAccountInfo,
  handleConversion,
  handleTopUp,
  handleTransactionHistory,
  handleWithdrawal,
  handleTransfer,
  handleCryptoTopUp,
} from "./handlers";

/**
 * Checks if a message matches any trigger phrase
 * @param message - The user's message (lowercased)
 * @param triggers - Array of trigger phrases (strings or regex)
 * @returns true if the message matches any trigger
 */
function matchesTrigger(message: string, triggers: TriggerPhrase[]): boolean {
  const normalizedMessage = message.toLowerCase().trim();

  return triggers.some((trigger) => {
    if (trigger instanceof RegExp) {
      return trigger.test(normalizedMessage);
    }
    // For string triggers, check if the message contains the phrase
    // This handles both exact matches like "/balance" and natural phrases like "check my balance"
    return normalizedMessage.includes(trigger.toLowerCase());
  });
}

/**
 * Finds the matching command based on the user's message
 * @param message - The user's message
 * @returns The command key or null if no match
 */
function findMatchingCommand(message: string): string | null {
  for (const [commandKey, config] of Object.entries(COMMANDS)) {
    if (matchesTrigger(message, config.triggers)) {
      return commandKey;
    }
  }
  return null;
}

export async function commandRouteHandler(from: string, message: string) {
  const matchingCommand = findMatchingCommand(message);

  // routing logic here
  if (matchingCommand === "myAccount") {
    await handleAccountInfo(from);
  } else if (matchingCommand === "withdraw") {
    await handleWithdrawal(from);
  } else if (matchingCommand === "convert") {
    await handleConversion(from);
  } else if (matchingCommand === "transactionHistory") {
    await handleTransactionHistory(from);
  } else if (matchingCommand === "deposit") {
    await handleTopUp(from);
  } else if (matchingCommand === "transfer") {
    await handleTransfer(from);
  } else if (matchingCommand === "offramp") {
    await handleCryptoTopUp(from);
  } else {
    try {
      await whatsappBusinessService.sendMenuMessageMyFlowId(from);
    } catch (err) {
      console.log(
        "Error sending intro flow",
        (err as { response: any }).response.data
      );
    }
  }
}
