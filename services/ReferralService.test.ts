/**
 * ReferralService Tests
 * 
 * Tests for referral relationship management and validation.
 * Includes both unit tests and property-based tests.
 */

import * as fc from "fast-check";
import { ReferralService, DuplicateReferralError, SelfReferralError, InvalidReferralCodeError } from "./ReferralService";
import { User } from "../models/User";
import { ReferralRelationship } from "../models/ReferralRelationship";

// Mock the models
jest.mock("../models/User");
jest.mock("../models/ReferralRelationship");

let referralService: ReferralService;

beforeEach(() => {
  referralService = new ReferralService();
  jest.clearAllMocks();
});

describe("ReferralService", () => {
  describe("createReferralCode", () => {
    it("should generate a unique referral code for a user", async () => {
      const mockUser = {
        userId: "user123",
        whatsappNumber: "+1234567890",
        fullName: "Test User",
        country: "US",
        currency: "USD",
        pin: "1234",
        referralCode: undefined,
        save: jest.fn().mockResolvedValue(true),
      };

      (User.findOne as jest.Mock).mockResolvedValueOnce(mockUser);
      // Mock for isCodeUnique check
      (User.findOne as jest.Mock).mockResolvedValueOnce(null);

      const code = await referralService.createReferralCode("user123");

      expect(code).toBeDefined();
      expect(code.length).toBeGreaterThanOrEqual(6);
      expect(code.length).toBeLessThanOrEqual(12);
      expect(/^[A-Z0-9]+$/.test(code)).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it("should return existing code if user already has one", async () => {
      const mockUser = {
        userId: "user123",
        referralCode: "EXISTING",
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      const code = await referralService.createReferralCode("user123");
      expect(code).toBe("EXISTING");
    });

    it("should throw error if user not found", async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        referralService.createReferralCode("nonexistent")
      ).rejects.toThrow("User not found");
    });
  });

  describe("validateReferralCode", () => {
    it("should return true for valid referral code", async () => {
      (User.findOne as jest.Mock).mockResolvedValue({
        userId: "user123",
        referralCode: "VALID123",
      });

      const isValid = await referralService.validateReferralCode("VALID123");
      expect(isValid).toBe(true);
    });

    it("should return false for invalid referral code", async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      const isValid = await referralService.validateReferralCode("INVALID");
      expect(isValid).toBe(false);
    });
  });

  describe("createReferralRelationship", () => {
    it("should create a valid referral relationship", async () => {
      const mockReferrer = {
        userId: "referrer123",
        referralCode: "REF123",
      };

      const mockReferredUser = {
        userId: "referred456",
        save: jest.fn().mockResolvedValue(true),
      };

      const mockRelationship = {
        referrerId: "referrer123",
        referredUserId: "referred456",
        referralCode: "REF123",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        save: jest.fn().mockResolvedValue(true),
      };

      // Mock findOne for referrer lookup
      (User.findOne as jest.Mock).mockResolvedValueOnce(mockReferrer);
      // Mock findOne for existing relationship check
      (ReferralRelationship.findOne as jest.Mock).mockResolvedValueOnce(null);
      // Mock ReferralRelationship constructor
      (ReferralRelationship as any).mockImplementation(() => mockRelationship);
      // Mock findOne for referred user update
      (User.findOne as jest.Mock).mockResolvedValueOnce(mockReferredUser);

      const relationship = await referralService.createReferralRelationship(
        "referred456",
        "REF123"
      );

      expect(relationship.referrerId).toBe("referrer123");
      expect(relationship.referredUserId).toBe("referred456");
      expect(relationship.referralCode).toBe("REF123");
      expect(mockRelationship.save).toHaveBeenCalled();
      expect(mockReferredUser.save).toHaveBeenCalled();
    });

    it("should throw InvalidReferralCodeError for non-existent code", async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        referralService.createReferralRelationship("referred456", "INVALID")
      ).rejects.toThrow(InvalidReferralCodeError);
    });

    it("should throw SelfReferralError when user tries to refer themselves", async () => {
      const mockReferrer = {
        userId: "referrer123",
        referralCode: "REF123",
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockReferrer);

      await expect(
        referralService.createReferralRelationship("referrer123", "REF123")
      ).rejects.toThrow(SelfReferralError);
    });

    it("should throw DuplicateReferralError for existing relationship", async () => {
      const mockReferrer = {
        userId: "referrer123",
        referralCode: "REF123",
      };

      const existingRelationship = {
        referrerId: "referrer123",
        referredUserId: "referred456",
        referralCode: "REF123",
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockReferrer);
      (ReferralRelationship.findOne as jest.Mock).mockResolvedValue(existingRelationship);

      await expect(
        referralService.createReferralRelationship("referred456", "REF123")
      ).rejects.toThrow(DuplicateReferralError);
    });
  });

  describe("getReferralRelationship", () => {
    it("should return relationship if it exists", async () => {
      const mockRelationship = {
        referrerId: "referrer123",
        referredUserId: "referred456",
        referralCode: "REF123",
      };

      (ReferralRelationship.findOne as jest.Mock).mockResolvedValue(mockRelationship);

      const relationship = await referralService.getReferralRelationship("referred456");
      expect(relationship).not.toBeNull();
      expect(relationship?.referrerId).toBe("referrer123");
    });

    it("should return null if no relationship exists", async () => {
      (ReferralRelationship.findOne as jest.Mock).mockResolvedValue(null);

      const relationship = await referralService.getReferralRelationship("nonexistent");
      expect(relationship).toBeNull();
    });
  });

  describe("isWithinReferralPeriod", () => {
    it("should return true for relationship within 30 days", () => {
      const now = new Date();
      const relationship = {
        referrerId: "ref123",
        referredUserId: "user456",
        referralCode: "CODE123",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      } as any;

      const isWithin = referralService.isWithinReferralPeriod(relationship);
      expect(isWithin).toBe(true);
    });

    it("should return false for relationship older than 30 days", () => {
      const thirtyOneDaysAgo = new Date();
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

      const relationship = {
        referrerId: "ref123",
        referredUserId: "user456",
        referralCode: "CODE123",
        createdAt: thirtyOneDaysAgo,
        expiresAt: new Date(thirtyOneDaysAgo.getTime() + 30 * 24 * 60 * 60 * 1000),
      } as any;

      const isWithin = referralService.isWithinReferralPeriod(relationship);
      expect(isWithin).toBe(false);
    });

    it("should return true for relationship exactly at 30 days", () => {
      const now = new Date();
      const exactlyThirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const expiresAt = new Date(now.getTime()); // Expires exactly now

      const relationship = {
        referrerId: "ref123",
        referredUserId: "user456",
        referralCode: "CODE123",
        createdAt: exactlyThirtyDaysAgo,
        expiresAt: expiresAt,
      } as any;

      const isWithin = referralService.isWithinReferralPeriod(relationship);
      expect(isWithin).toBe(true);
    });
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe("Property-Based Tests", () => {
    /**
     * Feature: referral-system, Property 4: Valid code acceptance
     * **Validates: Requirements 2.1, 2.2**
     * 
     * For any valid referral code provided during registration, the system 
     * should create a referral relationship linking the referred user to the referrer.
     */
    it("Property 4: valid referral codes should create referral relationships", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 6, maxLength: 12 }).filter(s => /^[A-Z0-9]+$/.test(s)), // valid referral code format
          fc.string({ minLength: 1, maxLength: 20 }), // referrerId
          fc.string({ minLength: 1, maxLength: 20 }), // referredUserId
          async (referralCode, referrerId, referredUserId) => {
            // Skip if referrer and referred are the same (self-referral)
            fc.pre(referrerId !== referredUserId);

            // Mock: referral code exists and belongs to referrer
            const mockReferrer = {
              userId: referrerId,
              referralCode: referralCode,
              whatsappNumber: `+${referrerId}`,
              fullName: `Referrer ${referrerId}`,
              country: "US",
              currency: "USD",
            };

            const mockReferredUser = {
              userId: referredUserId,
              whatsappNumber: `+${referredUserId}`,
              fullName: `Referred ${referredUserId}`,
              country: "US",
              currency: "USD",
              save: jest.fn().mockResolvedValue(true),
            };

            // Mock the relationship that will be created
            const mockRelationship = {
              referrerId: referrerId,
              referredUserId: referredUserId,
              referralCode: referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              save: jest.fn().mockResolvedValue(true),
            };

            // Setup mocks
            // 1. Find referrer by code
            (User.findOne as jest.Mock).mockResolvedValueOnce(mockReferrer);
            // 2. Check for existing relationship (should be none)
            (ReferralRelationship.findOne as jest.Mock).mockResolvedValueOnce(null);
            // 3. Mock ReferralRelationship constructor
            (ReferralRelationship as any).mockImplementation(() => mockRelationship);
            // 4. Find referred user to update
            (User.findOne as jest.Mock).mockResolvedValueOnce(mockReferredUser);

            // Execute: create referral relationship
            const relationship = await referralService.createReferralRelationship(
              referredUserId,
              referralCode
            );

            // Verify: relationship was created with correct data
            expect(relationship).toBeDefined();
            expect(relationship.referrerId).toBe(referrerId);
            expect(relationship.referredUserId).toBe(referredUserId);
            expect(relationship.referralCode).toBe(referralCode);
            expect(relationship.createdAt).toBeInstanceOf(Date);
            expect(relationship.expiresAt).toBeInstanceOf(Date);

            // Verify: relationship was saved
            expect(mockRelationship.save).toHaveBeenCalled();

            // Verify: referred user was updated
            expect(mockReferredUser.save).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: referral-system, Property 5: Invalid code rejection
     * **Validates: Requirements 2.3**
     * 
     * For any non-existent referral code provided during registration, the system 
     * should reject it and return an error message.
     */
    it("Property 5: invalid referral codes should be rejected with error", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // invalid/non-existent referral code
          fc.string({ minLength: 1, maxLength: 20 }), // referredUserId
          async (invalidCode, referredUserId) => {
            // Mock: referral code does NOT exist in the system
            (User.findOne as jest.Mock).mockResolvedValueOnce(null);

            // Execute and verify: attempt to create relationship should throw InvalidReferralCodeError
            try {
              await referralService.createReferralRelationship(referredUserId, invalidCode);
              // If we reach here, the test should fail
              expect(true).toBe(false); // Force failure if no error thrown
            } catch (error) {
              // Verify: error is InvalidReferralCodeError
              expect(error).toBeInstanceOf(InvalidReferralCodeError);
              // Verify: error message is descriptive
              expect((error as Error).message).toBe("Invalid referral code. Please check and try again.");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: referral-system, Property 6: Referral relationship immutability
     * **Validates: Requirements 2.4, 9.2**
     * 
     * For any user with an existing referral relationship, any attempt to modify 
     * or create a new referral relationship should be rejected.
     */
    it("Property 6: referral relationships should be immutable", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 6, maxLength: 12 }).filter(s => /^[A-Z0-9]+$/.test(s)), // first referral code
          fc.string({ minLength: 6, maxLength: 12 }).filter(s => /^[A-Z0-9]+$/.test(s)), // second referral code (different)
          fc.string({ minLength: 1, maxLength: 20 }), // first referrerId
          fc.string({ minLength: 1, maxLength: 20 }), // second referrerId
          fc.string({ minLength: 1, maxLength: 20 }), // referredUserId
          async (firstCode, secondCode, firstReferrerId, secondReferrerId, referredUserId) => {
            // Preconditions: ensure codes are different and referrers are different
            fc.pre(firstCode !== secondCode);
            fc.pre(firstReferrerId !== secondReferrerId);
            fc.pre(firstReferrerId !== referredUserId);
            fc.pre(secondReferrerId !== referredUserId);

            // Mock: first referrer exists with first code
            const mockFirstReferrer = {
              userId: firstReferrerId,
              referralCode: firstCode,
              whatsappNumber: `+${firstReferrerId}`,
              fullName: `Referrer ${firstReferrerId}`,
              country: "US",
              currency: "USD",
            };

            // Mock: second referrer exists with second code
            const mockSecondReferrer = {
              userId: secondReferrerId,
              referralCode: secondCode,
              whatsappNumber: `+${secondReferrerId}`,
              fullName: `Referrer ${secondReferrerId}`,
              country: "US",
              currency: "USD",
            };

            // Mock: existing relationship with first referrer
            const existingRelationship = {
              referrerId: firstReferrerId,
              referredUserId: referredUserId,
              referralCode: firstCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            };

            // Setup mocks for second attempt
            // 1. Find second referrer by code (should succeed)
            (User.findOne as jest.Mock).mockResolvedValueOnce(mockSecondReferrer);
            // 2. Check for existing relationship (should find the first one)
            (ReferralRelationship.findOne as jest.Mock).mockResolvedValueOnce(existingRelationship);

            // Execute and verify: attempt to create second relationship should throw DuplicateReferralError
            try {
              await referralService.createReferralRelationship(referredUserId, secondCode);
              // If we reach here, the test should fail
              expect(true).toBe(false); // Force failure if no error thrown
            } catch (error) {
              // Verify: error is DuplicateReferralError
              expect(error).toBeInstanceOf(DuplicateReferralError);
              // Verify: error message is descriptive
              expect((error as Error).message).toBe("You have already been referred by another user.");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: referral-system, Property 7: Self-referral prevention
     * **Validates: Requirements 2.5**
     * 
     * For any user attempting to use their own referral code, the system 
     * should reject the self-referral.
     */
    it("Property 7: self-referrals should be rejected", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 6, maxLength: 12 }).filter(s => /^[A-Z0-9]+$/.test(s)), // referral code
          fc.string({ minLength: 1, maxLength: 20 }), // userId (both referrer and referred)
          async (referralCode, userId) => {
            // Mock: user exists with their own referral code
            const mockUser = {
              userId: userId,
              referralCode: referralCode,
              whatsappNumber: `+${userId}`,
              fullName: `User ${userId}`,
              country: "US",
              currency: "USD",
            };

            // Setup mocks
            // 1. Find user by their referral code (should succeed)
            (User.findOne as jest.Mock).mockResolvedValueOnce(mockUser);

            // Execute and verify: attempt to use own referral code should throw SelfReferralError
            try {
              await referralService.createReferralRelationship(userId, referralCode);
              // If we reach here, the test should fail
              expect(true).toBe(false); // Force failure if no error thrown
            } catch (error) {
              // Verify: error is SelfReferralError
              expect(error).toBeInstanceOf(SelfReferralError);
              // Verify: error message is descriptive
              expect((error as Error).message).toBe("You cannot use your own referral code.");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: referral-system, Property 8: Relationship timestamp persistence
     * **Validates: Requirements 8.1**
     * 
     * For any created referral relationship, the createdAt timestamp should be 
     * stored and retrievable.
     */
    it("Property 8: relationship timestamps should be persisted and retrievable", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 6, maxLength: 12 }).filter(s => /^[A-Z0-9]+$/.test(s)), // referral code
          fc.string({ minLength: 1, maxLength: 20 }), // referrerId
          fc.string({ minLength: 1, maxLength: 20 }), // referredUserId
          fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }), // createdAt timestamp
          async (referralCode, referrerId, referredUserId, createdAt) => {
            // Precondition: referrer and referred must be different users
            fc.pre(referrerId !== referredUserId);

            // Mock: referrer exists with referral code
            const mockReferrer = {
              userId: referrerId,
              referralCode: referralCode,
              whatsappNumber: `+${referrerId}`,
              fullName: `Referrer ${referrerId}`,
              country: "US",
              currency: "USD",
            };

            const mockReferredUser = {
              userId: referredUserId,
              whatsappNumber: `+${referredUserId}`,
              fullName: `Referred ${referredUserId}`,
              country: "US",
              currency: "USD",
              save: jest.fn().mockResolvedValue(true),
            };

            // Mock the relationship that will be created with the specific timestamp
            const mockRelationship = {
              referrerId: referrerId,
              referredUserId: referredUserId,
              referralCode: referralCode,
              createdAt: createdAt,
              expiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
              save: jest.fn().mockResolvedValue(true),
            };

            // Setup mocks for relationship creation
            // 1. Find referrer by code
            (User.findOne as jest.Mock).mockResolvedValueOnce(mockReferrer);
            // 2. Check for existing relationship (should be none)
            (ReferralRelationship.findOne as jest.Mock).mockResolvedValueOnce(null);
            // 3. Mock ReferralRelationship constructor
            (ReferralRelationship as any).mockImplementation(() => mockRelationship);
            // 4. Find referred user to update
            (User.findOne as jest.Mock).mockResolvedValueOnce(mockReferredUser);

            // Execute: create referral relationship
            const createdRelationship = await referralService.createReferralRelationship(
              referredUserId,
              referralCode
            );

            // Verify: relationship was created with timestamp
            expect(createdRelationship).toBeDefined();
            expect(createdRelationship.createdAt).toBeInstanceOf(Date);
            expect(mockRelationship.save).toHaveBeenCalled();

            // Now test retrieval: mock the retrieval of the relationship
            (ReferralRelationship.findOne as jest.Mock).mockResolvedValueOnce(mockRelationship);

            // Execute: retrieve the relationship
            const retrievedRelationship = await referralService.getReferralRelationship(referredUserId);

            // Verify: timestamp is persisted and retrievable
            expect(retrievedRelationship).not.toBeNull();
            expect(retrievedRelationship?.createdAt).toBeInstanceOf(Date);
            expect(retrievedRelationship?.createdAt.getTime()).toBe(createdAt.getTime());
            
            // Verify: expiresAt is also persisted (30 days from createdAt)
            expect(retrievedRelationship?.expiresAt).toBeInstanceOf(Date);
            const expectedExpiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
            expect(retrievedRelationship?.expiresAt.getTime()).toBe(expectedExpiresAt.getTime());
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
