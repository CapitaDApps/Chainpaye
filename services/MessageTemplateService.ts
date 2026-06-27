/**
 * MessageTemplateService
 * 
 * Handles message template generation for referral code capture flow.
 * Provides personalized invitation messages and error messages.
 * 
 * Validates: Requirements 2.3, 2.4, 2.5
 */

import { MessageTemplates } from "../types/referral-capture.types";

export class MessageTemplateService implements MessageTemplates {

  /**
   * Generate personalized invitation message with referrer name
   * 
   * Creates a welcoming message that includes the referrer's name
   * to personalize the invitation experience.
   * 
   * @param referrerName The name of the person who sent the referral
   * @returns Formatted invitation message
   * 
   * Validates: Requirements 2.3
   */
  invitationMessage(referrerName: string): string {
    const cleanName = this.sanitizeName(referrerName);
    
    return `🎉 Welcome to ChainPaye!\n\n` +
           `You have been invited to join ChainPaye by ${cleanName}.\n\n` +
           `ChainPaye makes cross-border payments simple and secure using blockchain technology. ` +
           `Send money instantly to friends and family worldwide with low fees.\n\n` +
           `Ready to get started? Let's set up your account! 🚀`;
  }

  /**
   * Generate error message for invalid referral codes
   * 
   * Provides a user-friendly error message when referral codes
   * are invalid or don't exist in the system.
   * 
   * @returns Error message for invalid codes
   * 
   * Validates: Requirements 2.4
   */
  invalidCodeMessage(): string {
    return `❌ Invalid referral code.\n\n` +
           `The referral code you entered doesn't exist or has expired. ` +
           `Please check with the person who referred you and try again.\n\n` +
           `You can also sign up without a referral code by typing "signup".`;
  }

  /**
   * Generate generic error message for system errors
   * 
   * Provides a fallback error message when system errors occur
   * during referral code processing.
   * 
   * @returns Generic error message
   * 
   * Validates: Requirements 2.4
   */
  errorMessage(): string {
    return `⚠️ Something went wrong.\n\n` +
           `We're having trouble processing your referral code right now. ` +
           `Please try again in a few moments.\n\n` +
           `If the problem persists, you can sign up without a referral code by typing "signup".`;
  }

  /**
   * Generate signup prompt message
   * 
   * Encourages users to proceed with signup after successful
   * referral code validation.
   * 
   * @returns Signup prompt message
   * 
   * Validates: Requirements 2.5
   */
  signupPrompt(): string {
    return `✅ Referral code accepted!\n\n` +
           `Your referral code has been saved and will be applied when you complete signup.\n\n` +
           `Ready to create your ChainPaye account? Type "signup" to get started!`;
  }

  /**
   * Generate usage instructions for start command
   * 
   * Provides clear instructions on how to use referral codes.
   * 
   * @returns Usage instructions
   */
  usageInstructions(): string {
    return `📝 How to use a referral code:\n\n` +
           `Type: start [referral_code]\n` +
           `Example: start ABC123\n\n` +
           `Referral codes are 6-12 characters long and contain only letters and numbers.\n\n` +
           `Don't have a referral code? No problem! Type "signup" to create your account.`;
  }

  /**
   * Generate welcome message for new users
   * 
   * General welcome message for users who don't have referral codes.
   * 
   * @returns Welcome message
   */
  welcomeMessage(): string {
    return `👋 Welcome to ChainPaye!\n\n` +
           `The easiest way to send money across borders using blockchain technology.\n\n` +
           `• Have a referral code? Type: start [code]\n` +
           `• Ready to sign up? Type: signup\n` +
           `• Need help? Type: help`;
  }

  /**
   * Generate referral code format error message
   * 
   * Specific error message for incorrectly formatted referral codes.
   * 
   * @returns Format error message
   */
  formatErrorMessage(): string {
    return `❌ Invalid referral code format.\n\n` +
           `Referral codes must be:\n` +
           `• 6-12 characters long\n` +
           `• Letters and numbers only\n` +
           `• No spaces or special characters\n\n` +
           `Example: ABC123 or XYZ789ABC\n\n` +
           `Please check your code and try again.`;
  }

  /**
   * Generate self-referral error message
   * 
   * Error message when users try to use their own referral code.
   * 
   * @returns Self-referral error message
   */
  selfReferralErrorMessage(): string {
    return `❌ You cannot use your own referral code.\n\n` +
           `Referral codes are meant to be shared with friends and family. ` +
           `You'll earn rewards when others use your code!\n\n` +
           `To find your referral code, type "referral" after completing signup.`;
  }

  /**
   * Generate already referred error message
   * 
   * Error message when users already have a referral relationship.
   * 
   * @returns Already referred error message
   */
  alreadyReferredMessage(): string {
    return `ℹ️ You already have a referral connection.\n\n` +
           `Your account is already linked to a referrer. ` +
           `Referral relationships cannot be changed once established.\n\n` +
           `Continue with your signup to start using ChainPaye!`;
  }

  /**
   * Sanitize referrer name for display
   * 
   * Cleans and formats referrer names for safe display in messages.
   * 
   * @param name The referrer name to sanitize
   * @returns Cleaned name
   */
  private sanitizeName(name: string): string {
    if (!name || typeof name !== 'string') {
      return "ChainPaye User";
    }

    // Remove any potentially harmful characters and limit length
    const cleaned = name.trim().replace(/[<>\"'&]/g, '').substring(0, 50);
    
    return cleaned || "ChainPaye User";
  }
}