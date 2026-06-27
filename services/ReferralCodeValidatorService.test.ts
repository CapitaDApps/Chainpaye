/**
 * Unit tests for ReferralCodeValidatorService
 * 
 * Tests validation logic, database lookup, error handling, and edge cases
 * for the referral code validation functionality.
 * 
 * Validates: Requirements 2.1, 2.3, 2.4, 2.1.6, 2.1.7
 */

import { ReferralCodeValidatorService } from './ReferralCodeValidatorService';
import { User } from '../models/User';

// Mock the User model
jest.mock('../models/User');
const MockedUser = User as jest.Mocked<typeof User>;

describe('ReferralCodeValidatorService', () => {
  let service: ReferralCodeValidatorService;

  beforeEach(() => {
    service = new ReferralCodeValidatorService();
    jest.clearAllMocks();
  });

  describe('validateCode', () => {
    it('should return invalid for null or undefined code', async () => {
      const result = await service.validateCode('');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Referral code is required.');
    });

    it('should return invalid for non-string code', async () => {
      const result = await service.validateCode(null as any);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Referral code is required.');
    });

    it('should return invalid for code shorter than 6 characters', async () => {
      const result = await service.validateCode('ABC12');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Referral code must be between 6-12 characters long.');
    });

    it('should return invalid for code longer than 12 characters', async () => {
      const result = await service.validateCode('ABCDEFGHIJKLM');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Referral code must be between 6-12 characters long.');
    });

    it('should return invalid for code with special characters', async () => {
      const result = await service.validateCode('ABC123!');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Referral code must contain only letters and numbers.');
    });

    it('should return invalid for code with spaces', async () => {
      const result = await service.validateCode('ABC 123');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Referral code must contain only letters and numbers.');
    });

    it('should return invalid for non-existent code', async () => {
      MockedUser.findOne.mockResolvedValue(null);
      
      const result = await service.validateCode('ABC123');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Invalid referral code. Please check and try again.');
      expect(MockedUser.findOne).toHaveBeenCalledWith({ referralCode: 'ABC123' });
    });

    it('should return valid for existing code', async () => {
      const mockUser = {
        userId: 'user123',
        referralCode: 'ABC123'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.validateCode('abc123'); // Test case insensitive
      expect(result.isValid).toBe(true);
      expect(result.referrerId).toBe('user123');
      expect(MockedUser.findOne).toHaveBeenCalledWith({ referralCode: 'ABC123' });
    });

    it('should handle database errors gracefully', async () => {
      MockedUser.findOne.mockRejectedValue(new Error('Database error'));
      
      const result = await service.validateCode('ABC123');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Unable to validate referral code. Please try again later.');
    });

    it('should trim whitespace from code', async () => {
      const mockUser = {
        userId: 'user123',
        referralCode: 'ABC123'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.validateCode('  abc123  ');
      expect(result.isValid).toBe(true);
      expect(MockedUser.findOne).toHaveBeenCalledWith({ referralCode: 'ABC123' });
    });
  });

  describe('getReferrerInfo', () => {
    it('should return null for non-existent code', async () => {
      MockedUser.findOne.mockResolvedValue(null);
      
      const result = await service.getReferrerInfo('ABC123');
      expect(result).toBeNull();
    });

    it('should return referrer info for existing code', async () => {
      const mockUser = {
        userId: 'user123',
        firstName: 'John',
        fullName: 'John Doe',
        referralCode: 'ABC123'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.getReferrerInfo('ABC123');
      expect(result).toEqual({
        id: 'user123',
        name: 'John',
        referralCode: 'ABC123'
      });
    });

    it('should use fullName when firstName is not available', async () => {
      const mockUser = {
        userId: 'user123',
        fullName: 'John Doe',
        referralCode: 'ABC123'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.getReferrerInfo('ABC123');
      expect(result).toEqual({
        id: 'user123',
        name: 'John Doe',
        referralCode: 'ABC123'
      });
    });

    it('should use default name when no name fields are available', async () => {
      const mockUser = {
        userId: 'user123',
        referralCode: 'ABC123'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.getReferrerInfo('ABC123');
      expect(result).toEqual({
        id: 'user123',
        name: 'ChainPaye User',
        referralCode: 'ABC123'
      });
    });

    it('should return null when user has no referral code', async () => {
      const mockUser = {
        userId: 'user123',
        firstName: 'John'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.getReferrerInfo('ABC123');
      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      MockedUser.findOne.mockRejectedValue(new Error('Database error'));
      
      const result = await service.getReferrerInfo('ABC123');
      expect(result).toBeNull();
    });
  });

  describe('validateCodeForUser', () => {
    it('should prevent self-referral', async () => {
      const mockUser = {
        userId: 'user123',
        referralCode: 'ABC123'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.validateCodeForUser('ABC123', 'user123');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('You cannot use your own referral code.');
    });

    it('should allow valid referral from different user', async () => {
      const mockUser = {
        userId: 'user123',
        referralCode: 'ABC123'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.validateCodeForUser('ABC123', 'user456');
      expect(result.isValid).toBe(true);
      expect(result.referrerId).toBe('user123');
    });

    it('should return validation errors for invalid codes', async () => {
      const result = await service.validateCodeForUser('ABC', 'user456');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Referral code must be between 6-12 characters long.');
    });
  });

  describe('userAlreadyReferred', () => {
    it('should return true for user with existing referrer', async () => {
      const mockUser = {
        userId: 'user123',
        referredBy: 'user456'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.userAlreadyReferred('user123');
      expect(result).toBe(true);
      expect(MockedUser.findOne).toHaveBeenCalledWith({ userId: 'user123' });
    });

    it('should return false for user without referrer', async () => {
      const mockUser = {
        userId: 'user123'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.userAlreadyReferred('user123');
      expect(result).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      MockedUser.findOne.mockResolvedValue(null);
      
      const result = await service.userAlreadyReferred('user123');
      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      MockedUser.findOne.mockRejectedValue(new Error('Database error'));
      
      const result = await service.userAlreadyReferred('user123');
      expect(result).toBe(false);
    });
  });

  describe('validateForSignup', () => {
    it('should reject user who already has a referrer', async () => {
      const mockUser = {
        userId: 'user123',
        referredBy: 'user456'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.validateForSignup('ABC123', 'user123');
      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errorMessage).toBe('You already have a referral relationship and cannot change it.');
      expect(result.referrer).toBeNull();
    });

    it('should reject self-referral for new user', async () => {
      MockedUser.findOne
        .mockResolvedValueOnce(null) // userAlreadyReferred check
        .mockResolvedValueOnce({ userId: 'user123', referralCode: 'ABC123' }); // validateCodeForUser check
      
      const result = await service.validateForSignup('ABC123', 'user123');
      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errorMessage).toBe('You cannot use your own referral code.');
      expect(result.referrer).toBeNull();
    });

    it('should accept valid referral for new user', async () => {
      const mockReferrer = {
        userId: 'user456',
        firstName: 'Jane',
        referralCode: 'ABC123'
      };
      
      MockedUser.findOne
        .mockResolvedValueOnce(null) // userAlreadyReferred check
        .mockResolvedValueOnce(mockReferrer as any) // validateCodeForUser check
        .mockResolvedValueOnce(mockReferrer as any); // getReferrerInfo check
      
      const result = await service.validateForSignup('ABC123', 'user123');
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.referrerId).toBe('user456');
      expect(result.referrer).toEqual({
        id: 'user456',
        name: 'Jane',
        referralCode: 'ABC123'
      });
    });

    it('should handle database errors gracefully', async () => {
      MockedUser.findOne.mockRejectedValue(new Error('Database error'));
      
      const result = await service.validateForSignup('ABC123', 'user123');
      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errorMessage).toBe('Unable to validate referral code. Please try again later.');
      expect(result.referrer).toBeNull();
    });
  });

  describe('validateAndGetReferrer', () => {
    it('should return validation result and referrer info for valid code', async () => {
      const mockUser = {
        userId: 'user123',
        firstName: 'John',
        referralCode: 'ABC123'
      };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.validateAndGetReferrer('ABC123');
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.referrerId).toBe('user123');
      expect(result.referrer).toEqual({
        id: 'user123',
        name: 'John',
        referralCode: 'ABC123'
      });
    });

    it('should return validation error and null referrer for invalid code', async () => {
      MockedUser.findOne.mockResolvedValue(null);
      
      const result = await service.validateAndGetReferrer('ABC123');
      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errorMessage).toBe('Invalid referral code. Please check and try again.');
      expect(result.referrer).toBeNull();
    });
  });

  describe('codeExists', () => {
    it('should return true for existing code', async () => {
      const mockUser = { referralCode: 'ABC123' };
      MockedUser.findOne.mockResolvedValue(mockUser as any);
      
      const result = await service.codeExists('ABC123');
      expect(result).toBe(true);
    });

    it('should return false for non-existent code', async () => {
      MockedUser.findOne.mockResolvedValue(null);
      
      const result = await service.codeExists('ABC123');
      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      MockedUser.findOne.mockRejectedValue(new Error('Database error'));
      
      const result = await service.codeExists('ABC123');
      expect(result).toBe(false);
    });
  });

  describe('validateMultipleCodes', () => {
    it('should validate multiple codes and return results in order', async () => {
      MockedUser.findOne
        .mockResolvedValueOnce({ userId: 'user1', referralCode: 'ABC123' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ userId: 'user2', referralCode: 'XYZ789' });
      
      const results = await service.validateMultipleCodes(['ABC123', 'INVALID', 'XYZ789']);
      
      expect(results).toHaveLength(3);
      expect(results[0].isValid).toBe(true);
      expect(results[0].referrerId).toBe('user1');
      expect(results[1].isValid).toBe(false);
      expect(results[2].isValid).toBe(true);
      expect(results[2].referrerId).toBe('user2');
    });

    it('should handle empty array', async () => {
      const results = await service.validateMultipleCodes([]);
      expect(results).toHaveLength(0);
    });
  });
});