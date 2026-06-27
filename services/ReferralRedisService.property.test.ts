/**
 * Property-based tests for ReferralRedisService
 * Tests Redis storage functionality with TTL across various inputs using fast-check
 * 
 * **Property 2: Redis Storage with TTL**
 * **Validates: Requirements 2.2, 10.1, 10.2**
 */

import * as fc from 'fast-check';
import { ReferralRedisService } from './ReferralRedisService';
import { redisClient } from './redis';
import { RedisOperationError } from '../types/referral-capture.types';

// Mock the redis client
jest.mock('./redis', () => ({
  redisClient: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    setExpiration: jest.fn()
  }
}));

describe('ReferralRedisService - Property Tests', () => {
  let service: ReferralRedisService;
  const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;

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

  beforeEach(() => {
    service = new ReferralRedisService();
    jest.clearAllMocks();
  });

  /**
   * **Feature: referral-system, Property 2: Redis Storage with TTL**
   * 
   * For any valid referral code and phone number combination, storing the code in Redis 
   * should use the phone number as the key and set a 24-hour expiration time.
   * 
   * **Validates: Requirements 2.2, 10.1, 10.2**
   */
  describe('Property 2: Redis Storage with TTL', () => {

    it('should store referral codes with consistent key format and 24-hour TTL', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        validReferralCodeArb,
        async (phoneNumber, referralCode) => {
          // Reset mocks for this iteration
          mockRedisClient.set.mockClear();
          mockRedisClient.set.mockResolvedValueOnce(undefined);

          // Test the storage operation
          await service.storeReferralCode(phoneNumber, referralCode);
          
          // Property: Should call Redis set exactly once
          expect(mockRedisClient.set).toHaveBeenCalledTimes(1);
          
          const [key, value, expiryMode, ttl] = mockRedisClient.set.mock.calls[0];
          
          // Property: Key should follow the pattern "referral:temp:{normalizedPhone}"
          expect(key).toMatch(/^referral:temp:\+\d+$/);
          
          // Property: Value should be the referral code as provided
          expect(value).toBe(referralCode);
          
          // Property: Should use "EX" expiry mode with 24-hour TTL
          expect(expiryMode).toBe("EX");
          expect(ttl).toBe(86400);
          
          // Property: Phone number should be normalized (remove non-digit chars except +)
          const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
          expect(key).toBe(`referral:temp:${normalizedPhone}`);
        }
      ), { numRuns: 50 });
    });

    it('should retrieve stored codes using normalized phone number keys', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        validReferralCodeArb,
        async (phoneNumber, referralCode) => {
          // Reset mocks for this iteration
          mockRedisClient.get.mockClear();
          mockRedisClient.get.mockResolvedValueOnce(referralCode);

          const result = await service.retrieveReferralCode(phoneNumber);
          
          // Property: Should call Redis get exactly once
          expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
          
          const [key] = mockRedisClient.get.mock.calls[0];
          
          // Property: Key should be normalized consistently
          const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
          expect(key).toBe(`referral:temp:${normalizedPhone}`);
          
          // Property: Should return the stored referral code
          expect(result).toBe(referralCode);
        }
      ), { numRuns: 50 });
    });

    it('should handle null/expired codes gracefully', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        async (phoneNumber) => {
          // Reset mocks for this iteration
          mockRedisClient.get.mockClear();
          mockRedisClient.get.mockResolvedValueOnce(null);

          const result = await service.retrieveReferralCode(phoneNumber);
          
          // Property: Should call Redis get exactly once
          expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
          
          // Property: Should return null for expired/non-existent codes
          expect(result).toBeNull();
        }
      ), { numRuns: 50 });
    });

    it('should remove codes using normalized phone number keys', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        async (phoneNumber) => {
          // Reset mocks for this iteration
          mockRedisClient.del.mockClear();
          mockRedisClient.del.mockResolvedValueOnce(1);

          await service.removeReferralCode(phoneNumber);
          
          // Property: Should call Redis del exactly once
          expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
          
          const [key] = mockRedisClient.del.mock.calls[0];
          
          // Property: Key should be normalized consistently
          const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
          expect(key).toBe(`referral:temp:${normalizedPhone}`);
        }
      ), { numRuns: 50 });
    });

    it('should handle Redis operation errors consistently', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        validReferralCodeArb,
        fc.constantFrom('store', 'retrieve', 'remove'),
        async (phoneNumber, referralCode, operation) => {
          const redisError = new Error('Redis connection failed');
          
          // Reset and setup mocks for this iteration
          jest.clearAllMocks();
          
          // Mock different Redis operations to fail
          switch (operation) {
            case 'store':
              mockRedisClient.set.mockRejectedValueOnce(redisError);
              break;
            case 'retrieve':
              mockRedisClient.get.mockRejectedValueOnce(redisError);
              break;
            case 'remove':
              mockRedisClient.del.mockRejectedValueOnce(redisError);
              break;
          }

          // Property: All Redis operation failures should throw RedisOperationError
          let thrownError: any;
          try {
            switch (operation) {
              case 'store':
                await service.storeReferralCode(phoneNumber, referralCode);
                break;
              case 'retrieve':
                await service.retrieveReferralCode(phoneNumber);
                break;
              case 'remove':
                await service.removeReferralCode(phoneNumber);
                break;
            }
          } catch (error) {
            thrownError = error;
          }

          // Property: Should always throw RedisOperationError for Redis failures
          expect(thrownError).toBeInstanceOf(RedisOperationError);
          expect(thrownError.name).toBe('RedisOperationError');
          expect(thrownError.operation).toBeDefined();
          expect(thrownError.message).toContain(phoneNumber);
        }
      ), { numRuns: 30 });
    });

    it('should set custom expiration times correctly', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }), // Redis key
        fc.integer({ min: 1, max: 86400 * 7 }), // TTL in seconds (up to 7 days)
        async (key, ttlSeconds) => {
          // Reset mocks for this iteration
          mockRedisClient.setExpiration.mockClear();
          mockRedisClient.setExpiration.mockResolvedValueOnce(undefined);

          await service.setExpiration(key, ttlSeconds);
          
          // Property: Should call Redis setExpiration with exact parameters
          expect(mockRedisClient.setExpiration).toHaveBeenCalledTimes(1);
          expect(mockRedisClient.setExpiration).toHaveBeenCalledWith(key, ttlSeconds);
        }
      ), { numRuns: 50 });
    });

    it('should check code existence consistently', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        fc.boolean(), // Whether code exists
        async (phoneNumber, codeExists) => {
          const mockCode = codeExists ? 'ABC123' : null;
          
          // Reset mocks for this iteration
          mockRedisClient.get.mockClear();
          mockRedisClient.get.mockResolvedValueOnce(mockCode);

          const result = await service.hasStoredCode(phoneNumber);
          
          // Property: Should use the same key normalization as other methods
          const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
          expect(mockRedisClient.get).toHaveBeenCalledWith(`referral:temp:${normalizedPhone}`);
          
          // Property: hasStoredCode should return boolean matching code existence
          expect(typeof result).toBe('boolean');
          expect(result).toBe(codeExists);
        }
      ), { numRuns: 50 });
    });
  });

  /**
   * **Feature: referral-system, Property 8: Expired Code Handling**
   * 
   * For any Redis lookup of an expired or non-existent referral code, the system 
   * should handle the case gracefully without errors.
   * 
   * **Validates: Requirements 10.3**
   */
  describe('Property 8: Expired Code Handling', () => {
    
    it('should handle expired codes gracefully without throwing errors', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        async (phoneNumber) => {
          // Reset mocks for this iteration
          mockRedisClient.get.mockClear();
          
          // Simulate expired/non-existent code by returning null
          mockRedisClient.get.mockResolvedValueOnce(null);

          // Property: Retrieving expired codes should not throw errors
          let thrownError: any = null;
          let result: string | null = null;
          
          try {
            result = await service.retrieveReferralCode(phoneNumber);
          } catch (error) {
            thrownError = error;
          }

          // Property: Should not throw any errors for expired/non-existent codes
          expect(thrownError).toBeNull();
          
          // Property: Should return null gracefully for expired codes
          expect(result).toBeNull();
          
          // Property: Should still call Redis get operation
          expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
          
          // Property: Should use correct key format
          const normalizedPhone = phoneNumber.replace(/[^\d+]/g, '');
          expect(mockRedisClient.get).toHaveBeenCalledWith(`referral:temp:${normalizedPhone}`);
        }
      ), { numRuns: 50 });
    });

    it('should handle hasStoredCode checks for expired codes gracefully', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        async (phoneNumber) => {
          // Reset mocks for this iteration
          mockRedisClient.get.mockClear();
          
          // Simulate expired code
          mockRedisClient.get.mockResolvedValueOnce(null);

          // Property: Checking existence of expired codes should not throw errors
          let thrownError: any = null;
          let result: boolean = true; // Initialize to non-expected value
          
          try {
            result = await service.hasStoredCode(phoneNumber);
          } catch (error) {
            thrownError = error;
          }

          // Property: Should not throw any errors for expired codes
          expect(thrownError).toBeNull();
          
          // Property: Should return false for expired/non-existent codes
          expect(result).toBe(false);
          
          // Property: Should call Redis get operation
          expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
        }
      ), { numRuns: 50 });
    });

    it('should handle getStorageInfo for expired codes gracefully', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        async (phoneNumber) => {
          // Reset mocks for this iteration
          mockRedisClient.get.mockClear();
          
          // Simulate expired code
          mockRedisClient.get.mockResolvedValueOnce(null);

          // Property: Getting storage info for expired codes should not throw errors
          let thrownError: any = null;
          let result: any = undefined;
          
          try {
            result = await service.getStorageInfo(phoneNumber);
          } catch (error) {
            thrownError = error;
          }

          // Property: Should not throw any errors for expired codes
          expect(thrownError).toBeNull();
          
          // Property: Should return null for expired/non-existent codes
          expect(result).toBeNull();
          
          // Property: Should call Redis get operation
          expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
        }
      ), { numRuns: 50 });
    });

    it('should handle Redis connection errors during expired code retrieval gracefully', async () => {
      await fc.assert(fc.asyncProperty(
        validPhoneNumberArb,
        fc.constantFrom(
          'Connection timeout',
          'Redis server unavailable', 
          'Network error',
          'Authentication failed'
        ),
        async (phoneNumber, errorMessage) => {
          // Reset mocks for this iteration
          mockRedisClient.get.mockClear();
          
          // Simulate Redis connection/operation error
          const redisError = new Error(errorMessage);
          mockRedisClient.get.mockRejectedValueOnce(redisError);

          // Property: Redis errors should be wrapped in RedisOperationError
          let thrownError: any = null;
          
          try {
            await service.retrieveReferralCode(phoneNumber);
          } catch (error) {
            thrownError = error;
          }

          // Property: Should throw RedisOperationError for Redis failures
          expect(thrownError).toBeInstanceOf(RedisOperationError);
          expect(thrownError.name).toBe('RedisOperationError');
          expect(thrownError.operation).toBe('retrieveReferralCode');
          expect(thrownError.message).toContain(phoneNumber);
          expect(thrownError.message).toContain(errorMessage);
        }
      ), { numRuns: 30 });
    });

    it('should handle mixed scenarios of expired and valid codes consistently', async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(validPhoneNumberArb, { minLength: 2, maxLength: 5 }),
        fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
        async (phoneNumbers, codeExistsFlags) => {
          // Ensure arrays have same length
          const minLength = Math.min(phoneNumbers.length, codeExistsFlags.length);
          const phones = phoneNumbers.slice(0, minLength);
          const flags = codeExistsFlags.slice(0, minLength);
          
          const results: (string | null)[] = [];
          
          for (let i = 0; i < phones.length; i++) {
            // Reset mocks for each phone number
            mockRedisClient.get.mockClear();
            
            // Mock response based on flag
            const mockResponse = flags[i] ? `CODE${i}` : null;
            mockRedisClient.get.mockResolvedValueOnce(mockResponse);
            
            // Property: Each retrieval should handle expired/valid codes consistently
            let thrownError: any = null;
            let result: string | null = undefined;
            
            try {
              result = await service.retrieveReferralCode(phones[i]);
            } catch (error) {
              thrownError = error;
            }
            
            // Property: Should never throw errors for expired codes
            expect(thrownError).toBeNull();
            
            // Property: Should return expected result based on existence
            expect(result).toBe(mockResponse);
            
            results.push(result);
          }
          
          // Property: Results should match the expected pattern
          expect(results.length).toBe(phones.length);
          results.forEach((result, index) => {
            if (flags[index]) {
              expect(result).toBe(`CODE${index}`);
            } else {
              expect(result).toBeNull();
            }
          });
        }
      ), { numRuns: 20 });
    });
  });
});