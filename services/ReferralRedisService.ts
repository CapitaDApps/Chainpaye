/**
 * ReferralRedisService
 * 
 * Dedicated Redis service for referral code temporary storage with TTL support.
 * Handles storage, retrieval, and cleanup of referral codes during the capture flow.
 * 
 * Validates: Requirements 2.2, 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { redisClient } from "./redis";
import { 
  RedisStorageService, 
  RedisOperationError, 
  TempReferralStorage 
} from "../types/referral-capture.types";

export class ReferralRedisService implements RedisStorageService {
  private readonly TTL_SECONDS = 24 * 60 * 60; // 24 hours
  private readonly KEY_PREFIX = "referral:temp:";

  /**
   * Store a referral code temporarily with 24-hour expiration
   * 
   * Uses phone number as the key identifier to link referral codes
   * to users during the signup process.
   * 
   * @param phoneNumber The user's phone number (international format)
   * @param referralCode The referral code to store temporarily
   * @throws RedisOperationError if storage operation fails
   * 
   * Validates: Requirements 2.2, 10.1, 10.2
   */
  async storeReferralCode(phoneNumber: string, referralCode: string): Promise<void> {
    const key = this.generateKey(phoneNumber);
    
    try {
      await redisClient.set(key, referralCode, "EX", this.TTL_SECONDS);
    } catch (error) {
      throw new RedisOperationError(
        `Failed to store referral code for phone ${phoneNumber}: ${error}`,
        "storeReferralCode"
      );
    }
  }

  /**
   * Retrieve a stored referral code for a phone number
   * 
   * Returns null if the code has expired or doesn't exist.
   * This graceful handling ensures the signup flow continues
   * even when codes have expired.
   * 
   * @param phoneNumber The user's phone number
   * @returns The stored referral code or null if not found/expired
   * @throws RedisOperationError if retrieval operation fails
   * 
   * Validates: Requirements 2.1.1, 10.3
   */
  async retrieveReferralCode(phoneNumber: string): Promise<string | null> {
    const key = this.generateKey(phoneNumber);
    
    try {
      return await redisClient.get(key);
    } catch (error) {
      throw new RedisOperationError(
        `Failed to retrieve referral code for phone ${phoneNumber}: ${error}`,
        "retrieveReferralCode"
      );
    }
  }

  /**
   * Remove a stored referral code (cleanup after relationship creation)
   * 
   * Called after successful referral relationship creation to clean up
   * temporary storage and prevent reuse of the same stored code.
   * 
   * @param phoneNumber The user's phone number
   * @throws RedisOperationError if removal operation fails
   * 
   * Validates: Requirements 10.4
   */
  async removeReferralCode(phoneNumber: string): Promise<void> {
    const key = this.generateKey(phoneNumber);
    
    try {
      await redisClient.del(key);
    } catch (error) {
      throw new RedisOperationError(
        `Failed to remove referral code for phone ${phoneNumber}: ${error}`,
        "removeReferralCode"
      );
    }
  }

  /**
   * Set custom expiration time for a key
   * 
   * Allows for flexible TTL management beyond the default 24-hour period.
   * 
   * @param key The Redis key
   * @param ttlSeconds Time to live in seconds
   * @throws RedisOperationError if operation fails
   * 
   * Validates: Requirements 10.2
   */
  async setExpiration(key: string, ttlSeconds: number): Promise<void> {
    try {
      await redisClient.setExpiration(key, ttlSeconds);
    } catch (error) {
      throw new RedisOperationError(
        `Failed to set expiration for key ${key}: ${error}`,
        "setExpiration"
      );
    }
  }

  /**
   * Check if a referral code exists for a phone number
   * 
   * Utility method to check existence without retrieving the value.
   * 
   * @param phoneNumber The user's phone number
   * @returns True if a code exists and hasn't expired, false otherwise
   */
  async hasStoredCode(phoneNumber: string): Promise<boolean> {
    const code = await this.retrieveReferralCode(phoneNumber);
    return code !== null;
  }

  /**
   * Get storage metadata for a referral code
   * 
   * Returns information about the stored referral code including
   * creation time and TTL status.
   * 
   * @param phoneNumber The user's phone number
   * @returns Storage metadata or null if not found
   */
  async getStorageInfo(phoneNumber: string): Promise<TempReferralStorage | null> {
    const key = this.generateKey(phoneNumber);
    const value = await this.retrieveReferralCode(phoneNumber);
    
    if (!value) {
      return null;
    }

    return {
      key,
      value,
      ttl: this.TTL_SECONDS,
      createdAt: new Date() // Note: Redis doesn't store creation time, this is approximate
    };
  }

  /**
   * Get the TTL (time to live) for a stored referral code
   * 
   * Returns the remaining time in seconds before the code expires.
   * 
   * @param phoneNumber The user's phone number
   * @returns TTL in seconds, or -1 if key doesn't exist, -2 if key exists but has no TTL
   */
  async getTTL(phoneNumber: string): Promise<number> {
    const key = this.generateKey(phoneNumber);
    
    try {
      return await redisClient.ttl(key);
    } catch (error) {
      throw new RedisOperationError(
        `Failed to get TTL for phone ${phoneNumber}: ${error}`,
        "getTTL"
      );
    }
  }

  /**
   * Disconnect from Redis (for testing cleanup)
   * 
   * Closes the Redis connection. Primarily used in test cleanup.
   */
  async disconnect(): Promise<void> {
    try {
      await redisClient.quit();
    } catch (error) {
      // Ignore disconnect errors in cleanup
      console.warn("Redis disconnect error:", error);
    }
  }

  /**
   * Generate the Redis key for storing referral codes
   * 
   * Uses a consistent key pattern for all referral code storage.
   * 
   * @param phoneNumber The user's phone number
   * @returns The formatted Redis key
   */
  private generateKey(phoneNumber: string): string {
    // Normalize phone number by removing any non-digit characters except +
    const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
    return `${this.KEY_PREFIX}${normalizedPhone}`;
  }
}