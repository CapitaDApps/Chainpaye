/**
 * ReferralRelationshipService
 * 
 * Handles the creation of referral relationships during signup completion.
 * Implements final validation, immutability checks, self-referral prevention,
 * and Redis cleanup after successful relationship creation.
 * 
 * Validates: Requirements 2.1.4, 2.1.5, 2.1.6, 2.1.7, 10.4
 */

import { ReferralService, InvalidReferralCodeError, SelfReferralError, DuplicateReferralError } from "./ReferralService";
import { ReferralCodeValidatorService } from "./ReferralCodeValidatorService";
import { ReferralRedisService } from "./ReferralRedisService";
import { User } from "../models/User";
import { IReferralRelationship } from "../models/ReferralRelationship";
import { logger } from "../utils/logger";

/**
 * Result of referral relationship creation attempt
 */
export interface ReferralRelationshipResult {
  success: boolean;
  relationship?: IReferralRelationship;
  error?: string;
  errorType?: 'INVALID_CODE' | 'SELF_REFERRAL' | 'DUPLICATE_RELATIONSHIP' | 'USER_NOT_FOUND' | 'SYSTEM_ERROR';
}

/**
 * Options for referral relationship creation
 */
export interface CreateReferralRelationshipOptions {
  phoneNumber?: string; // For Redis cleanup
  skipRedisCleanup?: boolean; // For testing or special cases
}

export class ReferralRelationshipService {
  private referralService: ReferralService;
  private validatorService: ReferralCodeValidatorService;
  private redisService: ReferralRedisService;

  constructor(
    referralService?: ReferralService,
    validatorService?: ReferralCodeValidatorService,
    redisService?: ReferralRedisService
  ) {
    this.referralService = referralService || new ReferralService();
    this.validatorService = validatorService || new ReferralCodeValidatorService();
    this.redisService = redisService || new ReferralRedisService();
  }

  /**
   * Create a referral relationship during signup completion
   * 
   * Performs comprehensive validation including:
   * - Final referral code validation
   * - Self-referral prevention
   * - Existing relationship immutability checks
   * - User existence validation
   * 
   * After successful creation, cleans up temporary Redis storage.
   * 
   * @param userId The ID of the user completing signup
   * @param referralCode The referral code provided during signup
   * @param options Additional options for the creation process
   * @returns Promise<ReferralRelationshipResult> Result of the creation attempt
   * 
   * Validates: Requirements 2.1.4, 2.1.5, 2.1.6, 2.1.7, 10.4
   */
  async createReferralRelationship(
    userId: string,
    referralCode: string,
    options: CreateReferralRelationshipOptions = {}
  ): Promise<ReferralRelationshipResult> {
    try {
      logger.info("Creating referral relationship", { 
        userId, 
        referralCode,
        hasPhoneNumber: !!options.phoneNumber 
      });

      // Validate input parameters
      if (!userId) {
        logger.warn("Missing userId in createReferralRelationship");
        return {
          success: false,
          error: "User ID and referral code are required.",
          errorType: 'SYSTEM_ERROR'
        };
      }

      if (referralCode === null || referralCode === undefined) {
        logger.warn("Missing referralCode in createReferralRelationship");
        return {
          success: false,
          error: "User ID and referral code are required.",
          errorType: 'SYSTEM_ERROR'
        };
      }

      const trimmedCode = referralCode.trim();
      if (!trimmedCode) {
        logger.warn("Empty referral code provided", { userId });
        return {
          success: false,
          error: "Referral code cannot be empty.",
          errorType: 'INVALID_CODE'
        };
      }

      // Verify user exists
      const user = await User.findOne({ userId });
      if (!user) {
        logger.error("User not found", { userId });
        return {
          success: false,
          error: "User not found.",
          errorType: 'USER_NOT_FOUND'
        };
      }

      // Perform comprehensive validation for signup
      const validationResult = await this.validatorService.validateForSignup(trimmedCode, userId);
      
      if (!validationResult.validation.isValid) {
        const errorType = this.mapValidationErrorToType(validationResult.validation.errorMessage || '');
        logger.warn("Referral validation failed", { 
          userId, 
          referralCode: trimmedCode,
          error: validationResult.validation.errorMessage,
          errorType 
        });
        return {
          success: false,
          error: validationResult.validation.errorMessage,
          errorType
        };
      }

      // Create the referral relationship using the existing service
      const relationship = await this.referralService.createReferralRelationship(userId, trimmedCode);

      logger.info("Referral relationship created successfully", { 
        userId, 
        referralCode: trimmedCode,
        relationshipId: relationship._id 
      });

      // Clean up temporary Redis storage after successful creation
      if (options.phoneNumber && !options.skipRedisCleanup) {
        await this.cleanupRedisStorage(options.phoneNumber);
      }

      return {
        success: true,
        relationship
      };

    } catch (error: any) {
      // Handle specific referral service errors
      // Check by constructor name to work with mocked classes
      const errorName = error?.constructor?.name || '';
      
      logger.error("Error creating referral relationship", {
        userId,
        referralCode,
        error: error instanceof Error ? error.message : String(error),
        errorType: errorName,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      if (errorName === 'InvalidReferralCodeError' || error instanceof InvalidReferralCodeError) {
        return {
          success: false,
          error: error.message || "Invalid referral code",
          errorType: 'INVALID_CODE'
        };
      }

      if (errorName === 'SelfReferralError' || error instanceof SelfReferralError) {
        return {
          success: false,
          error: error.message || "Cannot refer yourself",
          errorType: 'SELF_REFERRAL'
        };
      }

      if (errorName === 'DuplicateReferralError' || error instanceof DuplicateReferralError) {
        return {
          success: false,
          error: error.message || "Already referred",
          errorType: 'DUPLICATE_RELATIONSHIP'
        };
      }

      // Handle unexpected errors
      return {
        success: false,
        error: "Unable to create referral relationship. Please try again later.",
        errorType: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Validate referral code during signup without creating relationship
   * 
   * Performs all validation checks that would be done during relationship creation
   * but without actually creating the relationship. Useful for form validation.
   * 
   * @param userId The user ID attempting to use the code
   * @param referralCode The referral code to validate
   * @returns Promise<ReferralRelationshipResult> Validation result
   * 
   * Validates: Requirements 2.1.4, 2.1.6, 2.1.7
   */
  async validateReferralForSignup(
    userId: string,
    referralCode: string
  ): Promise<ReferralRelationshipResult> {
    try {
      if (!userId || !referralCode) {
        return {
          success: false,
          error: "User ID and referral code are required.",
          errorType: 'SYSTEM_ERROR'
        };
      }

      const trimmedCode = referralCode.trim();
      if (!trimmedCode) {
        return {
          success: false,
          error: "Referral code cannot be empty.",
          errorType: 'INVALID_CODE'
        };
      }

      // Verify user exists
      const user = await User.findOne({ userId });
      if (!user) {
        return {
          success: false,
          error: "User not found.",
          errorType: 'USER_NOT_FOUND'
        };
      }

      // Perform validation without creating relationship
      const validationResult = await this.validatorService.validateForSignup(trimmedCode, userId);
      
      if (!validationResult.validation.isValid) {
        const errorType = this.mapValidationErrorToType(validationResult.validation.errorMessage || '');
        return {
          success: false,
          error: validationResult.validation.errorMessage,
          errorType
        };
      }

      return {
        success: true
      };

    } catch (error) {
      console.error("Error validating referral for signup:", error);
      return {
        success: false,
        error: "Unable to validate referral code. Please try again later.",
        errorType: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Check if user already has a referral relationship
   * 
   * Utility method to check referral relationship immutability.
   * 
   * @param userId The user ID to check
   * @returns Promise<boolean> True if user already has a referral relationship
   * 
   * Validates: Requirements 2.1.6
   */
  async hasExistingReferralRelationship(userId: string): Promise<boolean> {
    try {
      const relationship = await this.referralService.getReferralRelationship(userId);
      return relationship !== null;
    } catch (error) {
      console.error("Error checking existing referral relationship:", error);
      return false;
    }
  }

  /**
   * Get referral relationship for a user
   * 
   * Retrieves the referral relationship if it exists.
   * 
   * @param userId The user ID to look up
   * @returns Promise<IReferralRelationship | null> The relationship or null
   */
  async getReferralRelationship(userId: string): Promise<IReferralRelationship | null> {
    try {
      return await this.referralService.getReferralRelationship(userId);
    } catch (error) {
      console.error("Error getting referral relationship:", error);
      return null;
    }
  }

  /**
   * Clean up temporary Redis storage after successful relationship creation
   * 
   * Removes the temporarily stored referral code from Redis to prevent reuse
   * and maintain data consistency.
   * 
   * @param phoneNumber The user's phone number
   * 
   * Validates: Requirements 10.4
   */
  private async cleanupRedisStorage(phoneNumber: string): Promise<void> {
    try {
      await this.redisService.removeReferralCode(phoneNumber);
      logger.info("Cleaned up Redis storage after relationship creation", { phoneNumber });
    } catch (error) {
      // Log error but don't fail the relationship creation
      logger.error("Failed to cleanup Redis storage", { 
        phoneNumber,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Map validation error messages to error types
   * 
   * Converts validation error messages to standardized error types
   * for consistent error handling.
   * 
   * @param errorMessage The validation error message
   * @returns The corresponding error type
   */
  private mapValidationErrorToType(errorMessage: string): ReferralRelationshipResult['errorType'] {
    if (errorMessage.includes('own referral code')) {
      return 'SELF_REFERRAL';
    }
    
    if (errorMessage.includes('already have a referral relationship') || 
        errorMessage.includes('already been referred')) {
      return 'DUPLICATE_RELATIONSHIP';
    }
    
    if (errorMessage.includes('Invalid referral code') || 
        errorMessage.includes('must be between') ||
        errorMessage.includes('must contain only')) {
      return 'INVALID_CODE';
    }
    
    return 'SYSTEM_ERROR';
  }

  /**
   * Batch create referral relationships (for testing or migration)
   * 
   * Creates multiple referral relationships in a batch operation.
   * Useful for testing scenarios or data migration.
   * 
   * @param relationships Array of user ID and referral code pairs
   * @returns Promise<ReferralRelationshipResult[]> Results for each creation attempt
   */
  async batchCreateReferralRelationships(
    relationships: Array<{ userId: string; referralCode: string; phoneNumber?: string }>
  ): Promise<ReferralRelationshipResult[]> {
    const results: ReferralRelationshipResult[] = [];
    
    for (const { userId, referralCode, phoneNumber } of relationships) {
      const result = await this.createReferralRelationship(userId, referralCode, { phoneNumber });
      results.push(result);
    }
    
    return results;
  }

  /**
   * Get referral relationship statistics
   * 
   * Returns statistics about referral relationships for monitoring and analytics.
   * 
   * @returns Promise<object> Statistics about referral relationships
   */
  async getReferralStatistics(): Promise<{
    totalRelationships: number;
    activeRelationships: number;
    expiredRelationships: number;
  }> {
    try {
      // This would require additional queries to the ReferralRelationship model
      // For now, return placeholder values
      return {
        totalRelationships: 0,
        activeRelationships: 0,
        expiredRelationships: 0
      };
    } catch (error) {
      console.error("Error getting referral statistics:", error);
      return {
        totalRelationships: 0,
        activeRelationships: 0,
        expiredRelationships: 0
      };
    }
  }
}