/**
 * SignupHandler
 * 
 * Handles signup/registration commands by triggering the registration flow.
 * This allows users to start the signup process by typing "signup" or similar commands.
 */

import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { logger } from "../../utils/logger";

const whatsappBusinessService = new WhatsAppBusinessService();

/**
 * Handle signup/registration commands
 * 
 * Triggers the registration flow for users who want to create an account.
 * 
 * @param from The WhatsApp phone number of the user
 * @param message The full message text (e.g., "signup", "register", etc.)
 */
export async function handleSignup(from: string, message: string): Promise<void> {
  try {
    logger.info("Handling signup command", { from, message });
    
    // Send the registration flow
    await whatsappBusinessService.sendIntroMessageByFlowId(from);
    
    logger.info("Registration flow sent successfully", { from });
    
  } catch (error) {
    logger.error("Error in handleSignup", { 
      from, 
      message,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Send a fallback message if the flow fails
    try {
      await whatsappBusinessService.sendNormalMessage(
        "Welcome to ChainPaye! 🎉\n\nI'm having trouble starting the registration process right now. Please try again in a moment, or contact our support team if the issue persists.",
        from
      );
    } catch (fallbackError) {
      logger.error("Failed to send fallback signup message", { 
        from, 
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      });
    }
  }
}