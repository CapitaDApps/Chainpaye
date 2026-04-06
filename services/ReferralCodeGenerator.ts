import crypto from "crypto";
import { User } from "../models/User";

/**
 * ReferralCodeGenerator
 * 
 * Generates unique alphanumeric referral codes for users.
 * Codes are between 6-12 characters in length and use cryptographically
 * secure random generation.
 */
export class ReferralCodeGenerator {
  private static readonly MIN_LENGTH = 6;
  private static readonly MAX_LENGTH = 12;
  private static readonly MAX_RETRIES = 5;
  private static readonly ALPHANUMERIC_CHARS = 
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  /**
   * Generate a unique referral code
   * 
   * @returns Promise<string> A unique alphanumeric referral code
   * @throws Error if unable to generate unique code after MAX_RETRIES attempts
   */
  async generateCode(): Promise<string> {
    for (let attempt = 0; attempt < ReferralCodeGenerator.MAX_RETRIES; attempt++) {
      const code = this.generateRandomCode();
      
      if (await this.isCodeUnique(code)) {
        return code;
      }
    }
    
    throw new Error(
      `Failed to generate unique referral code after ${ReferralCodeGenerator.MAX_RETRIES} attempts`
    );
  }

  /**
   * Check if a referral code is unique in the database
   * 
   * @param code The referral code to check
   * @returns Promise<boolean> True if code is unique, false otherwise
   */
  async isCodeUnique(code: string): Promise<boolean> {
    const existingUser = await User.findOne({ referralCode: code });
    return existingUser === null;
  }

  /**
   * Generate a random alphanumeric code
   * 
   * Uses crypto.randomBytes for cryptographically secure random generation.
   * Code length is randomly selected between MIN_LENGTH and MAX_LENGTH.
   * 
   * @returns string A random alphanumeric code
   */
  private generateRandomCode(): string {
    // Randomly select length between MIN_LENGTH and MAX_LENGTH
    const length = 
      ReferralCodeGenerator.MIN_LENGTH + 
      Math.floor(
        Math.random() * 
        (ReferralCodeGenerator.MAX_LENGTH - ReferralCodeGenerator.MIN_LENGTH + 1)
      );
    
    // Generate random bytes
    const randomBytes = crypto.randomBytes(length);
    
    // Convert bytes to alphanumeric characters
    let code = "";
    for (let i = 0; i < length; i++) {
      const byte = randomBytes[i];
      if (byte === undefined) {
        throw new Error("Failed to generate random bytes");
      }
      const index = byte % ReferralCodeGenerator.ALPHANUMERIC_CHARS.length;
      code += ReferralCodeGenerator.ALPHANUMERIC_CHARS[index];
    }
    
    return code;
  }
}
