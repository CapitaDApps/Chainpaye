/**
 * Unit tests for SignupIntegrationService
 * 
 * Tests specific examples and edge cases for signup integration functionality.
 * Covers Redis lookup, form pre-population, and referral relationship processing.
 */

import { SignupIntegrationServiceImpl } from "./SignupIntegrationService";
import { ReferralRedisService } from "./ReferralRedisService";
import { ReferralService, InvalidReferralCodeError, SelfReferralError, DuplicateReferralError } from "./ReferralService";

// Mock dependencies
jest.mock("./ReferralRedisService");
jest.mock("./ReferralService");

describe("SignupIntegrationService", () => {
  let service: SignupIntegrationServiceImpl;
  let mockRedisService: jest.Mocked<ReferralRedisService>;
  let mockReferralService: jest.Mocked<ReferralService>;

  beforeEach(() => {
    // Clear all mocks first
    jest.clearAllMocks();
    
    // Create mock instances
    mockRedisService = {
      retrieveReferralCode: jest.fn(),
      removeReferralCode: jest.fn(),
      storeReferralCode: jest.fn(),
      setExpiration: jest.fn(),
    } as any;

    mockReferralService = {
      createReferralRelationship: jest.fn(),
      getReferralRelationship: jest.fn(),
      validateReferralCode: jest.fn(),
    } as any;
    
    // Create service instance with mocked dependencies
    service = new SignupIntegrationServiceImpl(mockRedisService, mockReferralService);
  });

  describe("getStoredReferralCode", () => {
    it("should return stored referral code when it exists", async () => {
      const phoneNumber = "+1234567890";
      const expectedCode = "ABC123";
      
      mockRedisService.retrieveReferralCode.mockResolvedValue(expectedCode);

      const result = await service.getStoredReferralCode(phoneNumber);

      expect(result).toBe(expectedCode);
      expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledWith(phoneNumber);
    });

    it("should return null when no code is stored", async () => {
      const phoneNumber = "+1234567890";
      
      mockRedisService.retrieveReferralCode.mockResolvedValue(null);

      const result = await service.getStoredReferralCode(phoneNumber);

      expect(result).toBeNull();
      expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledWith(phoneNumber);
    });

    it("should return null when Redis operation fails", async () => {
      const phoneNumber = "+1234567890";
      
      mockRedisService.retrieveReferralCode.mockRejectedValue(new Error("Redis connection failed"));

      const result = await service.getStoredReferralCode(phoneNumber);

      expect(result).toBeNull();
      expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledWith(phoneNumber);
    });
  });

  describe("prePopulateReferralField", () => {
    it("should return pre-populated form data when code exists", async () => {
      const phoneNumber = "+1234567890";
      const storedCode = "XYZ789";
      
      mockRedisService.retrieveReferralCode.mockResolvedValue(storedCode);

      const result = await service.prePopulateReferralField(phoneNumber);

      expect(result).toEqual({
        referralCode: storedCode,
        isPrePopulated: true
      });
    });

    it("should return empty form data when no code exists", async () => {
      const phoneNumber = "+1234567890";
      
      mockRedisService.retrieveReferralCode.mockResolvedValue(null);

      const result = await service.prePopulateReferralField(phoneNumber);

      expect(result).toEqual({
        referralCode: undefined,
        isPrePopulated: false
      });
    });

    it("should handle Redis errors gracefully", async () => {
      const phoneNumber = "+1234567890";
      
      mockRedisService.retrieveReferralCode.mockRejectedValue(new Error("Redis error"));

      const result = await service.prePopulateReferralField(phoneNumber);

      expect(result).toEqual({
        referralCode: undefined,
        isPrePopulated: false
      });
    });
  });

  describe("processReferralOnSignup", () => {
    it("should create referral relationship with valid code", async () => {
      const userId = "user123";
      const referralCode = "VALID123";
      
      mockReferralService.createReferralRelationship.mockResolvedValue({
        referrerId: "referrer456",
        referredUserId: userId,
        referralCode,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      } as any);

      await service.processReferralOnSignup(userId, referralCode);

      expect(mockReferralService.createReferralRelationship).toHaveBeenCalledWith(userId, referralCode);
    });

    it("should do nothing when no referral code provided", async () => {
      const userId = "user123";

      await service.processReferralOnSignup(userId);

      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should do nothing when empty referral code provided", async () => {
      const userId = "user123";

      await service.processReferralOnSignup(userId, "");
      await service.processReferralOnSignup(userId, "   ");

      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should trim whitespace from referral code", async () => {
      const userId = "user123";
      const referralCode = "  VALID123  ";
      
      mockReferralService.createReferralRelationship.mockResolvedValue({} as any);

      await service.processReferralOnSignup(userId, referralCode);

      expect(mockReferralService.createReferralRelationship).toHaveBeenCalledWith(userId, "VALID123");
    });

    it("should throw InvalidReferralCodeError for invalid codes", async () => {
      const userId = "user123";
      const referralCode = "INVALID";
      
      const error = new InvalidReferralCodeError("Invalid referral code");
      mockReferralService.createReferralRelationship.mockRejectedValue(error);

      // Debug: Check if mock is set up correctly
      expect(mockReferralService.createReferralRelationship).toBeDefined();

      try {
        await service.processReferralOnSignup(userId, referralCode);
        fail("Expected function to throw");
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(InvalidReferralCodeError);
      }
      
      expect(mockReferralService.createReferralRelationship).toHaveBeenCalledWith(userId, referralCode);
    });

    it("should throw SelfReferralError for self-referral attempts", async () => {
      const userId = "user123";
      const referralCode = "SELF123";
      
      const error = new SelfReferralError("Cannot use your own referral code");
      mockReferralService.createReferralRelationship.mockRejectedValue(error);

      try {
        await service.processReferralOnSignup(userId, referralCode);
        fail("Expected function to throw");
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(SelfReferralError);
      }
      
      expect(mockReferralService.createReferralRelationship).toHaveBeenCalledWith(userId, referralCode);
    });

    it("should throw DuplicateReferralError for users already referred", async () => {
      const userId = "user123";
      const referralCode = "VALID123";
      
      const error = new DuplicateReferralError("Already referred by another user");
      mockReferralService.createReferralRelationship.mockRejectedValue(error);

      try {
        await service.processReferralOnSignup(userId, referralCode);
        fail("Expected function to throw");
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(DuplicateReferralError);
      }
      
      expect(mockReferralService.createReferralRelationship).toHaveBeenCalledWith(userId, referralCode);
    });
  });

  describe("cleanupTemporaryStorage", () => {
    it("should remove referral code from Redis", async () => {
      const phoneNumber = "+1234567890";
      
      mockRedisService.removeReferralCode.mockResolvedValue();

      await service.cleanupTemporaryStorage(phoneNumber);

      expect(mockRedisService.removeReferralCode).toHaveBeenCalledWith(phoneNumber);
    });

    it("should handle Redis cleanup errors gracefully", async () => {
      const phoneNumber = "+1234567890";
      
      mockRedisService.removeReferralCode.mockRejectedValue(new Error("Redis error"));

      // Should not throw
      await expect(service.cleanupTemporaryStorage(phoneNumber)).resolves.toBeUndefined();
    });
  });

  describe("hasExistingReferralRelationship", () => {
    it("should return true when user has existing relationship", async () => {
      const userId = "user123";
      
      mockReferralService.getReferralRelationship.mockResolvedValue({
        referrerId: "referrer456",
        referredUserId: userId,
        createdAt: new Date()
      } as any);

      const result = await service.hasExistingReferralRelationship(userId);

      expect(result).toBe(true);
      expect(mockReferralService.getReferralRelationship).toHaveBeenCalledWith(userId);
    });

    it("should return false when user has no existing relationship", async () => {
      const userId = "user123";
      
      mockReferralService.getReferralRelationship.mockResolvedValue(null);

      const result = await service.hasExistingReferralRelationship(userId);

      expect(result).toBe(false);
      expect(mockReferralService.getReferralRelationship).toHaveBeenCalledWith(userId);
    });
  });

  describe("validateReferralCode", () => {
    it("should return true for valid referral codes", async () => {
      const referralCode = "VALID123";
      
      mockReferralService.validateReferralCode.mockResolvedValue(true);

      const result = await service.validateReferralCode(referralCode);

      expect(result).toBe(true);
      expect(mockReferralService.validateReferralCode).toHaveBeenCalledWith(referralCode);
    });

    it("should return false for invalid referral codes", async () => {
      const referralCode = "INVALID";
      
      mockReferralService.validateReferralCode.mockResolvedValue(false);

      const result = await service.validateReferralCode(referralCode);

      expect(result).toBe(false);
      expect(mockReferralService.validateReferralCode).toHaveBeenCalledWith(referralCode);
    });

    it("should return false for empty or whitespace-only codes", async () => {
      const result1 = await service.validateReferralCode("");
      const result2 = await service.validateReferralCode("   ");

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(mockReferralService.validateReferralCode).not.toHaveBeenCalled();
    });

    it("should trim whitespace before validation", async () => {
      const referralCode = "  VALID123  ";
      
      mockReferralService.validateReferralCode.mockResolvedValue(true);

      const result = await service.validateReferralCode(referralCode);

      expect(result).toBe(true);
      expect(mockReferralService.validateReferralCode).toHaveBeenCalledWith("VALID123");
    });
  });
});