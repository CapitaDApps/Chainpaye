/**
 * StartCommandHandler
 * 
 * Handles "start [referral_code]" command for referral code capture flow.
 * Integrates with WhatsAppReferralMessageHandler for complete processing.
 * 
 * Validates: Requirements 2.1, 2.3, 2.4, 2.5
 */

import { WhatsAppReferralMessageHandler } from "../../services/WhatsAppReferralMessageHandler";
import { logger } from "../../utils/logger";

/**
 * Handle "start [referral_code]" command
 * 
 * Uses the WhatsAppReferralMessageHandler to process referral code capture
 * including validation, Redis storage, and personalized messaging.
 * 
 * @param from The WhatsApp phone number of the user
 * @param message The full message text (e.g., "start ABC123")
 */
export async function handleStartCommand(from: string, message: string): Promise<void> {
  try {
    logger.info("Handling start command", { from, message });
    
    const handler = new WhatsAppReferralMessageHandler();
    
    // Normalize phone number
    const phoneNumber = from.startsWith("+") ? from : `+${from}`;
    
    // Process the start command using the referral message handler
    const result = await handler.handleStartCommand(phoneNumber, message);
    
    if (!result.handled) {
      logger.warn("Start command was not handled by referral message handler", { 
        from: phoneNumber, 
        message 
      });
    }
    
    if (!result.success && result.error) {
      logger.error("Error processing start command", { 
        from: phoneNumber, 
        message,
        error: result.error 
      });
    } else if (result.success) {
      logger.info("Start command processed successfully", { 
        from: phoneNumber 
      });
    }
    
  } catch (error) {
    logger.error("Error in handleStartCommand", { 
      from, 
      message,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    // The WhatsAppReferralMessageHandler already sends error responses,
    // so we don't need to send another message here
  }
}
