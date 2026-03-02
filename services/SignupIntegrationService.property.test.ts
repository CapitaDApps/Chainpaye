/**
 * Property-based tests for SignupIntegrationService
 * Tests signup code lookup and pre-population functionality across various inputs using fast-check
 * 
 * **Property 4: Signup Code Lookup and Pre-population**
 * **Validates: Requirements 2.1.1, 2.1.2**
 */

import * as fc from 'fast-check';
import { SignupIntegrationServiceImpl } from './SignupIntegrationService';
import { ReferralRedisService } from './ReferralRedisService';
import { ReferralService } from './ReferralService';
import { SignupFormData } from '../types/referral-capture.types';

// Mock dependencies
jest.mock('./ReferralRedisService');
jest.mock('./ReferralService');

describe('SignupIntegrationService - Property Tests', () => {
  let service: SignupIntegrationServiceImpl;
  let mockRedisService: jest.Mocked<ReferralRedisService>;
  let mockReferralService: jest.Mocked<ReferralService>;

  // Generator for valid phone numbers in international format
  const validPhoneNumberArb = fc.record({
    countryCode: fc.integer({ min: 1, max: 999 }),
    number: fc.stringMatching(/^[1-9]\d{6,13}$/)
  }).map(({ countryCode, number }) => `+${countryCode}${number}`);

  // Generator for valid referral codes (6-12 alphanumeric characters)
  const validReferralCodeArb = fc.array(
    fc.oneof(
      fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
      fc.constantFrom(...'0123456789'.split(''))
    ),
    { minLength: 6, maxLength: 12 }
  ).map(chars => chars.join(''));

  // Generator for user IDs (UUIDs or similar)
  const userIdArb = fc.uuid();

  beforeEach(() => {
    // Clear all mocks first
    jest.clearAllMocks();
    
    // Create mock instances
    mockRedisService = {
      retrieveReferralCode: jest.fn(),
      removeReferralCode: jest.fn(),
      storeReferralCode: jest.fn(),
      setExpiration: jest.fn(),
      hasStoredCode: jest.fn(),
      getStorageInfo: jest.fn(),
    } as any;

    mockReferralService = {
      createReferralRelationship: jest.fn(),
      getReferralRelationship: jest.fn(),
      validateReferralCode: jest.fn(),
    } as any;
    
    // Create service instance with mocked dependencies
    service = new SignupIntegrationServiceImpl(mockRedisService, mockReferralService);
  });

  /**
   * **Feature: referral-system, Property 4: Signup Code Lookup and Pre-population**
   * 
   * For any phone number during signup, if a referral code exists in Redis for that number, 
   * the system should retrieve it and pre-populate the signup form.
   * 
   * **Validates: Requirements 2.1.1, 2.1.2**
   */
  describe('Property 4: Signup Code Lookup and Pre-population', () => {

    it('should consistently retrieve stored referral codes for any phone number', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        fc.option(validReferralCodeArb, { nil: null }), // May or may not have a stored code
        async (phoneNumber, storedCode) => {
          // Reset mocks for this iteration
          mockRedisService.retrieveReferralCode.mockClear();
          mockRedisService.retrieveReferralCode.mockResolvedValueOnce(storedCode);

          const result = await service.getStoredReferralCode(phoneNumber);
          
          // Property: Should always call Redis retrieve exactly once
          expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledTimes(1);
          expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledWith(phoneNumber);
          
          // Property: Should return the exact stored code or null
          expect(result).toBe(storedCode);
        }
      ), { numRuns: 100 });
    });

    it('should handle Redis errors gracefully and return null for any phone number', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        fc.constantFrom(
          'Connection timeout',
          'Redis server unavailable',
          'Network error',
          'Authentication failed',
          'Memory limit exceeded'
        ),
        async (phoneNumber, errorMessage) => {
          // Reset mocks for this iteration
          mockRedisService.retrieveReferralCode.mockClear();
          mockRedisService.retrieveReferralCode.mockRejectedValueOnce(new Error(errorMessage));

          const result = await service.getStoredReferralCode(phoneNumber);
          
          // Property: Should always call Redis retrieve exactly once
          expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledTimes(1);
          expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledWith(phoneNumber);
          
          // Property: Should return null for any Redis error (graceful degradation)
          expect(result).toBeNull();
        }
      ), { numRuns: 50 });
    });

    it('should pre-populate signup form data correctly for any phone number and stored code combination', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        fc.option(validReferralCodeArb, { nil: null }),
        async (phoneNumber, storedCode) => {
          // Reset mocks for this iteration
          mockRedisService.retrieveReferralCode.mockClear();
          mockRedisService.retrieveReferralCode.mockResolvedValueOnce(storedCode);

          const result = await service.prePopulateReferralField(phoneNumber);
          
          // Property: Should always call Redis retrieve exactly once
          expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledTimes(1);
          expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledWith(phoneNumber);
          
          // Property: Result should always be a valid SignupFormData object
          expect(result).toBeDefined();
          expect(typeof result).toBe('object');
          expect(typeof result.isPrePopulated).toBe('boolean');
          
          if (storedCode) {
            // Property: When code exists, should pre-populate with that code
            expect(result.referralCode).toBe(storedCode);
            expect(result.isPrePopulated).toBe(true);
          } else {
            // Property: When no code exists, should not pre-populate
            expect(result.referralCode).toBeUndefined();
            expect(result.isPrePopulated).toBe(false);
          }
        }
      ), { numRuns: 100 });
    });

    it('should handle pre-population with Redis errors gracefully for any phone number', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        fc.constantFrom(
          new Error('Connection lost'),
          new Error('Timeout'),
          new Error('Redis unavailable'),
          new Error('Permission denied')
        ),
        async (phoneNumber, redisError) => {
          // Reset mocks for this iteration
          mockRedisService.retrieveReferralCode.mockClear();
          mockRedisService.retrieveReferralCode.mockRejectedValueOnce(redisError);

          const result = await service.prePopulateReferralField(phoneNumber);
          
          // Property: Should always call Redis retrieve exactly once
          expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledTimes(1);
          
          // Property: Should return non-pre-populated form data for Redis errors
          expect(result).toEqual({
            referralCode: undefined,
            isPrePopulated: false
          });
        }
      ), { numRuns: 50 });
    });

    it('should maintain consistent behavior across multiple lookups for the same phone number', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        fc.option(validReferralCodeArb, { nil: null }),
        fc.integer({ min: 2, max: 5 }), // Number of lookups to perform
        async (phoneNumber, storedCode, numLookups) => {
          const results: (string | null)[] = [];
          const formResults: SignupFormData[] = [];
          
          for (let i = 0; i < numLookups; i++) {
            // Reset mocks for each iteration
            mockRedisService.retrieveReferralCode.mockClear();
            mockRedisService.retrieveReferralCode.mockResolvedValueOnce(storedCode);
            
            // Test both methods
            const codeResult = await service.getStoredReferralCode(phoneNumber);
            
            mockRedisService.retrieveReferralCode.mockClear();
            mockRedisService.retrieveReferralCode.mockResolvedValueOnce(storedCode);
            
            const formResult = await service.prePopulateReferralField(phoneNumber);
            
            results.push(codeResult);
            formResults.push(formResult);
          }
          
          // Property: All lookups should return consistent results
          results.forEach(result => {
            expect(result).toBe(storedCode);
          });
          
          // Property: All form pre-populations should be consistent
          formResults.forEach(formResult => {
            if (storedCode) {
              expect(formResult.referralCode).toBe(storedCode);
              expect(formResult.isPrePopulated).toBe(true);
            } else {
              expect(formResult.referralCode).toBeUndefined();
              expect(formResult.isPrePopulated).toBe(false);
            }
          });
        }
      ), { numRuns: 30 });
    });

    it('should handle edge cases in phone number formats consistently', async () => {
      await fc.assert(fc.asyncProperty(
        fc.oneof(
          // Various phone number formats that should be handled consistently
          fc.constant('+1234567890'),
          fc.constant('+44123456789'),
          fc.constant('+86123456789012'),
          fc.constant('+1'),
          fc.constant('+999999999999999')
        ),
        fc.option(validReferralCodeArb, { nil: null }),
        async (phoneNumber, storedCode) => {
          // Reset mocks for this iteration
          mockRedisService.retrieveReferralCode.mockClear();
          mockRedisService.retrieveReferralCode.mockResolvedValueOnce(storedCode);

          let thrownError: any = null;
          let result: string | null = undefined;
          
          try {
            result = await service.getStoredReferralCode(phoneNumber);
          } catch (error) {
            thrownError = error;
          }
          
          // Property: Should never throw errors for any phone number format
          expect(thrownError).toBeNull();
          
          // Property: Should always call Redis with the provided phone number
          expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledTimes(1);
          expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledWith(phoneNumber);
          
          // Property: Should return the stored code or null
          expect(result).toBe(storedCode);
        }
      ), { numRuns: 50 });
    });

    it('should handle referral code validation consistently during lookup', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        fc.option(
          fc.oneof(
            validReferralCodeArb,
            fc.string({ minLength: 1, maxLength: 20 }), // May include invalid codes
            fc.constant(''), // Empty string
            fc.constant('   ') // Whitespace only
          ),
          { nil: null }
        ),
        async (phoneNumber, storedCode) => {
          // Reset mocks for this iteration
          mockRedisService.retrieveReferralCode.mockClear();
          mockRedisService.retrieveReferralCode.mockResolvedValueOnce(storedCode);

          const codeResult = await service.getStoredReferralCode(phoneNumber);
          
          mockRedisService.retrieveReferralCode.mockClear();
          mockRedisService.retrieveReferralCode.mockResolvedValueOnce(storedCode);
          
          const formResult = await service.prePopulateReferralField(phoneNumber);
          
          // Property: Both methods should return consistent results regardless of code validity
          expect(codeResult).toBe(storedCode);
          
          if (storedCode) {
            expect(formResult.referralCode).toBe(storedCode);
            expect(formResult.isPrePopulated).toBe(true);
          } else {
            expect(formResult.referralCode).toBeUndefined();
            expect(formResult.isPrePopulated).toBe(false);
          }
          
          // Property: Lookup methods should not perform validation (that's for later stages)
          expect(mockReferralService.validateReferralCode).not.toHaveBeenCalled();
        }
      ), { numRuns: 100 });
    });

    it('should maintain data integrity across concurrent lookups', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(validPhoneNumberArb, { minLength: 2, maxLength: 5 }),
        fc.array(fc.option(validReferralCodeArb, { nil: null }), { minLength: 2, maxLength: 5 }),
        async (phoneNumbers, storedCodes) => {
          // Reset mocks for this iteration
          mockRedisService.retrieveReferralCode.mockClear();
          
          // Ensure arrays have same length
          const minLength = Math.min(phoneNumbers.length, storedCodes.length);
          const phones = phoneNumbers.slice(0, minLength);
          const codes = storedCodes.slice(0, minLength);
          
          // Set up mock responses for each phone number
          phones.forEach((phone, index) => {
            mockRedisService.retrieveReferralCode.mockResolvedValueOnce(codes[index]);
          });
          
          // Simulate concurrent lookups
          const lookupPromises = phones.map((phone) => {
            return service.getStoredReferralCode(phone);
          });
          
          const results = await Promise.all(lookupPromises);
          
          // Property: Each lookup should return its corresponding stored code
          results.forEach((result, index) => {
            expect(result).toBe(codes[index]);
          });
          
          // Property: Should have called Redis for each phone number
          expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledTimes(phones.length);
          
          // Property: Each phone number should have been called exactly once
          phones.forEach(phone => {
            expect(mockRedisService.retrieveReferralCode).toHaveBeenCalledWith(phone);
          });
        }
      ), { numRuns: 30 });
    });
  });
});