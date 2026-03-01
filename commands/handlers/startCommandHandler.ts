/**
 * StartCommandHandler
 * 
 * Handles "start [referral_code]" command for new user registration with referral.
 * Validates referral code and creates referral relationship.
 * 
 * Validates: Requirements 2.1, 2.2, 2.3
 */

import { whatsappBusinessService } from "../../services";
import { ReferralService, InvalidReferralCodeError, SelfReferralError, DuplicateReferralError } from "../../services/ReferralService";
import { User } from "../../models/User";

/**
 * Handle "start [referral_code]" command
 * 
 * Parses the referral code from the message, validates it, and creates a referral relationship.
 * 
 * @param from The WhatsApp phone number of the user
 * @param message The full message text (e.g., "start ABC123")
 */
export async function handleStartCommand(from: string, message: string): Promise<void> {
  try {
    const phone = from.startsWith("+") ? from : `+${from}`;
    
    // Find the user
    const user = await User.findOne({ whatsappNumber: phone });
    if (!user) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Account Not Found*\n\nPlease create an account first.\n\nType *menu* to get started.",
        from
      );
      return;
    }

    // Parse referral code from message
    // Expected format: "start [code]" or "start [code]" with extra whitespace
    const parts = message.trim().split(/\s+/);
    
    if (parts.length < 2) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Invalid Format*\n\nPlease use the format: *start [referral_code]*\n\nExample: start ABC123",
        from
      );
      return;
    }

    const referralCode = parts[1].trim();

    if (!referralCode) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Missing Referral Code*\n\nPlease provide a referral code.\n\nExample: start ABC123",
        from
      );
      return;
    }

    // Create referral relationship
    const referralService = new ReferralService();
    
    try {
      await referralService.createReferralRelationship(user.userId, referralCode);
      
      // Success message
      await whatsappBusinessService.sendNormalMessage(
        "🎉 *Welcome!*\n\n" +
        "You've been successfully referred! Your referrer will earn rewards when you make transactions.\n\n" +
        "Type *referral* to get your own referral code and start earning rewards too!",
        from
      );
    } catch (error) {
      if (error instanceof InvalidReferralCodeError) {
        await whatsappBusinessService.sendNormalMessage(
          "❌ *Invalid Referral Code*\n\nThe referral code you entered doesn't exist. Please check and try again.",
          from
        );
      } else if (error instanceof SelfReferralError) {
        await whatsappBusinessService.sendNormalMessage(
          "❌ *Self-Referral Not Allowed*\n\nYou cannot use your own referral code.",
          from
        );
      } else if (error instanceof DuplicateReferralError) {
        await whatsappBusinessService.sendNormalMessage(
          "❌ *Already Referred*\n\nYou have already been referred by another user. Referral relationships cannot be changed.",
          from
        );
      } else {
        console.error("Error creating referral relationship:", error);
        await whatsappBusinessService.sendNormalMessage(
          "❌ *Error*\n\nSomething went wrong. Please try again later.",
          from
        );
      }
    }
  } catch (error) {
    console.error("Error in handleStartCommand:", error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error*\n\nSomething went wrong. Please try again later.",
      from
    );
  }
}
