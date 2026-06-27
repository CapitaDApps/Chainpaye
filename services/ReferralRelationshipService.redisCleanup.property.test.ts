/**
 * Property-based tests for Redis Cleanup After Relationship Creation
 * 
 * Tests that the system correctly removes temporary referral codes from Redis
 * after successful referral relationship creation across all scenarios.
 * 
 * **Property 9: Redis Cleanup After Relationship Creation**
 * **Validates: Requirements 10.4**
 */

import * as fc from 'fast-check';
import { ReferralRelationshipService } from './ReferralRelationshipService';
import { ReferralService } from './ReferralService';
import { ReferralCodeValidatorService } from './ReferralCodeValidatorService';
import { ReferralRedisService } from './ReferralRedisService';
import { User } from '../models/User';
import { IReferralRelationship } from '../models/ReferralRelationship';

// Mock dependencies
jest.mock('./ReferralService');
jest.mock('./ReferralCodeValidatorService');
jest.mock('./ReferralRedisService');
jest.mock('../models/User');

describe('ReferralRelationshipService - Redis Cleanup Property Tests', () => {
  let service: ReferralRelationshipService;
  let mockReferralService: jest.Mocked<ReferralService>;
  let mockValidatorService: jest.Mocked<ReferralCodeValidatorService>;
  let mockRedisService: jest.Mocked<ReferralRedisService>;

  // Generators for test data
  const userIdGen = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
  const referralCodeGen = fc.string({ minLength: 6, maxLength: 12 })
    .map(s => s.toUpperCase().replace(/[^A-Z0-9]/g, 'A'))
    .filter(s => s.length >= 6);
  
  // Phone number generator (international format)
  const phoneNumberGen = fc.record({
    countryCode: fc.constantFrom('+1', '+44', '+91', '+86', '+81', '+49', '+33'),
    number: fc.integer({ min: 1000000000, max: 9999999999 })
  }).map(({ countryCode, number }) => `${countryCode}${number}`);

  beforeEach(() => {
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
    mockRedisService.removeReferralCode.mockResolvedValue();
  });

  /**
   * **Feature: referral-system, Property 9: Redis Cleanup After Relationship Creation**
   * **Validates: Requirements 10.4**
   * 
   * For any successful referral relationship creation, the temporary referral code
   * should be removed from Redis.
   */
  describe('Property 9: Redis Cleanup After Relationship Creation', () => {
    
    it('should always remove referral code from Redis after successful relationship creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          userIdGen,
          referralCodeGen,
          phoneNumberGen,
          async (userId, referrerId, referralCode, phoneNumber) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Clear mocks for this iteration
            jest.clearAllMocks();

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: phoneNumber,
              fullName: 'Test User'
            });

            // Setup: Validation succeeds
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: 'Referrer User', referralCode }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as IReferralRelationship;
            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Setup: Redis cleanup succeeds
            mockRedisService.removeReferralCode.mockResolvedValue();

            // Create referral relationship with phone number
            const result = await service.createReferralRelationship(userId, referralCode, {
              phoneNumber
            });

            // Property: Redis cleanup must be called after successful creation
            expect(result.success).toBe(true);
            expect(mockRedisService.removeReferralCode).toHaveBeenCalledWith(phoneNumber);
            expect(mockRedisService.removeReferralCode).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not call Redis cleanup when phone number is not provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          userIdGen,
          referralCodeGen,
          async (userId, referrerId, referralCode) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validation succeeds
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: 'Referrer User', referralCode }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as IReferralRelationship;
            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Create referral relationship without phone number
            const result = await service.createReferralRelationship(userId, referralCode);

            // Property: Redis cleanup must not be called when phone number is missing
            expect(result.success).toBe(true);
            expect(mockRedisService.removeReferralCode).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not call Redis cleanup when skipRedisCleanup flag is true', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          userIdGen,
          referralCodeGen,
          phoneNumberGen,
          async (userId, referrerId, referralCode, phoneNumber) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: phoneNumber,
              fullName: 'Test User'
            });

            // Setup: Validation succeeds
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: 'Referrer User', referralCode }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as IReferralRelationship;
            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Create referral relationship with skipRedisCleanup flag
            const result = await service.createReferralRelationship(userId, referralCode, {
              phoneNumber,
              skipRedisCleanup: true
            });

            // Property: Redis cleanup must not be called when explicitly skipped
            expect(result.success).toBe(true);
            expect(mockRedisService.removeReferralCode).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not fail relationship creation if Redis cleanup fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          userIdGen,
          referralCodeGen,
          phoneNumberGen,
          async (userId, referrerId, referralCode, phoneNumber) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: phoneNumber,
              fullName: 'Test User'
            });

            // Setup: Validation succeeds
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: 'Referrer User', referralCode }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as IReferralRelationship;
            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Setup: Redis cleanup fails
            mockRedisService.removeReferralCode.mockRejectedValue(new Error('Redis connection error'));

            // Create referral relationship
            const result = await service.createReferralRelationship(userId, referralCode, {
              phoneNumber
            });

            // Property: Relationship creation must succeed even if Redis cleanup fails
            expect(result.success).toBe(true);
            expect(result.relationship).toEqual(mockRelationship);
            expect(mockRedisService.removeReferralCode).toHaveBeenCalledWith(phoneNumber);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not call Redis cleanup when relationship creation fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referralCodeGen,
          phoneNumberGen,
          async (userId, referralCode, phoneNumber) => {
            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: phoneNumber,
              fullName: 'Test User'
            });

            // Setup: Validation fails
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: {
                isValid: false,
                errorMessage: 'Invalid referral code. Please check and try again.'
              },
              referrer: null
            });

            // Attempt to create referral relationship
            const result = await service.createReferralRelationship(userId, referralCode, {
              phoneNumber
            });

            // Property: Redis cleanup must not be called when relationship creation fails
            expect(result.success).toBe(false);
            expect(mockRedisService.removeReferralCode).not.toHaveBeenCalled();
            expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle various phone number formats correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          userIdGen,
          referralCodeGen,
          phoneNumberGen,
          async (userId, referrerId, referralCode, phoneNumber) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: phoneNumber,
              fullName: 'Test User'
            });

            // Setup: Validation succeeds
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: 'Referrer User', referralCode }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as IReferralRelationship;
            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Create referral relationship
            const result = await service.createReferralRelationship(userId, referralCode, {
              phoneNumber
            });

            // Property: Redis cleanup must be called with the exact phone number provided
            expect(result.success).toBe(true);
            expect(mockRedisService.removeReferralCode).toHaveBeenCalledWith(phoneNumber);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should cleanup Redis exactly once per successful relationship creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          userIdGen,
          referralCodeGen,
          phoneNumberGen,
          async (userId, referrerId, referralCode, phoneNumber) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Clear mocks for this iteration
            jest.clearAllMocks();

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: phoneNumber,
              fullName: 'Test User'
            });

            // Setup: Validation succeeds
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: 'Referrer User', referralCode }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as IReferralRelationship;
            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Setup: Redis cleanup succeeds
            mockRedisService.removeReferralCode.mockResolvedValue();

            // Create referral relationship
            await service.createReferralRelationship(userId, referralCode, {
              phoneNumber
            });

            // Property: Redis cleanup must be called exactly once
            expect(mockRedisService.removeReferralCode).toHaveBeenCalledTimes(1);
            expect(mockRedisService.removeReferralCode).toHaveBeenCalledWith(phoneNumber);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should cleanup Redis after relationship creation regardless of referral code format', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          userIdGen,
          referralCodeGen,
          phoneNumberGen,
          fc.array(fc.constant(' '), { minLength: 0, maxLength: 3 }),
          fc.array(fc.constant(' '), { minLength: 0, maxLength: 3 }),
          async (userId, referrerId, baseCode, phoneNumber, prefixSpaces, suffixSpaces) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Add whitespace around the code
            const referralCodeWithSpaces = prefixSpaces.join('') + baseCode + suffixSpaces.join('');

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: phoneNumber,
              fullName: 'Test User'
            });

            // Setup: Validation succeeds (after trimming)
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: 'Referrer User', referralCode: baseCode.trim() }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode: baseCode.trim(),
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as IReferralRelationship;
            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Create referral relationship with whitespace in code
            const result = await service.createReferralRelationship(userId, referralCodeWithSpaces, {
              phoneNumber
            });

            // Property: Redis cleanup must occur regardless of code format
            expect(result.success).toBe(true);
            expect(mockRedisService.removeReferralCode).toHaveBeenCalledWith(phoneNumber);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
