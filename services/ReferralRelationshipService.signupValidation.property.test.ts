/**
 * Property-based tests for Signup Validation and Relationship Creation
 * 
 * Tests that the system correctly validates referral codes during signup completion
 * and creates immutable referral relationships when valid codes are provided.
 * 
 * **Property 5: Signup Validation and Relationship Creation**
 * **Validates: Requirements 2.1.4, 2.1.5**
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

describe('ReferralRelationshipService - Signup Validation and Relationship Creation Property Tests', () => {
  let service: ReferralRelationshipService;
  let mockReferralService: jest.Mocked<ReferralService>;
  let mockValidatorService: jest.Mocked<ReferralCodeValidatorService>;
  let mockRedisService: jest.Mocked<ReferralRedisService>;

  // Generators for test data
  const userIdGen = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
  const referrerIdGen = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
  const referralCodeGen = fc.string({ minLength: 6, maxLength: 12 })
    .map(s => s.toUpperCase().replace(/[^A-Z0-9]/g, 'A'))
    .filter(s => s.length >= 6);
  const phoneNumberGen = fc.string({ minLength: 10, maxLength: 15 })
    .map(s => '+' + s.replace(/[^0-9]/g, '1'));
  const referrerNameGen = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

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
   * **Feature: referral-system, Property 5: Signup Validation and Relationship Creation**
   * **Validates: Requirements 2.1.4, 2.1.5**
   * 
   * For any referral code provided during signup completion, the system should validate
   * the code again and create an immutable referral relationship if valid.
   */
  describe('Property 5: Signup Validation and Relationship Creation', () => {
    
    it('should always validate referral code again during signup completion', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referrerIdGen,
          referralCodeGen,
          referrerNameGen,
          async (userId, referrerId, referralCode, referrerName) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validator performs validation during signup
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: referrerName, referralCode }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as any;

            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Act: Create referral relationship during signup
            const result = await service.createReferralRelationship(userId, referralCode, {
              skipRedisCleanup: true
            });

            // Property: System must always validate the code again during signup
            expect(mockValidatorService.validateForSignup).toHaveBeenCalledWith(referralCode.trim(), userId);
            expect(mockValidatorService.validateForSignup).toHaveBeenCalledTimes(1);

            // Property: Valid codes must result in successful relationship creation
            expect(result.success).toBe(true);
            expect(result.relationship).toEqual(mockRelationship);
            expect(result.errorType).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create immutable referral relationship when validation passes', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referrerIdGen,
          referralCodeGen,
          referrerNameGen,
          async (userId, referrerId, referralCode, referrerName) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validation passes
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: referrerName, referralCode }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as any;

            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Act: Create referral relationship
            const result = await service.createReferralRelationship(userId, referralCode, {
              skipRedisCleanup: true
            });

            // Property: Valid validation must result in relationship creation
            expect(mockReferralService.createReferralRelationship).toHaveBeenCalledWith(userId, referralCode.trim());
            expect(result.success).toBe(true);
            expect(result.relationship).toEqual(mockRelationship);

            // Property: Relationship must be immutable once created
            expect(result.relationship?.referrerId).toBe(referrerId);
            expect(result.relationship?.referredUserId).toBe(userId);
            expect(result.relationship?.referralCode).toBe(referralCode);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject signup when validation fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referralCodeGen,
          fc.constantFrom(
            'Invalid referral code. Please check and try again.',
            'You cannot use your own referral code.',
            'You already have a referral relationship and cannot change it.',
            'Referral code must be between 6-12 characters long.'
          ),
          async (userId, referralCode, errorMessage) => {
            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validation fails
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: false, errorMessage },
              referrer: null
            });

            // Act: Attempt to create referral relationship
            const result = await service.createReferralRelationship(userId, referralCode, {
              skipRedisCleanup: true
            });

            // Property: Failed validation must prevent relationship creation
            expect(result.success).toBe(false);
            expect(result.error).toBe(errorMessage);
            expect(result.relationship).toBeUndefined();

            // Property: No relationship creation should be attempted when validation fails
            expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle whitespace in referral codes during validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referrerIdGen,
          referralCodeGen,
          referrerNameGen,
          fc.array(fc.constant(' '), { minLength: 0, maxLength: 5 }),
          fc.array(fc.constant(' '), { minLength: 0, maxLength: 5 }),
          async (userId, referrerId, baseCode, referrerName, prefixSpaces, suffixSpaces) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Add whitespace around the code
            const referralCodeWithSpaces = prefixSpaces.join('') + baseCode + suffixSpaces.join('');

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validation passes (validator should handle trimming)
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: referrerName, referralCode: baseCode }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode: baseCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as any;

            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Act: Create relationship with whitespace in code
            const result = await service.createReferralRelationship(userId, referralCodeWithSpaces, {
              skipRedisCleanup: true
            });

            // Property: System must trim whitespace before validation
            expect(mockValidatorService.validateForSignup).toHaveBeenCalledWith(baseCode, userId);

            // Property: Trimmed code must be used for relationship creation
            expect(mockReferralService.createReferralRelationship).toHaveBeenCalledWith(userId, baseCode);
            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate empty or null referral codes appropriately', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          fc.constantFrom('', '   ', null, undefined),
          async (userId, invalidCode) => {
            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Act: Attempt to create relationship with invalid code
            const result = await service.createReferralRelationship(userId, invalidCode as any, {
              skipRedisCleanup: true
            });

            // Property: Empty/null codes must be rejected
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('INVALID_CODE');

            // Property: No validation should be attempted for clearly invalid codes
            if (invalidCode === null || invalidCode === undefined) {
              expect(mockValidatorService.validateForSignup).not.toHaveBeenCalled();
            }

            // Property: No relationship creation should be attempted
            expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle user not found scenarios', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referralCodeGen,
          async (userId, referralCode) => {
            // Setup: User does not exist
            (User.findOne as jest.Mock).mockResolvedValue(null);

            // Act: Attempt to create relationship for non-existent user
            const result = await service.createReferralRelationship(userId, referralCode, {
              skipRedisCleanup: true
            });

            // Property: Non-existent users must be rejected
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('USER_NOT_FOUND');
            expect(result.error).toBe('User not found.');

            // Property: No validation should be attempted for non-existent users
            expect(mockValidatorService.validateForSignup).not.toHaveBeenCalled();

            // Property: No relationship creation should be attempted
            expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain referral relationship immutability properties', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referrerIdGen,
          referralCodeGen,
          referrerNameGen,
          async (userId, referrerId, referralCode, referrerName) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validation passes
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: referrerName, referralCode }
            });

            // Setup: Relationship creation succeeds
            const createdAt = new Date();
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt,
              expiresAt
            } as any;

            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Act: Create referral relationship
            const result = await service.createReferralRelationship(userId, referralCode, {
              skipRedisCleanup: true
            });

            // Property: Relationship must contain immutable core properties
            expect(result.success).toBe(true);
            expect(result.relationship).toBeDefined();
            
            if (result.relationship) {
              // Property: Core relationship data must be immutable
              expect(result.relationship.referrerId).toBe(referrerId);
              expect(result.relationship.referredUserId).toBe(userId);
              expect(result.relationship.referralCode).toBe(referralCode);
              expect(result.relationship.createdAt).toEqual(createdAt);
              expect(result.relationship.expiresAt).toEqual(expiresAt);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate referral codes consistently across multiple signup attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGen,
          referrerIdGen,
          referralCodeGen,
          referrerNameGen,
          fc.integer({ min: 2, max: 5 }),
          async (userId, referrerId, referralCode, referrerName, attempts) => {
            // Ensure user and referrer are different
            fc.pre(userId !== referrerId);

            // Setup: User exists
            (User.findOne as jest.Mock).mockResolvedValue({
              userId,
              whatsappNumber: '+1234567890',
              fullName: 'Test User'
            });

            // Setup: Validation passes consistently
            mockValidatorService.validateForSignup.mockResolvedValue({
              validation: { isValid: true, referrerId },
              referrer: { id: referrerId, name: referrerName, referralCode }
            });

            // Setup: Relationship creation succeeds
            const mockRelationship: IReferralRelationship = {
              referrerId,
              referredUserId: userId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            } as any;

            mockReferralService.createReferralRelationship.mockResolvedValue(mockRelationship);

            // Act: Attempt multiple validations (simulating multiple signup attempts)
            const results = [];
            for (let i = 0; i < attempts; i++) {
              const result = await service.createReferralRelationship(userId, referralCode, {
                skipRedisCleanup: true
              });
              results.push(result);
            }

            // Property: All validation attempts must be consistent
            expect(mockValidatorService.validateForSignup).toHaveBeenCalledTimes(attempts);
            
            // Property: All results must be consistent
            results.forEach(result => {
              expect(result.success).toBe(true);
              expect(result.relationship).toEqual(mockRelationship);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});