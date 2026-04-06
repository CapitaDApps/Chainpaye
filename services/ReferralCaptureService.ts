/**
 * ReferralCaptureService
 * 
 * Main orchestration service for referral code capture flow.
 * Integrates command parsing, validation, Redis storage, and messaging.
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { CommandParserService } from "./CommandParserService";
import { ReferralCodeValidatorService } from "./ReferralCodeValidatorService";
import { ReferralRedisService } from "./ReferralRedisService";
import { MessageTemplateService } from "./MessageTemplateService";
import { 
  SignupIntegrationService,
  SignupFormData,
  ReferralCodeCaptureError,
  ParsedCommand,
  ValidationResult,
  ReferrerInfo
} from "../types/referral-capture.types";
import { logger } from "../utils/logger";

export interface ReferralCaptureResult {
  success: boolean;
  message: string;
  referrerName?: string;
  error?: string;
}

export interface SignupLookupResult {
  hasStoredCode: boolean;
  referralCode?: string;
  formData: SignupFormData;
}

export class ReferralCaptureService implements SignupIntegrationService {
  private commandParser: CommandParserService;
  private validator: ReferralCodeValidatorService;
  private redisService: ReferralRedisService;
  private messageService: MessageTemplateService;

  constructor() {
    this.commandParser = new CommandParserService();
    this.validator = new ReferralCodeValidatorService();
    this.redisService = new ReferralRedisService();
    this.messageService = new MessageTemplateService();
  }

  /**
   * Process a WhatsApp "start [referral_code]" command
   * 
   * Complete flow: parse command → validate code → store in Redis → generate response
   * 
   * @param message The WhatsApp message text
   * @param phoneNumber The user's phone number
   * @returns Result with success status and response message
   * 
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  async processStartCommand(message: string, phoneNumber: string): Promise<ReferralCaptureResult> {
    try {
      logger.info("Processing start command", { phoneNumber, message });

      // Parse the command
      const parsedCommand = this.commandParser.parseStartCommand(message);
      
      if (!parsedCommand) {
        logger.warn("Invalid start command format", { message });
        return {
          success: false,
          message: this.messageService.usageInstructions(),
          error: "Not a start command"
        };
      }

      // Add phone number to parsed command
      parsedCommand.phoneNumber = phoneNumber;

      // Validate the referral code
      const { validation, referrer } = await this.validator.validateAndGetReferrer(
        parsedCommand.referralCode
      );

      if (!validation.isValid) {
        logger.warn("Invalid referral code", { 
          code: parsedCommand.referralCode, 
          error: validation.errorMessage 
        });
        return {
          success: false,
          message: validation.errorMessage || this.messageService.invalidCodeMessage(),
          error: validation.errorMessage
        };
      }

      if (!referrer) {
        logger.error("Referrer not found despite valid code", { 
          code: parsedCommand.referralCode 
        });
        return {
          success: false,
          message: this.messageService.invalidCodeMessage(),
          error: "Referrer not found"
        };
      }

      // Store the referral code in Redis
      try {
        await this.redisService.storeReferralCode(phoneNumber, parsedCommand.referralCode);
        logger.info("Referral code stored in Redis", { 
          phoneNumber, 
          code: parsedCommand.referralCode 
        });
      } catch (redisError) {
        logger.error("Failed to store referral code in Redis", { 
          phoneNumber, 
          code: parsedCommand.referralCode,
          error: redisError instanceof Error ? redisError.message : String(redisError)
        });
        // Continue anyway - we can still show the invitation message
      }

      // Generate personalized response
      const invitationMessage = this.messageService.invitationMessage(referrer.name);
      const signupPrompt = this.messageService.signupPrompt();

      logger.info("Referral code capture successful", { 
        phoneNumber, 
        referrerName: referrer.name 
      });

      return {
        success: true,
        message: `${invitationMessage}\n\n${signupPrompt}`,
        referrerName: referrer.name
      };

    } catch (error) {
      logger.error("Error processing start command", { 
        phoneNumber, 
        message,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      if (error instanceof ReferralCodeCaptureError) {
        return {
          success: false,
          message: error.message,
          error: error.code
        };
      }

      return {
        success: false,
        message: this.messageService.errorMessage(),
        error: "System error"
      };
    }
  }

  /**
   * Get stored referral code for a phone number during signup
   * 
   * Retrieves temporarily stored referral code from Redis.
   * Returns null if no code exists or has expired.
   * 
   * @param phoneNumber The user's phone number
   * @returns The stored referral code or null
   * 
   * Validates: Requirements 2.1.1, 10.3
   */
  async getStoredReferralCode(phoneNumber: string): Promise<string | null> {
    try {
      return await this.redisService.retrieveReferralCode(phoneNumber);
    } catch (error) {
      console.error("Error retrieving stored referral code:", error);
      return null; // Graceful degradation
    }
  }

  /**
   * Pre-populate referral field in signup form
   * 
   * Checks for stored referral code and prepares form data
   * with pre-population information.
   * 
   * @param phoneNumber The user's phone number
   * @returns SignupFormData with pre-population info
   * 
   * Validates: Requirements 2.1.1, 2.1.2
   */
  async prePopulateReferralField(phoneNumber: string): Promise<SignupFormData> {
    try {
      const storedCode = await this.getStoredReferralCode(phoneNumber);
      
      return {
        referralCode: storedCode || undefined,
        isPrePopulated: storedCode !== null
      };
    } catch (error) {
      console.error("Error pre-populating referral field:", error);
      return {
        isPrePopulated: false
      };
    }
  }

  /**
   * Process referral code during signup completion
   * 
   * Validates the referral code again and creates the referral relationship.
   * Cleans up temporary Redis storage after successful relationship creation.
   * 
   * @param userId The new user's ID
   * @param referralCode The referral code to process
   * @throws Error if referral processing fails
   * 
   * Validates: Requirements 2.1.4, 2.1.5, 10.4
   */
  async processReferralOnSignup(userId: string, referralCode: string): Promise<void> {
    // This method will be implemented in task 9 when we create the referral relationship service
    // For now, we'll create a placeholder that validates the code
    
    const validation = await this.validator.validateCode(referralCode);
    
    if (!validation.isValid) {
      throw new ReferralCodeCaptureError(
        validation.errorMessage || "Invalid referral code",
        "INVALID_CODE"
      );
    }

    // TODO: Implement referral relationship creation in task 9
    // TODO: Implement Redis cleanup after successful relationship creation
    console.log(`Referral code ${referralCode} validated for user ${userId}`);
  }

  /**
   * Get comprehensive signup lookup information
   * 
   * Combines stored code retrieval with form pre-population
   * for complete signup integration.
   * 
   * @param phoneNumber The user's phone number
   * @returns Complete signup lookup information
   */
  async getSignupLookupInfo(phoneNumber: string): Promise<SignupLookupResult> {
    const formData = await this.prePopulateReferralField(phoneNumber);
    
    return {
      hasStoredCode: formData.isPrePopulated,
      referralCode: formData.referralCode,
      formData
    };
  }

  /**
   * Validate if a message is a start command
   * 
   * Quick check to determine if a WhatsApp message should be
   * processed by the referral capture flow.
   * 
   * @param message The WhatsApp message text
   * @returns True if it's a start command
   */
  isStartCommand(message: string): boolean {
    return this.commandParser.isStartCommand(message);
  }

  /**
   * Get usage instructions for referral codes
   * 
   * Returns formatted instructions for users on how to use referral codes.
   * 
   * @returns Usage instructions message
   */
  getUsageInstructions(): string {
    return this.messageService.usageInstructions();
  }

  /**
   * Clean up expired referral codes (maintenance operation)
   * 
   * Redis handles TTL automatically, but this method can be used
   * for manual cleanup or monitoring purposes.
   * 
   * @param phoneNumber The phone number to clean up
   */
  async cleanupExpiredCode(phoneNumber: string): Promise<void> {
    try {
      await this.redisService.removeReferralCode(phoneNumber);
    } catch (error) {
      console.error("Error cleaning up expired code:", error);
      // Non-critical operation, don't throw
    }
  }
}