/**
 * Property-based tests for Self-Referral Prevention
 * 
 * Tests that the system correctly prevents users from using their own referral codes
 * across all possible scenarios and input combinations.
 * 
 * **Property 7: Self-Referral Prevention**
 * **Validates: Requirements 2.1.7**
 */

import * as fc from 'fast-check';
import { ReferralRelationshipService } from './ReferralRelationshipService';
import { ReferralService, SelfReferralError } from './ReferralService';
import { ReferralCodeValidatorService } from './ReferralCodeValidatorService';
import { ReferralRedisService } from './ReferralRedisService';
import { User } from '../models/User';

// Mock dependencies
jest.mock('./ReferralService');
jest.mock('./ReferralCodeValidatorService');
jest.mock('./ReferralRedisService');
jest.mock('../models/User');

describe('ReferralRelationshipService - Self-Referral Prevention Property Tests', () => {
  let service: ReferralRelationshipService;
  let mockReferralService: jest.Mocked<ReferralService>;
  let mockValidatorService: jest.Mocked<ReferralCodeValidatorService>;
  let mockRedisService: jest.Mocked<ReferralRedisService>;

  // Generators for test data
  const userIdGen = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
  const referralCodeGen = fc.string({ minLength: 6, maxLength: 12 })
    .map(s => s.toUpperCase().replace(/[^A-Z0-9]/g, 'A'))
    .filter(s => s.length >= 6);

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
   * **Feature: referral-system, Property 7: Self-Referral Prevention**
   * **Validates: Requirements 2.1.7**
   * 
   * For any user attempting to use their own referral code, the system should reject
   * the self-referral attempt.
   */
  describe('Property 7: Self-Referral Prevention', () => {
    
    it('should always reject when a user attempts to use their own referral code', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referralCodeGen,
          async (userId, referralCode) => {
            // Setup: User exists and owns the referral code they're trying to use
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              referralCode,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validator detects self-referral
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: {
                isValid: false,
                errorMessage: 'You cannot use your own referral code.'
              },
              referrer: null
            });

            // Attempt to create referral relationship with own code
            const result = await service.createReferralRelationship(userId, referralCode, {
              skipRedisCleanup: true
            });

            // Property: Self-referral must always be rejected
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('SELF_REFERRAL');
            expect(result.error).toContain('own referral code');

            // Verify no relationship was created
            expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject self-referral regardless of code case variations', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referralCodeGen,
          fc.constantFrom('lower', 'upper', 'mixed'),
          async (userId, baseCode, caseVariation) => {
            // Apply case variation to the code
            let referralCode = baseCode;
            if (caseVariation === 'lower') {
              referralCode = baseCode.toLowerCase();
            } else if (caseVariation === 'mixed') {
              referralCode = baseCode.split('').map((c, i) => 
                i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
              ).join('');
            }

            // Setup: User exists with uppercase version of the code
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              referralCode: baseCode.toUpperCase(),
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validator detects self-referral (case-insensitive)
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: {
                isValid: false,
                errorMessage: 'You cannot use your own referral code.'
              },
              referrer: null
            });

            // Attempt to use own code with different casing
            const result = await service.createReferralRelationship(userId, referralCode, {
              skipRedisCleanup: true
            });

            // Property: Self-referral must be rejected regardless of case
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('SELF_REFERRAL');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject self-referral with whitespace variations', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referralCodeGen,
          fc.array(fc.constant(' '), { minLength: 0, maxLength: 5 }),
          fc.array(fc.constant(' '), { minLength: 0, maxLength: 5 }),
          async (userId, baseCode, prefixSpaces, suffixSpaces) => {
            // Add whitespace around the code
            const referralCodeWithSpaces = prefixSpaces.join('') + baseCode + suffixSpaces.join('');

            // Setup: User exists with trimmed version of the code
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              referralCode: baseCode.trim().toUpperCase(),
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validator detects self-referral after trimming
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: {
                isValid: false,
                errorMessage: 'You cannot use your own referral code.'
              },
              referrer: null
            });

            // Attempt to use own code with whitespace
            const result = await service.createReferralRelationship(userId, referralCodeWithSpaces, {
              skipRedisCleanup: true
            });

            // Property: Self-referral must be rejected even with whitespace
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('SELF_REFERRAL');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle SelfReferralError from ReferralService correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referralCodeGen,
          async (userId, referralCode) => {
            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              referralCode,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validator passes (edge case where validator doesn't catch it)
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId: userId },
              referrer: { id: userId, name: 'Test User', referralCode }
            });

            // Setup: ReferralService throws SelfReferralError
            const selfReferralError = new SelfReferralError('Cannot refer yourself');
            mockReferralService.createReferralRelationship.mockRejectedValue(selfReferralError);

            // Attempt to create relationship
            const result = await service.createReferralRelationship(userId, referralCode, {
              skipRedisCleanup: true
            });

            // Property: Must handle SelfReferralError and return appropriate error type
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('SELF_REFERRAL');
            expect(result.error).toBeTruthy();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow valid referrals from different users', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          userIdGen,
          referralCodeGen,
          async (userId, referrerId, referralCode) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Setup: User exists (different from referrer)
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validator passes (valid referral from different user)
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: 'Referrer User', referralCode }
            });

            // Setup: Relationship creation succeeds
            mockReferralService.createReferralRelationship.mockResolvedValue({
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as any);

            // Attempt to create valid referral relationship
            const result = await service.createReferralRelationship(userId, referralCode, {
              skipRedisCleanup: true
            });

            // Property: Valid referrals from different users must succeed
            expect(result.success).toBe(true);
            expect(result.relationship).toBeDefined();
            expect(result.errorType).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate referral code during validation phase without creating relationship', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referralCodeGen,
          async (userId, referralCode) => {
            // Setup: User exists and owns the code
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              referralCode,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validator detects self-referral
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: {
                isValid: false,
                errorMessage: 'You cannot use your own referral code.'
              },
              referrer: null
            });

            // Validate without creating relationship
            const result = await service.validateReferralForSignup(userId, referralCode);

            // Property: Validation must reject self-referral
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('SELF_REFERRAL');

            // Verify no relationship creation was attempted
            expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
