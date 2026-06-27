/**
 * Property-based tests for ReferralCodeValidatorService
 * 
 * Tests universal properties that should hold across all valid inputs
 * using fast-check for comprehensive input coverage.
 * 
 * **Validates: Requirements 2.1, 2.4**
 */

import * as fc from 'fast-check';
import { ReferralCodeValidatorService } from './ReferralCodeValidatorService';
import { User } from '../models/User';

// Mock the User model
jest.mock('../models/User');
const MockedUser = User as jest.Mocked<typeof User>;

describe('ReferralCodeValidatorService - Property Tests', () => {
  let service: ReferralCodeValidatorService;

  beforeEach(() => {
    service = new ReferralCodeValidatorService();
    jest.clearAllMocks();
  });

  /**
   * Property 1: Referral Code Validation
   * **Validates: Requirements 2.1, 2.4**
   * 
   * For any referral code input, the validation function should correctly 
   * identify whether the code exists in the system and return appropriate 
   * validation results.
   */
  describe('Property 1: Referral Code Validation', () => {
    
    // Generator for valid referral codes (6-12 alphanumeric characters)
    const validReferralCodeArb = fc.string({
      minLength: 6,
      maxLength: 12,
    }).filter(s => /^[A-Z0-9]+$/.test(s.toUpperCase()));

    // Generator for invalid referral codes (various invalid formats)
    const invalidReferralCodeArb = fc.oneof(
      // Too short
      fc.string({ minLength: 0, maxLength: 5 }),
      // Too long  
      fc.string({ minLength: 13, maxLength: 20 }),
      // Contains special characters
      fc.string({ minLength: 6, maxLength: 12 }).filter(s => /[^A-Z0-9]/i.test(s)),
      // Empty or whitespace only
      fc.constant(''),
      fc.constant('   '),
      // Non-string values
      fc.constant(null),
      fc.constant(undefined)
    );

    it('should always return a ValidationResult with isValid boolean', async () => {
      await fc.assert(fc.asyncProperty(
        fc.oneof(validReferralCodeArb, invalidReferralCodeArb, fc.string()),
        async (code) => {
          // Mock database response (can be null or user object)
          MockedUser.findOne.mockResolvedValue(
            Math.random() > 0.5 ? null : { userId: 'test-user', referralCode: code?.toString().toUpperCase() }
          );

          const result = await service.validateCode(code as string);
          
          // Property: Result must always have isValid boolean
          expect(typeof result.isValid).toBe('boolean');
          
          // Property: If invalid, must have error message
          if (!result.isValid) {
            expect(typeof result.errorMessage).toBe('string');
            expect(result.errorMessage!.length).toBeGreaterThan(0);
          }
          
          // Property: If valid, must have referrerId
          if (result.isValid) {
            expect(typeof result.referrerId).toBe('string');
            expect(result.referrerId!.length).toBeGreaterThan(0);
          }
        }
      ), { numRuns: 100 });
    });

    it('should reject codes that do not meet format requirements', async () => {
      await fc.assert(fc.asyncProperty(
        invalidReferralCodeArb,
        async (invalidCode) => {
          const result = await service.validateCode(invalidCode as string);
          
          // Property: Invalid format codes should always be rejected
          expect(result.isValid).toBe(false);
          expect(result.errorMessage).toBeDefined();
          
          // Property: Should not make database calls for obviously invalid codes
          if (!invalidCode || typeof invalidCode !== 'string' || 
              invalidCode.trim().length < 6 || invalidCode.trim().length > 12 ||
              !/^[A-Z0-9]+$/i.test(invalidCode.trim())) {
            // Database should not be called for format validation failures
            expect(MockedUser.findOne).not.toHaveBeenCalled();
          }
        }
      ), { numRuns: 100 });
    });

    it('should handle case insensitivity consistently', async () => {
      await fc.assert(fc.asyncProperty(
        validReferralCodeArb,
        async (code) => {
          const upperCode = code.toUpperCase();
          const lowerCode = code.toLowerCase();
          const mixedCode = code.split('').map((c, i) => 
            i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()
          ).join('');

          // Mock same user for all case variations
          const mockUser = { userId: 'test-user', referralCode: upperCode };
          MockedUser.findOne.mockResolvedValue(mockUser as any);

          const upperResult = await service.validateCode(upperCode);
          MockedUser.findOne.mockResolvedValue(mockUser as any);
          const lowerResult = await service.validateCode(lowerCode);
          MockedUser.findOne.mockResolvedValue(mockUser as any);
          const mixedResult = await service.validateCode(mixedCode);

          // Property: Case variations should produce identical results
          expect(upperResult.isValid).toBe(lowerResult.isValid);
          expect(lowerResult.isValid).toBe(mixedResult.isValid);
          
          if (upperResult.isValid) {
            expect(upperResult.referrerId).toBe(lowerResult.referrerId);
            expect(lowerResult.referrerId).toBe(mixedResult.referrerId);
          }

          // Property: Database should always be queried with uppercase code
          expect(MockedUser.findOne).toHaveBeenCalledWith({ referralCode: upperCode });
        }
      ), { numRuns: 50 });
    });

    it('should handle whitespace trimming consistently', async () => {
      await fc.assert(fc.asyncProperty(
        validReferralCodeArb,
        fc.array(fc.constant(' '), { minLength: 0, maxLength: 5 }),
        fc.array(fc.constant(' '), { minLength: 0, maxLength: 5 }),
        async (code, prefixSpaces, suffixSpaces) => {
          const trimmedCode = code.toUpperCase();
          const paddedCode = prefixSpaces.join('') + code + suffixSpaces.join('');

          // Mock user for the trimmed code
          const mockUser = { userId: 'test-user', referralCode: trimmedCode };
          MockedUser.findOne.mockResolvedValue(mockUser as any);

          const result = await service.validateCode(paddedCode);

          // Property: Whitespace should be trimmed before validation
          expect(MockedUser.findOne).toHaveBeenCalledWith({ referralCode: trimmedCode });
          
          if (result.isValid) {
            expect(result.referrerId).toBe('test-user');
          }
        }
      ), { numRuns: 50 });
    });

    it('should return consistent results for the same input', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string(),
        async (code) => {
          // Mock consistent database response
          const mockResponse = Math.random() > 0.5 ? null : { 
            userId: 'consistent-user', 
            referralCode: code?.toString().toUpperCase() 
          };
          
          MockedUser.findOne.mockResolvedValue(mockResponse as any);
          const result1 = await service.validateCode(code);
          
          MockedUser.findOne.mockResolvedValue(mockResponse as any);
          const result2 = await service.validateCode(code);

          // Property: Same input should produce same output
          expect(result1.isValid).toBe(result2.isValid);
          expect(result1.errorMessage).toBe(result2.errorMessage);
          expect(result1.referrerId).toBe(result2.referrerId);
        }
      ), { numRuns: 50 });
    });

    it('should handle database errors gracefully for valid format codes', async () => {
      await fc.assert(fc.asyncProperty(
        validReferralCodeArb,
        async (code) => {
          // Mock database error
          MockedUser.findOne.mockRejectedValue(new Error('Database connection failed'));

          const result = await service.validateCode(code);

          // Property: Database errors should always result in invalid with error message
          expect(result.isValid).toBe(false);
          expect(result.errorMessage).toBe('Unable to validate referral code. Please try again later.');
          expect(result.referrerId).toBeUndefined();
        }
      ), { numRuns: 50 });
    });
  });

  /**
   * Additional property tests for getReferrerInfo method
   * **Validates: Requirements 2.3**
   */
  describe('Property: getReferrerInfo consistency', () => {
    
    it('should return null for non-existent codes and valid ReferrerInfo for existing codes', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string(),
        fc.boolean(), // Whether code exists in database
        async (code, codeExists) => {
          const mockUser = codeExists ? {
            userId: 'test-user',
            firstName: 'Test',
            fullName: 'Test User',
            referralCode: code?.toString().toUpperCase()
          } : null;

          MockedUser.findOne.mockResolvedValue(mockUser as any);

          const result = await service.getReferrerInfo(code);

          if (codeExists && mockUser?.referralCode) {
            // Property: Existing codes should return valid ReferrerInfo
            expect(result).not.toBeNull();
            expect(result!.id).toBe('test-user');
            expect(result!.referralCode).toBe(mockUser.referralCode);
            expect(typeof result!.name).toBe('string');
            expect(result!.name.length).toBeGreaterThan(0);
          } else {
            // Property: Non-existent codes should return null
            expect(result).toBeNull();
          }
        }
      ), { numRuns: 100 });
    });
  });

  /**
   * Property tests for self-referral prevention
   * **Validates: Requirements 2.1.7**
   */
  describe('Property: Self-referral prevention', () => {
    
    it('should always prevent users from using their own referral codes', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 6, maxLength: 12 }).filter(s => /^[A-Z0-9]+$/i.test(s)),
        fc.string(), // userId
        async (code, userId) => {
          // Mock user where the referral code belongs to the same user
          const mockUser = {
            userId: userId,
            referralCode: code.toUpperCase()
          };
          MockedUser.findOne.mockResolvedValue(mockUser as any);

          const result = await service.validateCodeForUser(code, userId);

          // Property: Self-referral should always be rejected
          expect(result.isValid).toBe(false);
          expect(result.errorMessage).toBe('You cannot use your own referral code.');
        }
      ), { numRuns: 50 });
    });

    it('should allow valid referrals from different users', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 6, maxLength: 12 }).filter(s => /^[A-Z0-9]+$/i.test(s)),
        fc.string(),
        fc.string(),
        async (code, referrerId, userId) => {
          // Ensure different user IDs
          fc.pre(referrerId !== userId);

          // Mock user where the referral code belongs to a different user
          const mockUser = {
            userId: referrerId,
            referralCode: code.toUpperCase()
          };
          MockedUser.findOne.mockResolvedValue(mockUser as any);

          const result = await service.validateCodeForUser(code, userId);

          // Property: Valid referrals from different users should be accepted
          expect(result.isValid).toBe(true);
          expect(result.referrerId).toBe(referrerId);
        }
      ), { numRuns: 50 });
    });
  });
});