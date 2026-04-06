/**
 * ReferralService
 * 
 * Manages referral relationships and validation for the ChainPaye referral system.
 * Handles referral code creation, validation, relationship management, and period tracking.
 * 
 * Validates: Requirements 1.1, 2.1, 2.2, 2.4, 2.5, 8.2
 */

import { User } from "../models/User";
import { ReferralRelationship, IReferralRelationship } from "../models/ReferralRelationship";
import { ReferralCodeGenerator } from "./ReferralCodeGenerator";

/**
 * Error thrown when attempting to create a duplicate referral relationship
 */
export class DuplicateReferralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateReferralError";
  }
}

/**
 * Error thrown when attempting self-referral
 */
export class SelfReferralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfReferralError";
  }
}

/**
 * Error thrown when referral code is invalid
 */
export class InvalidReferralCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReferralCodeError";
  }
}

export class ReferralService {
  private codeGenerator: ReferralCodeGenerator;

  constructor() {
    this.codeGenerator = new ReferralCodeGenerator();
  }

  /**
   * Create a unique referral code for a user
   * 
   * Generates a unique alphanumeric code and assigns it to the user.
   * This is typically called after KYC completion.
   * 
   * @param userId The user ID to create a referral code for
   * @returns Promise<string> The generated referral code
   * @throws Error if code generation fails or user not found
   * 
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4
   */
  async createReferralCode(userId: string): Promise<string> {
    // Find the user
    const user = await User.findOne({ userId });
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Check if user already has a referral code
    if (user.referralCode) {
      return user.referralCode;
    }

    // Generate unique code
    const code = await this.codeGenerator.generateCode();

    // Assign code to user
    user.referralCode = code;
    await user.save();

    return code;
  }

  /**
   * Validate that a referral code exists in the system
   * 
   * @param code The referral code to validate
   * @returns Promise<boolean> True if code exists, false otherwise
   * 
   * Validates: Requirements 2.1
   */
  async validateReferralCode(code: string): Promise<boolean> {
    const user = await User.findOne({ referralCode: code });
    return user !== null;
  }

  /**
   * Create an immutable referral relationship between two users
   * 
   * Validates the referral code, prevents self-referrals, and ensures
   * referral relationships are immutable (one-time creation only).
   * 
   * @param referredUserId The user ID being referred
   * @param referralCode The referral code used
   * @returns Promise<IReferralRelationship> The created relationship
   * @throws InvalidReferralCodeError if code doesn't exist
   * @throws SelfReferralError if user tries to refer themselves
   * @throws DuplicateReferralError if user already has a referral relationship
   * 
   * Validates: Requirements 2.1, 2.2, 2.4, 2.5
   */
  async createReferralRelationship(
    referredUserId: string,
    referralCode: string
  ): Promise<IReferralRelationship> {
    // Validate referral code exists
    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      throw new InvalidReferralCodeError("Invalid referral code. Please check and try again.");
    }

    // Prevent self-referral
    if (referrer.userId === referredUserId) {
      throw new SelfReferralError("You cannot use your own referral code.");
    }

    // Check if user already has a referral relationship (immutability check)
    const existingRelationship = await ReferralRelationship.findOne({
      referredUserId,
    });
    if (existingRelationship) {
      throw new DuplicateReferralError("You have already been referred by another user.");
    }

    // Create the referral relationship
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days from creation
    
    const relationship = new ReferralRelationship({
      referrerId: referrer.userId,
      referredUserId,
      referralCode,
      createdAt,
      expiresAt,
    });

    await relationship.save();

    // Update the referred user's record
    const referredUser = await User.findOne({ userId: referredUserId });
    if (referredUser) {
      referredUser.referredBy = referrer.userId;
      referredUser.referredAt = createdAt;
      await referredUser.save();
    }

    return relationship;
  }

  /**
   * Get the referral relationship for a referred user
   * 
   * @param userId The user ID to look up (as referred user)
   * @returns Promise<IReferralRelationship | null> The relationship or null if none exists
   * 
   * Validates: Requirements 2.2, 8.1
   */
  async getReferralRelationship(userId: string): Promise<IReferralRelationship | null> {
    return await ReferralRelationship.findOne({ referredUserId: userId });
  }

  /**
   * Check if a referral relationship is within the 30-day earning period
   * 
   * The referral period is 30 days from the createdAt timestamp.
   * After 30 days, referrers no longer earn from their referred users' transactions.
   * 
   * @param relationship The referral relationship to check
   * @returns boolean True if within 30-day period, false otherwise
   * 
   * Validates: Requirements 3.3, 3.4, 8.2
   */
  isWithinReferralPeriod(relationship: IReferralRelationship): boolean {
    const now = new Date();
    const expiresAt = relationship.expiresAt;
    
    return now <= expiresAt;
  }
}
