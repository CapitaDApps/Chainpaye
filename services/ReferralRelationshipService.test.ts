/**
 * Unit tests for ReferralRelationshipService
 * 
 * Tests the referral relationship creation service including validation,
 * immutability checks, self-referral prevention, and Redis cleanup.
 * 
 * Validates: Requirements 2.1.4, 2.1.5, 2.1.6, 2.1.7, 10.4
 */

import { ReferralRelationshipService, ReferralRelationshipResult } from "./ReferralRelationshipService";
import { ReferralService } from "./ReferralService";
import { ReferralCodeValidatorService } from "./ReferralCodeValidatorService";
import { ReferralRedisService } from "./ReferralRedisService";
import { User } from "../models/User";
import { IReferralRelationship } from "../models/ReferralRelationship";

// Import error classes before mocking
const { InvalidReferralCodeError, SelfReferralError, DuplicateReferralError } = jest.requireActual("./ReferralService");

// Mock dependencies
jest.mock("./ReferralService");
jest.mock("./ReferralCodeValidatorService");
jest.mock("./ReferralRedisService");
jest.mock("../models/User");

describe("ReferralRelationshipService", () => {
  let service: ReferralRelationshipService;
  let mockReferralService: jest.Mocked<ReferralService>;
  let mockValidatorService: jest.Mocked<ReferralCodeValidatorService>;
  let mockRedisService: jest.Mocked<ReferralRedisService>;

  const mockUser = {
    userId: "user123",
    whatsappNumber: "+1234567890",
    fullName: "Test User"
  };

  const mockReferrer = {
    userId: "referrer456",
    referralCode: "ABC123",
    fullName: "Referrer User"
  };

  const mockRelationship: IReferralRelationship = {
    referrerId: "referrer456",
    referredUserId: "user123",
    referralCode: "ABC123",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  } as IReferralRelationship;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockReferralService = new ReferralService() as jest.Mocked<ReferralService>;
    mockValidatorService = new ReferralCodeValidatorService() as jest.Mocked<ReferralCodeValidatorService>;
    mockRedisService = new ReferralRedisService() as jest.Mocked<ReferralRedisService>;

    // Create service with mocked dependencies
    service = new ReferralRelationshipService(
      mockReferralService,
      mockValidatorService,
      mockRedisService
    );

    // Setup default mock implementations
    (User.findOne as jest.Mock).mockResolvedValue(mockUser);
    mockValidatorService.validateForSignup.mockResolvedValue({
      validation: { isValid: true, referrerId: "referrer456" },
      referrer: { id: "referrer456", name: "Referrer User", referralCode: "ABC123" }
    });
    mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);
    mockRedisService.removeReferralCode.mockResolvedValue();
  });

  describe("createReferralRelationship", () => {
    it("should successfully create referral relationship with valid inputs", async () => {
      const result = await service.createReferralRelationship("user123", "ABC123", {
        phoneNumber: "+1234567890"
      });

      expect(result.success).toBe(true);
      expect(result.relationship).toEqual(mockRelationship);
      expect(result.error).toBeUndefined();
      expect(mockValidatorService.validateForSignup).toHaveBeenCalledWith("ABC123", "user123");
      expect(mockReferralService.createReferralRelationship).toHaveBeenCalledWith("user123", "ABC123");
      expect(mockRedisService.removeReferralCode).toHaveBeenCalledWith("+1234567890");
    });

    it("should fail when user ID is missing", async () => {
      const result = await service.createReferralRelationship("", "ABC123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("User ID and referral code are required.");
      expect(result.errorType).toBe("SYSTEM_ERROR");
      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should fail when referral code is missing", async () => {
      const result = await service.createReferralRelationship("user123", "");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Referral code cannot be empty.");
      expect(result.errorType).toBe("INVALID_CODE");
      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should fail when user does not exist", async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.createReferralRelationship("nonexistent", "ABC123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("User not found.");
      expect(result.errorType).toBe("USER_NOT_FOUND");
      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should fail when validation fails with invalid code", async () => {
      mockValidatorService.validateForSignup.mockResolvedValue({
        validation: { isValid: false, errorMessage: "Invalid referral code. Please check and try again." },
        referrer: null
      });

      const result = await service.createReferralRelationship("user123", "INVALID");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid referral code. Please check and try again.");
      expect(result.errorType).toBe("INVALID_CODE");
      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should fail when user tries to use own referral code", async () => {
      mockValidatorService.validateForSignup.mockResolvedValue({
        validation: { isValid: false, errorMessage: "You cannot use your own referral code." },
        referrer: null
      });

      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("You cannot use your own referral code.");
      expect(result.errorType).toBe("SELF_REFERRAL");
      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should fail when user already has referral relationship", async () => {
      mockValidatorService.validateForSignup.mockResolvedValue({
        validation: { isValid: false, errorMessage: "You already have a referral relationship and cannot change it." },
        referrer: null
      });

      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("You already have a referral relationship and cannot change it.");
      expect(result.errorType).toBe("DUPLICATE_RELATIONSHIP");
      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should handle InvalidReferralCodeError from referral service", async () => {
      mockReferralService.createReferralRelationship.mockRejectedValue(
        new InvalidReferralCodeError("Invalid referral code")
      );

      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid referral code");
      expect(result.errorType).toBe("INVALID_CODE");
    });

    it("should handle SelfReferralError from referral service", async () => {
      mockReferralService.createReferralRelationship.mockRejectedValue(
        new SelfReferralError("Cannot refer yourself")
      );

      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot refer yourself");
      expect(result.errorType).toBe("SELF_REFERRAL");
    });

    it("should handle DuplicateReferralError from referral service", async () => {
      mockReferralService.createReferralRelationship.mockRejectedValue(
        new DuplicateReferralError("Already referred")
      );

      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Already referred");
      expect(result.errorType).toBe("DUPLICATE_RELATIONSHIP");
    });

    it("should handle unexpected errors gracefully", async () => {
      mockReferralService.createReferralRelationship.mockRejectedValue(
        new Error("Database connection failed")
      );

      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unable to create referral relationship. Please try again later.");
      expect(result.errorType).toBe("SYSTEM_ERROR");
    });

    it("should skip Redis cleanup when skipRedisCleanup option is true", async () => {
      const result = await service.createReferralRelationship("user123", "ABC123", {
        phoneNumber: "+1234567890",
        skipRedisCleanup: true
      });

      expect(result.success).toBe(true);
      expect(mockRedisService.removeReferralCode).not.toHaveBeenCalled();
    });

    it("should skip Redis cleanup when phone number is not provided", async () => {
      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.success).toBe(true);
      expect(mockRedisService.removeReferralCode).not.toHaveBeenCalled();
    });

    it("should continue successfully even if Redis cleanup fails", async () => {
      mockRedisService.removeReferralCode.mockRejectedValue(new Error("Redis error"));

      const result = await service.createReferralRelationship("user123", "ABC123", {
        phoneNumber: "+1234567890"
      });

      expect(result.success).toBe(true);
      expect(result.relationship).toEqual(mockRelationship);
    });

    it("should trim whitespace from referral code", async () => {
      const result = await service.createReferralRelationship("user123", "  ABC123  ", {
        phoneNumber: "+1234567890"
      });

      expect(result.success).toBe(true);
      expect(mockValidatorService.validateForSignup).toHaveBeenCalledWith("ABC123", "user123");
      expect(mockReferralService.createReferralRelationship).toHaveBeenCalledWith("user123", "ABC123");
    });
  });

  describe("validateReferralForSignup", () => {
    it("should successfully validate referral code for signup", async () => {
      const result = await service.validateReferralForSignup("user123", "ABC123");

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockValidatorService.validateForSignup).toHaveBeenCalledWith("ABC123", "user123");
      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should fail validation with invalid code", async () => {
      mockValidatorService.validateForSignup.mockResolvedValue({
        validation: { isValid: false, errorMessage: "Invalid referral code" },
        referrer: null
      });

      const result = await service.validateReferralForSignup("user123", "INVALID");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid referral code");
      expect(result.errorType).toBe("INVALID_CODE");
    });

    it("should fail when user ID is missing", async () => {
      const result = await service.validateReferralForSignup("", "ABC123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("User ID and referral code are required.");
      expect(result.errorType).toBe("SYSTEM_ERROR");
    });

    it("should fail when referral code is empty", async () => {
      const result = await service.validateReferralForSignup("user123", "   ");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Referral code cannot be empty.");
      expect(result.errorType).toBe("INVALID_CODE");
    });

    it("should fail when user does not exist", async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.validateReferralForSignup("nonexistent", "ABC123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("User not found.");
      expect(result.errorType).toBe("USER_NOT_FOUND");
    });
  });

  describe("hasExistingReferralRelationship", () => {
    it("should return true when user has existing relationship", async () => {
      mockReferralService.getReferralRelationship.mockResolvedValue(mockRelationship);

      const result = await service.hasExistingReferralRelationship("user123");

      expect(result).toBe(true);
      expect(mockReferralService.getReferralRelationship).toHaveBeenCalledWith("user123");
    });

    it("should return false when user has no relationship", async () => {
      mockReferralService.getReferralRelationship.mockResolvedValue(null);

      const result = await service.hasExistingReferralRelationship("user123");

      expect(result).toBe(false);
    });

    it("should return false when error occurs", async () => {
      mockReferralService.getReferralRelationship.mockRejectedValue(new Error("Database error"));

      const result = await service.hasExistingReferralRelationship("user123");

      expect(result).toBe(false);
    });
  });

  describe("getReferralRelationship", () => {
    it("should return relationship when it exists", async () => {
      mockReferralService.getReferralRelationship.mockResolvedValue(mockRelationship);

      const result = await service.getReferralRelationship("user123");

      expect(result).toEqual(mockRelationship);
    });

    it("should return null when no relationship exists", async () => {
      mockReferralService.getReferralRelationship.mockResolvedValue(null);

      const result = await service.getReferralRelationship("user123");

      expect(result).toBe(null);
    });

    it("should return null when error occurs", async () => {
      mockReferralService.getReferralRelationship.mockRejectedValue(new Error("Database error"));

      const result = await service.getReferralRelationship("user123");

      expect(result).toBe(null);
    });
  });

  describe("batchCreateReferralRelationships", () => {
    it("should create multiple referral relationships", async () => {
      const relationships = [
        { userId: "user1", referralCode: "ABC123", phoneNumber: "+1111111111" },
        { userId: "user2", referralCode: "DEF456", phoneNumber: "+2222222222" }
      ];

      const results = await service.batchCreateReferralRelationships(relationships);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(mockReferralService.createReferralRelationship).toHaveBeenCalledTimes(2);
    });

    it("should handle mixed success and failure results", async () => {
      mockValidatorService.validateForSignup
        .mockResolvedValueOnce({
          validation: { isValid: true, referrerId: "referrer456" },
          referrer: { id: "referrer456", name: "Referrer", referralCode: "ABC123" }
        })
        .mockResolvedValueOnce({
          validation: { isValid: false, errorMessage: "Invalid code" },
          referrer: null
        });

      const relationships = [
        { userId: "user1", referralCode: "ABC123" },
        { userId: "user2", referralCode: "INVALID" }
      ];

      const results = await service.batchCreateReferralRelationships(relationships);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe("error type mapping", () => {
    it("should map self-referral error correctly", async () => {
      mockValidatorService.validateForSignup.mockResolvedValue({
        validation: { isValid: false, errorMessage: "You cannot use your own referral code." },
        referrer: null
      });

      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.errorType).toBe("SELF_REFERRAL");
    });

    it("should map duplicate relationship error correctly", async () => {
      mockValidatorService.validateForSignup.mockResolvedValue({
        validation: { isValid: false, errorMessage: "You already have a referral relationship and cannot change it." },
        referrer: null
      });

      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.errorType).toBe("DUPLICATE_RELATIONSHIP");
    });

    it("should map invalid code error correctly", async () => {
      mockValidatorService.validateForSignup.mockResolvedValue({
        validation: { isValid: false, errorMessage: "Invalid referral code. Please check and try again." },
        referrer: null
      });

      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.errorType).toBe("INVALID_CODE");
    });

    it("should default to system error for unknown messages", async () => {
      mockValidatorService.validateForSignup.mockResolvedValue({
        validation: { isValid: false, errorMessage: "Unknown error occurred" },
        referrer: null
      });

      const result = await service.createReferralRelationship("user123", "ABC123");

      expect(result.errorType).toBe("SYSTEM_ERROR");
    });
  });
});