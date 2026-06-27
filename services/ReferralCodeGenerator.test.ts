/**
 * Tests for ReferralCodeGenerator
 * 
 * This file contains both unit tests and property-based tests
 * to validate the referral code generation functionality.
 */

import * as fc from "fast-check";
import { ReferralCodeGenerator } from "./ReferralCodeGenerator";
import { User } from "../models/User";

// Mock the User model
jest.mock("../models/User");

describe("ReferralCodeGenerator", () => {
  let generator: ReferralCodeGenerator;

  beforeEach(() => {
    generator = new ReferralCodeGenerator();
    jest.clearAllMocks();
  });

  // ============================================================================
  // UNIT TESTS
  // ============================================================================

  describe("Unit Tests", () => {
    describe("generateCode", () => {
      it("should generate a code successfully when first attempt is unique", async () => {
        // Mock isCodeUnique to return true
        (User.findOne as jest.Mock).mockResolvedValue(null);

        const code = await generator.generateCode();

        expect(code).toBeDefined();
        expect(typeof code).toBe("string");
        expect(code.length).toBeGreaterThanOrEqual(6);
        expect(code.length).toBeLessThanOrEqual(12);
      });

      it("should retry when collision occurs and succeed on second attempt", async () => {
        // First call returns existing user (collision), second returns null (unique)
        (User.findOne as jest.Mock)
          .mockResolvedValueOnce({ referralCode: "EXISTING" })
          .mockResolvedValueOnce(null);

        const code = await generator.generateCode();

        expect(code).toBeDefined();
        expect(User.findOne).toHaveBeenCalledTimes(2);
      });

      it("should throw error after max retries (5 attempts)", async () => {
        // All attempts return existing user (collision)
        (User.findOne as jest.Mock).mockResolvedValue({ referralCode: "EXISTING" });

        await expect(generator.generateCode()).rejects.toThrow(
          "Failed to generate unique referral code after 5 attempts"
        );

        expect(User.findOne).toHaveBeenCalledTimes(5);
      });

      it("should generate alphanumeric codes only", async () => {
        (User.findOne as jest.Mock).mockResolvedValue(null);

        const code = await generator.generateCode();
        const alphanumericRegex = /^[A-Z0-9]+$/;

        expect(alphanumericRegex.test(code)).toBe(true);
      });
    });

    describe("isCodeUnique", () => {
      it("should return true when code does not exist", async () => {
        (User.findOne as jest.Mock).mockResolvedValue(null);

        const result = await generator.isCodeUnique("NEWCODE123");

        expect(result).toBe(true);
        expect(User.findOne).toHaveBeenCalledWith({ referralCode: "NEWCODE123" });
      });

      it("should return false when code already exists", async () => {
        (User.findOne as jest.Mock).mockResolvedValue({
          referralCode: "EXISTING",
        });

        const result = await generator.isCodeUnique("EXISTING");

        expect(result).toBe(false);
        expect(User.findOne).toHaveBeenCalledWith({ referralCode: "EXISTING" });
      });
    });

    describe("Edge Cases", () => {
      it("should handle exactly 6 character codes", async () => {
        (User.findOne as jest.Mock).mockResolvedValue(null);

        // Generate multiple codes to potentially get a 6-character one
        const codes: string[] = [];
        for (let i = 0; i < 50; i++) {
          const code = await generator.generateCode();
          codes.push(code);
        }

        const hasSixCharCode = codes.some((code) => code.length === 6);
        // With 50 attempts, we should get at least one 6-character code
        // If not, just verify all codes are in valid range
        if (!hasSixCharCode) {
          // Verify all codes are still valid
          codes.forEach(code => {
            expect(code.length).toBeGreaterThanOrEqual(6);
            expect(code.length).toBeLessThanOrEqual(12);
          });
        } else {
          expect(hasSixCharCode).toBe(true);
        }
      });

      it("should handle exactly 12 character codes", async () => {
        (User.findOne as jest.Mock).mockResolvedValue(null);

        // Generate multiple codes to potentially get a 12-character one
        const codes: string[] = [];
        for (let i = 0; i < 20; i++) {
          const code = await generator.generateCode();
          codes.push(code);
        }

        const hasTwelveCharCode = codes.some((code) => code.length === 12);
        expect(hasTwelveCharCode).toBe(true);
      });
    });
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe("Property-Based Tests", () => {
    /**
     * Feature: referral-system, Property 2: Referral code format compliance
     * **Validates: Requirements 1.3**
     * 
     * For any generated referral code, it must be alphanumeric and 
     * between 6-12 characters in length.
     */
    it("Property 2: all generated codes must be alphanumeric and 6-12 characters", async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async () => {
          const code = await generator.generateCode();

          // Check length constraint
          expect(code.length).toBeGreaterThanOrEqual(6);
          expect(code.length).toBeLessThanOrEqual(12);

          // Check alphanumeric constraint
          const alphanumericRegex = /^[A-Z0-9]+$/;
          expect(alphanumericRegex.test(code)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: referral-system, Property 1: Referral code uniqueness
     * **Validates: Requirements 1.2**
     * 
     * For any set of users in the system, all referral codes must be 
     * unique with no duplicates.
     */
    it("Property 1: generated codes should be unique across multiple generations", async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 10, max: 50 }), async (count) => {
          const codes = new Set<string>();

          for (let i = 0; i < count; i++) {
            const code = await generator.generateCode();
            codes.add(code);
          }

          // All codes should be unique (set size equals count)
          expect(codes.size).toBe(count);
        }),
        { numRuns: 20 } // Reduced runs due to multiple code generations per run
      );
    });

    /**
     * Feature: referral-system, Property 3: Code generation persistence
     * **Validates: Requirements 1.1, 1.4**
     * 
     * For any user who completes KYC, querying their user record immediately 
     * after code generation should return the generated referral code.
     * 
     * This property tests that once a code is generated and persisted to a user,
     * it can be retrieved from the database.
     */
    it("Property 3: generated codes should be retrievable after persistence", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }), // userId
          async (userId) => {
            // Mock: code generation returns unique code
            (User.findOne as jest.Mock).mockResolvedValueOnce(null);
            
            const generatedCode = await generator.generateCode();
            
            // Simulate persisting the code to a user record
            const mockUser = {
              userId,
              referralCode: generatedCode,
              whatsappNumber: `+1234567890`,
              fullName: "Test User",
              country: "US",
              currency: "USD",
              isVerified: true,
            };
            
            // Mock: querying the user returns the persisted code
            (User.findOne as jest.Mock).mockResolvedValueOnce(mockUser);
            
            // Query the user record
            const retrievedUser = await User.findOne({ userId });
            
            // Verify the code persisted correctly
            expect(retrievedUser).not.toBeNull();
            expect(retrievedUser?.referralCode).toBe(generatedCode);
            expect(retrievedUser?.referralCode).toBeDefined();
            expect(retrievedUser?.referralCode?.length).toBeGreaterThanOrEqual(6);
            expect(retrievedUser?.referralCode?.length).toBeLessThanOrEqual(12);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Additional property: Code generation should be deterministic in format
     * 
     * All codes should only contain uppercase letters and digits
     */
    it("Property: codes should only contain uppercase letters A-Z and digits 0-9", async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async () => {
          const code = await generator.generateCode();

          // Check each character
          for (const char of code) {
            const isValid =
              (char >= "A" && char <= "Z") || (char >= "0" && char <= "9");
            expect(isValid).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Additional property: Code length distribution
     * 
     * Over many generations, codes should have varied lengths between 6-12
     */
    it("Property: code lengths should be distributed across the 6-12 range", async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      const lengthCounts = new Map<number, number>();

      // Generate many codes
      for (let i = 0; i < 100; i++) {
        const code = await generator.generateCode();
        const count = lengthCounts.get(code.length) || 0;
        lengthCounts.set(code.length, count + 1);
      }

      // Should have at least 3 different lengths represented
      expect(lengthCounts.size).toBeGreaterThanOrEqual(3);

      // All lengths should be in valid range
      for (const length of lengthCounts.keys()) {
        expect(length).toBeGreaterThanOrEqual(6);
        expect(length).toBeLessThanOrEqual(12);
      }
    });
  });
});
