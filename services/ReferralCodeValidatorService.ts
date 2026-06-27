/**
 * ReferralCodeValidatorService
 * 
 * Validates referral codes against the database and retrieves referrer information.
 * Integrates with the existing ReferralService for code validation.
 * 
 * Validates: Requirements 2.1, 2.3, 2.4
 */

import { User } from "../models/User";
import { 
  ReferralCodeValidator, 
  ValidationResult, 
  ReferrerInfo 
} from "../types/referral-capture.types";

export class ReferralCodeValidatorService implements ReferralCodeValidator {

  /**
   * Validate that a referral code exists in the system
   * 
   * Checks the database for a user with the given referral code
   * and returns validation results with appropriate error messages.
   * 
   * @param code The referral code to validate
   * @returns ValidationResult with validation status and error details
   * 
   * Validates: Requirements 2.1, 2.4
   */
  async validateCode(code: string): Promise<ValidationResult> {
    try {
      // Basic format validation
      if (!code || typeof code !== 'string') {
        return {
          isValid: false,
          errorMessage: "Referral code is required."
        };
      }

      const trimmedCode = code.trim().toUpperCase();

      // Length validation
      if (trimmedCode.length < 6 || trimmedCode.length > 12) {
        return {
          isValid: false,
          errorMessage: "Referral code must be between 6-12 characters long."
        };
      }

      // Alphanumeric validation
      if (!/^[A-Z0-9]+$/.test(trimmedCode)) {
        return {
          isValid: false,
          errorMessage: "Referral code must contain only letters and numbers."
        };
      }

      // Database lookup
      const user = await User.findOne({ referralCode: trimmedCode });

      if (!user) {
        return {
          isValid: false,
          errorMessage: "Invalid referral code. Please check and try again."
        };
      }

      return {
        isValid: true,
        referrerId: user.userId
      };

    } catch (error) {
      console.error("Error validating referral code:", error);
      return {
        isValid: false,
        errorMessage: "Unable to validate referral code. Please try again later."
      };
    }
  }

  /**
   * Get referrer information for a valid referral code
   * 
   * Retrieves the referrer's details for personalized messaging.
   * Returns null if the code is invalid or user not found.
   * 
   * @param code The referral code to look up
   * @returns ReferrerInfo object or null if not found
   * 
   * Validates: Requirements 2.3
   */
  async getReferrerInfo(code: string): Promise<ReferrerInfo | null> {
    try {
      const trimmedCode = code.trim().toUpperCase();
      
      const user = await User.findOne({ referralCode: trimmedCode });

      if (!user || !user.referralCode) {
        return null;
      }

      return {
        id: user.userId,
        name: user.firstName || user.fullName || "ChainPaye User",
        referralCode: user.referralCode
      };

    } catch (error) {
      console.error("Error getting referrer info:", error);
      return null;
    }
  }

  /**
   * Validate referral code and prevent self-referral
   * 
   * Enhanced validation that checks if the user is trying to refer themselves.
   * 
   * @param code The referral code to validate
   * @param userId The ID of the user attempting to use the code
   * @returns ValidationResult with self-referral prevention
   * 
   * Validates: Requirements 2.1.7
   */
  async validateCodeForUser(code: string, userId: string): Promise<ValidationResult> {
    try {
      // First perform standard validation
      const standardValidation = await this.validateCode(code);
      
      if (!standardValidation.isValid) {
        return standardValidation;
      }

      // Check for self-referral
      if (standardValidation.referrerId === userId) {
        return {
          isValid: false,
          errorMessage: "You cannot use your own referral code."
        };
      }

      return standardValidation;

    } catch (error) {
      console.error("Error validating referral code for user:", error);
      return {
        isValid: false,
        errorMessage: "Unable to validate referral code. Please try again later."
      };
    }
  }

  /**
   * Check if user already has a referral relationship
   * 
   * Validates that the user hasn't already been referred by someone else.
   * 
   * @param userId The user ID to check
   * @returns True if user already has a referrer, false otherwise
   * 
   * Validates: Requirements 2.1.6
   */
  async userAlreadyReferred(userId: string): Promise<boolean> {
    try {
      const user = await User.findOne({ userId });
      return !!(user && user.referredBy);
    } catch (error) {
      console.error("Error checking if user already referred:", error);
      return false;
    }
  }

  /**
   * Validate referral code and get referrer info in one call
   * 
   * Convenience method that combines validation and info retrieval
   * for efficient processing.
   * 
   * @param code The referral code to validate and look up
   * @returns Object with validation result and referrer info
   */
  async validateAndGetReferrer(code: string): Promise<{
    validation: ValidationResult;
    referrer: ReferrerInfo | null;
  }> {
    const validation = await this.validateCode(code);
    
    if (!validation.isValid) {
      return {
        validation,
        referrer: null
      };
    }

    const referrer = await this.getReferrerInfo(code);
    
    return {
      validation,
      referrer
    };
  }

  /**
   * Enhanced validation for signup process
   * 
   * Performs comprehensive validation including self-referral and existing relationship checks.
   * 
   * @param code The referral code to validate
   * @param userId The user ID attempting to use the code
   * @returns Object with validation result and referrer info
   * 
   * Validates: Requirements 2.1.4, 2.1.6, 2.1.7
   */
  async validateForSignup(code: string, userId: string): Promise<{
    validation: ValidationResult;
    referrer: ReferrerInfo | null;
  }> {
    try {
      // Check if user already has a referral relationship
      const alreadyReferred = await this.userAlreadyReferred(userId);
      if (alreadyReferred) {
        return {
          validation: {
            isValid: false,
            errorMessage: "You already have a referral relationship and cannot change it."
          },
          referrer: null
        };
      }

      // Validate code with self-referral prevention
      const validation = await this.validateCodeForUser(code, userId);
      
      if (!validation.isValid) {
        return {
          validation,
          referrer: null
        };
      }

      // Get referrer info
      const referrer = await this.getReferrerInfo(code);
      
      return {
        validation,
        referrer
      };

    } catch (error) {
      console.error("Error validating referral code for signup:", error);
      return {
        validation: {
          isValid: false,
          errorMessage: "Unable to validate referral code. Please try again later."
        },
        referrer: null
      };
    }
  }

  /**
   * Check if a referral code exists without detailed validation
   * 
   * Quick existence check for performance-sensitive operations.
   * 
   * @param code The referral code to check
   * @returns True if code exists, false otherwise
   */
  async codeExists(code: string): Promise<boolean> {
    try {
      const trimmedCode = code.trim().toUpperCase();
      const user = await User.findOne({ referralCode: trimmedCode });
      return user !== null;
    } catch (error) {
      console.error("Error checking code existence:", error);
      return false;
    }
  }

  /**
   * Validate multiple referral codes at once
   * 
   * Batch validation for efficiency when processing multiple codes.
   * 
   * @param codes Array of referral codes to validate
   * @returns Array of validation results in the same order
   */
  async validateMultipleCodes(codes: string[]): Promise<ValidationResult[]> {
    const validationPromises = codes.map(code => this.validateCode(code));
    return Promise.all(validationPromises);
  }
}