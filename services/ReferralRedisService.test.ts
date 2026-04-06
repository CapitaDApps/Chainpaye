/**
 * Unit tests for ReferralRedisService
 * Tests Redis storage functionality for referral code capture
 */

import { ReferralRedisService } from "./ReferralRedisService";
import { redisClient } from "./redis";
import { RedisOperationError } from "../types/referral-capture.types";

// Mock the redis client
jest.mock("./redis", () => ({
  redisClient: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    setExpiration: jest.fn()
  }
}));

describe("ReferralRedisService", () => {
  let service: ReferralRedisService;
  const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;

  beforeEach(() => {
    service = new ReferralRedisService();
    jest.clearAllMocks();
  });

  describe("storeReferralCode", () => {
    it("should store referral code with 24-hour TTL", async () => {
      const phoneNumber = "+1234567890";
      const referralCode = "ABC123";

      await service.storeReferralCode(phoneNumber, referralCode);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "referral:temp:+1234567890",
        "ABC123",
        "EX",
        86400 // 24 hours in seconds
      );
    });

    it("should normalize phone number in key", async () => {
      const phoneNumber = "+1 (234) 567-8900";
      const referralCode = "XYZ789";

      await service.storeReferralCode(phoneNumber, referralCode);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "referral:temp:+12345678900",
        "XYZ789",
        "EX",
        86400
      );
    });

    it("should throw RedisOperationError on failure", async () => {
      mockRedisClient.set.mockRejectedValue(new Error("Redis connection failed"));

      await expect(
        service.storeReferralCode("+1234567890", "ABC123")
      ).rejects.toThrow(RedisOperationError);
    });
  });

  describe("retrieveReferralCode", () => {
    it("should retrieve stored referral code", async () => {
      const phoneNumber = "+1234567890";
      mockRedisClient.get.mockResolvedValue("ABC123");

      const result = await service.retrieveReferralCode(phoneNumber);

      expect(result).toBe("ABC123");
      expect(mockRedisClient.get).toHaveBeenCalledWith("referral:temp:+1234567890");
    });

    it("should return null for non-existent code", async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.retrieveReferralCode("+1234567890");

      expect(result).toBeNull();
    });

    it("should throw RedisOperationError on failure", async () => {
      mockRedisClient.get.mockRejectedValue(new Error("Redis connection failed"));

      await expect(
        service.retrieveReferralCode("+1234567890")
      ).rejects.toThrow(RedisOperationError);
    });
  });

  describe("removeReferralCode", () => {
    it("should remove stored referral code", async () => {
      const phoneNumber = "+1234567890";

      await service.removeReferralCode(phoneNumber);

      expect(mockRedisClient.del).toHaveBeenCalledWith("referral:temp:+1234567890");
    });

    it("should throw RedisOperationError on failure", async () => {
      mockRedisClient.del.mockRejectedValue(new Error("Redis connection failed"));

      await expect(
        service.removeReferralCode("+1234567890")
      ).rejects.toThrow(RedisOperationError);
    });
  });

  describe("hasStoredCode", () => {
    it("should return true when code exists", async () => {
      mockRedisClient.get.mockResolvedValue("ABC123");

      const result = await service.hasStoredCode("+1234567890");

      expect(result).toBe(true);
    });

    it("should return false when code doesn't exist", async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.hasStoredCode("+1234567890");

      expect(result).toBe(false);
    });
  });

  describe("getStorageInfo", () => {
    it("should return storage info for existing code", async () => {
      mockRedisClient.get.mockResolvedValue("ABC123");

      const result = await service.getStorageInfo("+1234567890");

      expect(result).toEqual({
        key: "referral:temp:+1234567890",
        value: "ABC123",
        ttl: 86400,
        createdAt: expect.any(Date)
      });
    });

    it("should return null for non-existent code", async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.getStorageInfo("+1234567890");

      expect(result).toBeNull();
    });
  });

  describe("setExpiration", () => {
    it("should set custom expiration", async () => {
      const key = "test:key";
      const ttl = 3600;

      await service.setExpiration(key, ttl);

      expect(mockRedisClient.setExpiration).toHaveBeenCalledWith(key, ttl);
    });

    it("should throw RedisOperationError on failure", async () => {
      mockRedisClient.setExpiration.mockRejectedValue(new Error("Redis connection failed"));

      await expect(
        service.setExpiration("test:key", 3600)
      ).rejects.toThrow(RedisOperationError);
    });
  });
});