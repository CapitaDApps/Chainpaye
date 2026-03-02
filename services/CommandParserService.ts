/**
 * CommandParserService
 * 
 * Handles parsing of WhatsApp messages to extract referral codes from "start" commands.
 * Validates command format and extracts referral codes for processing.
 * 
 * Validates: Requirements 2.1
 */

import { 
  CommandParser, 
  ParsedCommand, 
  CommandParsingError,
  WhatsAppMessageContext
} from "../types/referral-capture.types";

export class CommandParserService implements CommandParser {
  private readonly START_COMMAND_REGEX = /^start\s+([a-zA-Z0-9]{6,12})$/i;
  private readonly REFERRAL_CODE_REGEX = /^[a-zA-Z0-9]{6,12}$/;

  /**
   * Parse a WhatsApp message with context to extract referral code and phone number
   * 
   * This method handles the complete WhatsApp message context including phone number extraction.
   * Expected format: "start ABC123" or "START abc123"
   * 
   * @param context The WhatsApp message context containing from (phone) and message text
   * @returns ParsedCommand object with phone number populated or null if not a valid start command
   * @throws CommandParsingError if message format is invalid
   * 
   * Validates: Requirements 2.1
   */
  parseStartCommandWithContext(context: WhatsAppMessageContext): ParsedCommand | null {
    if (!context || !context.message || !context.from) {
      return null;
    }

    // Parse the command from the message text
    const parsedCommand = this.parseStartCommand(context.message);
    
    if (!parsedCommand) {
      return null;
    }

    // Normalize phone number to include + prefix if missing
    const normalizedPhone = context.from.startsWith("+") ? context.from : `+${context.from}`;

    // Return the parsed command with the phone number populated
    return {
      ...parsedCommand,
      phoneNumber: normalizedPhone
    };
  }

  /**
   * Parse a WhatsApp message to extract referral code from "start" command
   * 
   * Expected format: "start ABC123" or "START abc123"
   * Case-insensitive command matching with case-preserved referral codes.
   * 
   * @param message The WhatsApp message text
   * @returns ParsedCommand object or null if not a valid start command
   * @throws CommandParsingError if message format is invalid
   * 
   * Validates: Requirements 2.1
   */
  parseStartCommand(message: string): ParsedCommand | null {
    if (!message || typeof message !== 'string') {
      return null;
    }

    const trimmedMessage = message.trim();
    
    // Check if it's a start command
    if (!trimmedMessage.toLowerCase().startsWith('start')) {
      return null;
    }

    const match = trimmedMessage.match(this.START_COMMAND_REGEX);
    
    if (!match || !match[1]) {
      // It starts with "start" but doesn't match the expected format
      throw new CommandParsingError(
        "Invalid start command format. Use: start [referral_code]"
      );
    }

    const referralCode = match[1];

    // Validate referral code format
    if (!this.validateReferralCodeFormat(referralCode)) {
      throw new CommandParsingError(
        "Invalid referral code format. Code must be 6-12 alphanumeric characters."
      );
    }

    return {
      command: 'start',
      referralCode: referralCode.toUpperCase(), // Normalize to uppercase
      phoneNumber: '' // Will be populated by the calling service
    };
  }

  /**
   * Validate the format of a command string
   * 
   * Checks if the command follows the expected "start [code]" pattern
   * without throwing errors.
   * 
   * @param command The command string to validate
   * @returns True if format is valid, false otherwise
   * 
   * Validates: Requirements 2.1
   */
  validateCommandFormat(command: string): boolean {
    if (!command || typeof command !== 'string') {
      return false;
    }

    const trimmedCommand = command.trim();
    return this.START_COMMAND_REGEX.test(trimmedCommand);
  }

  /**
   * Validate phone number format
   * 
   * Ensures phone numbers are in international format and properly formatted.
   * 
   * @param phoneNumber The phone number to validate
   * @returns True if format is valid, false otherwise
   */
  private validatePhoneNumberFormat(phoneNumber: string): boolean {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return false;
    }

    // Basic validation for international phone number format
    // Should start with + followed by country code (1-3 digits) and phone number (6-14 digits)
    // Total length should be 7-15 digits after the +
    // Country code cannot start with 0
    const phoneRegex = /^\+[1-9]\d{6,14}$/;
    
    if (!phoneRegex.test(phoneNumber)) {
      return false;
    }

    // Additional validation: ensure it doesn't contain invalid characters
    const digitsOnly = phoneNumber.slice(1); // Remove the +
    return /^\d+$/.test(digitsOnly) && digitsOnly.length >= 7 && digitsOnly.length <= 15;
  }

  /**
   * Validate referral code format
   * 
   * Ensures referral codes are alphanumeric and within the valid length range.
   * 
   * @param code The referral code to validate
   * @returns True if format is valid, false otherwise
   */
  private validateReferralCodeFormat(code: string): boolean {
    return this.REFERRAL_CODE_REGEX.test(code);
  }

  /**
   * Extract just the referral code from a message
   * 
   * Utility method to get the referral code without full parsing.
   * Returns null if the command is invalid instead of throwing errors.
   * 
   * @param message The WhatsApp message text
   * @returns The referral code or null if not found
   */
  extractReferralCode(message: string): string | null {
    try {
      const parsed = this.parseStartCommand(message);
      return parsed ? parsed.referralCode : null;
    } catch (error) {
      // Return null for invalid commands instead of throwing
      return null;
    }
  }

  /**
   * Check if a message is a start command (without validation)
   * 
   * Quick check to determine if a message should be processed
   * as a start command.
   * 
   * @param message The message to check
   * @returns True if it appears to be a start command
   */
  isStartCommand(message: string): boolean {
    if (!message || typeof message !== 'string') {
      return false;
    }

    return message.trim().toLowerCase().startsWith('start');
  }

  /**
   * Validate WhatsApp message context
   * 
   * Ensures the message context contains valid phone number and message text.
   * 
   * @param context The WhatsApp message context to validate
   * @returns True if context is valid, false otherwise
   */
  validateMessageContext(context: WhatsAppMessageContext): boolean {
    if (!context || typeof context !== 'object') {
      return false;
    }

    if (!context.message || typeof context.message !== 'string') {
      return false;
    }

    if (!context.from || typeof context.from !== 'string') {
      return false;
    }

    // Validate phone number format
    const normalizedPhone = context.from.startsWith("+") ? context.from : `+${context.from}`;
    return this.validatePhoneNumberFormat(normalizedPhone);
  }

  /**
   * Get usage instructions for the start command
   * 
   * Returns user-friendly instructions for proper command usage.
   * 
   * @returns Usage instruction string
   */
  getUsageInstructions(): string {
    return "To use a referral code, type: start [referral_code]\n" +
           "Example: start ABC123\n" +
           "Referral codes must be 6-12 characters long and contain only letters and numbers.";
  }
}