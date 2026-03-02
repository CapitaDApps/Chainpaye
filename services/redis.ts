import { createClient } from "redis";
import { RedisStorageService, RedisOperationError } from "../types/referral-capture.types";

class RedisClient implements RedisStorageService {
  private client;
  private isConnected = false;

  constructor() {
    this.client = createClient({});
    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.client.on("connect", () => {
      this.isConnected = true;
      console.log("Connected to Redis");
    });
    this.client.on("disconnect", () => {
      this.isConnected = false;
      console.log("Disconnected from Redis");
    });
    this.client.connect().catch(err => console.error("Failed to connect to Redis:", err));
  }

  private ensureConnection() {
    if (!this.isConnected) {
      throw new RedisOperationError("Redis client is not connected", "connection_check");
    }
  }

  async set(key: string, value: string, expiryMode: "EX", ttl?: number) {
    try {
      this.ensureConnection();
      if (ttl) {
        await this.client.set(key, value, { EX: ttl });
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      throw new RedisOperationError(`Failed to set key ${key}: ${error}`, "set");
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      this.ensureConnection();
      return this.client.get(key);
    } catch (error) {
      throw new RedisOperationError(`Failed to get key ${key}: ${error}`, "get");
    }
  }

  async del(key: string) {
    try {
      this.ensureConnection();
      await this.client.del(key);
    } catch (error) {
      throw new RedisOperationError(`Failed to delete key ${key}: ${error}`, "del");
    }
  }

  async getOrSetCache<T>(
    key: string,
    func: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const data = await this.get(key);

    if (!data) {
      const data = await func();
      if (ttl) {
        await this.set(key, JSON.stringify(data), "EX", ttl);
      } else {
        await this.set(key, JSON.stringify(data), "EX");
      }
      return data;
    }

    return JSON.parse(data);
  }

  // Referral code capture specific methods
  
  /**
   * Store a referral code temporarily with 24-hour expiration
   * 
   * @param phoneNumber The user's phone number (used as key identifier)
   * @param referralCode The referral code to store
   * @throws RedisOperationError if storage fails
   * 
   * Validates: Requirements 2.2, 10.1, 10.2
   */
  async storeReferralCode(phoneNumber: string, referralCode: string): Promise<void> {
    const key = this.getReferralKey(phoneNumber);
    const ttl = 24 * 60 * 60; // 24 hours in seconds
    
    try {
      await this.set(key, referralCode, "EX", ttl);
    } catch (error) {
      throw new RedisOperationError(
        `Failed to store referral code for ${phoneNumber}: ${error}`, 
        "storeReferralCode"
      );
    }
  }

  /**
   * Retrieve a stored referral code for a phone number
   * 
   * @param phoneNumber The user's phone number
   * @returns The stored referral code or null if not found/expired
   * @throws RedisOperationError if retrieval fails
   * 
   * Validates: Requirements 2.1.1, 10.3
   */
  async retrieveReferralCode(phoneNumber: string): Promise<string | null> {
    const key = this.getReferralKey(phoneNumber);
    
    try {
      return await this.get(key);
    } catch (error) {
      throw new RedisOperationError(
        `Failed to retrieve referral code for ${phoneNumber}: ${error}`, 
        "retrieveReferralCode"
      );
    }
  }

  /**
   * Remove a stored referral code (cleanup after relationship creation)
   * 
   * @param phoneNumber The user's phone number
   * @throws RedisOperationError if removal fails
   * 
   * Validates: Requirements 10.4
   */
  async removeReferralCode(phoneNumber: string): Promise<void> {
    const key = this.getReferralKey(phoneNumber);
    
    try {
      await this.del(key);
    } catch (error) {
      throw new RedisOperationError(
        `Failed to remove referral code for ${phoneNumber}: ${error}`, 
        "removeReferralCode"
      );
    }
  }

  /**
   * Set expiration time for a key
   * 
   * @param key The Redis key
   * @param ttlSeconds Time to live in seconds
   * @throws RedisOperationError if operation fails
   */
  async setExpiration(key: string, ttlSeconds: number): Promise<void> {
    try {
      this.ensureConnection();
      await this.client.expire(key, ttlSeconds);
    } catch (error) {
      throw new RedisOperationError(
        `Failed to set expiration for key ${key}: ${error}`, 
        "setExpiration"
      );
    }
  }

  /**
   * Get the TTL (time to live) for a key
   * 
   * @param key The Redis key
   * @returns TTL in seconds, or -1 if key doesn't exist, -2 if key exists but has no TTL
   */
  async ttl(key: string): Promise<number> {
    try {
      this.ensureConnection();
      return await this.client.ttl(key);
    } catch (error) {
      throw new RedisOperationError(`Failed to get TTL for key ${key}: ${error}`, "ttl");
    }
  }

  /**
   * Quit the Redis connection
   */
  async quit(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.quit();
      }
    } catch (error) {
      console.warn("Redis quit error:", error);
    }
  }

  /**
   * Generate the Redis key for storing referral codes
   * 
   * @param phoneNumber The user's phone number
   * @returns The formatted Redis key
   */
  private getReferralKey(phoneNumber: string): string {
    return `referral:temp:${phoneNumber}`;
  }
}

export const redisClient = new RedisClient();
