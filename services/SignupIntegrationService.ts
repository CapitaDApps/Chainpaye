/**
 * SignupIntegrationService
 * 
 * Handles integration of referral codes with the signup flow.
 * Retrieves stored referral codes from Redis and pre-populates signup forms.
 * Manages the complete flow from Redis lookup to referral relationship creation.
 * 
 * Validates: Requirements 2.1.1, 2.1.2, 2.1.4, 2.1.5, 2.1.6, 2.1.7, 10.4
 */

import { SignupIntegrationService, SignupFormData } from "../types/referral-capture.types";
import { ReferralRedisService } from "./ReferralRedisService";
import { ReferralService } from "./ReferralService";
import { logger } from "../utils/logger";

export class SignupIntegrationServiceImpl implements SignupIntegrationService {
  private redisService: ReferralRedisService;
  private referralService: ReferralService;

  constructor(
    redisService?: ReferralRedisService,
    referralService?: ReferralService
  ) {
    this.redisService = redisService || new ReferralRedisService();
    this.referralService = referralService || new ReferralService();
  }

  /**
   * Get stored referral code for a phone number during signup initialization
   * 
   * Checks Redis for any temporarily stored referral code associated with
   * the user's phone number. Returns null if no code exists or has expired.
   * 
   * @param phoneNumber The user's phone number in international format
   * @returns Promise<string | null> The stored referral code or null
   * 
   * Validates: Requirements 2.1.1, 10.3
   */
  async getStoredReferralCode(phoneNumber: string): Promise<string | null> {
    try {
      const code = await this.redisService.retrieveReferralCode(phoneNumber);
      logger.info("Retrieved referral code from Redis", { 
        phoneNumber, 
        hasCode: !!code 
      });
      return code;
    } catch (error) {
      // Log error but don't fail signup process
      logger.error("Failed to retrieve referral code", { 
        phoneNumber,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Pre-populate referral field data for signup form
   * 
   * Retrieves any stored referral code and prepares form data with
   * pre-population status. The referral field remains optional and editable.
   * 
   * @param phoneNumber The user's phone number
   * @returns Promise<SignupFormData> Form data with referral code and pre-population status
   * 
   * Validates: Requirements 2.1.1, 2.1.2, 2.1.3
   */
  async prePopulateReferralField(phoneNumber: string): Promise<SignupFormData> {
    const storedCode = await this.getStoredReferralCode(phoneNumber);
    
    if (storedCode) {
      return {
        referralCode: storedCode,
        isPrePopulated: true
      };
    } else {
      return {
        isPrePopulated: false
      };
    }
  }

  /**
   * Process referral code during signup completion
   * 
   * Validates the referral code again and creates an immutable referral relationship
   * if valid. Cleans up temporary Redis storage after successful relationship creation.
   * Handles all business rule validations including self-referral prevention and
   * duplicate relationship checks.
   * 
   * @param userId The ID of the user completing signup
   * @param referralCode The referral code provided during signup (optional)
   * @throws InvalidReferralCodeError if code is invalid
   * @throws SelfReferralError if user tries to refer themselves
   * @throws DuplicateReferralError if user already has a referral relationship
   * 
   * Validates: Requirements 2.1.4, 2.1.5, 2.1.6, 2.1.7, 10.4
   */
  async processReferralOnSignup(userId: string, referralCode?: string): Promise<void> {
    // If no referral code provided, nothing to process
    if (!referralCode || referralCode.trim() === '') {
      logger.info("No referral code provided for signup", { userId });
      return;
    }

    logger.info("Processing referral code on signup", { 
      userId, 
      referralCode: referralCode.trim() 
    });

    try {
      // Create referral relationship (includes all validations)
      // This will throw appropriate errors that should be handled by the signup flow
      await this.referralService.createReferralRelationship(userId, referralCode.trim());
      
      logger.info("Referral relationship created successfully", { 
        userId, 
        referralCode: referralCode.trim() 
      });
    } catch (error) {
      logger.error("Failed to create referral relationship", {
        userId,
        referralCode: referralCode.trim(),
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      });
      throw error; // Re-throw to let caller handle
    }
  }

  /**
   * Clean up temporary referral code storage after successful signup
   * 
   * Removes the temporarily stored referral code from Redis to prevent reuse.
   * This is called after successful referral relationship creation.
   * 
   * @param phoneNumber The user's phone number
   * 
   * Validates: Requirements 10.4
   */
  async cleanupTemporaryStorage(phoneNumber: string): Promise<void> {
    try {
      await this.redisService.removeReferralCode(phoneNumber);
      logger.info("Cleaned up temporary referral code storage", { phoneNumber });
    } catch (error) {
      // Log error but don't fail the signup process
      logger.error("Failed to cleanup referral code", { 
        phoneNumber,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Check if a user has an existing referral relationship
   * 
   * Utility method to check if a user already has a referral relationship
   * before attempting to create a new one.
   * 
   * @param userId The user ID to check
   * @returns Promise<boolean> True if user has existing referral relationship
   * 
   * Validates: Requirements 2.1.6
   */
  async hasExistingReferralRelationship(userId: string): Promise<boolean> {
    const relationship = await this.referralService.getReferralRelationship(userId);
    return relationship !== null;
  }

  /**
   * Validate referral code without creating relationship
   * 
   * Utility method to validate a referral code during form validation
   * without creating the actual relationship.
   * 
   * @param referralCode The referral code to validate
   * @returns Promise<boolean> True if code is valid
   * 
   * Validates: Requirements 2.1.4
   */
  async validateReferralCode(referralCode: string): Promise<boolean> {
    if (!referralCode || referralCode.trim() === '') {
      return false;
    }
    
    return await this.referralService.validateReferralCode(referralCode.trim());
  }
}