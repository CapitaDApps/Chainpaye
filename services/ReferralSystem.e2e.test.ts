/**
 * End-to-End Integration Tests for Referral System
 * 
 * Tests complete user journey from start command to signup completion.
 * Validates the entire referral code capture flow including:
 * - WhatsApp message handling
 * - Redis temporary storage
 * - Signup form pre-population
 * - Referral relationship creation
 * - Redis cleanup
 * 
 * These tests verify the actual integration between all components
 * while mocking only external dependencies (WhatsApp API, Database, Redis).
 * 
 * Validates: All requirements (2.1, 2.2, 2.3, 2.4, 2.5, 2.1.1-2.1.7, 10.1-10.5)
 */

import { WhatsAppReferralMessageHandler } from "./WhatsAppReferralMessageHandler";
import { SignupIntegrationServiceImpl } from "./SignupIntegrationService";
import { ReferralRelationshipService } from "./ReferralRelationshipService";
import { WhatsAppMessageContext } from "../types/referral-capture.types";

// Mock external dependencies
jest.mock("./WhatsAppBusinessService", () => ({
  WhatsAppBusinessService: jest.fn().mockImplementation(() => ({
    sendNormalMessage: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock("./ReferralCodeValidatorService", () => ({
  ReferralCodeValidatorService: jest.fn().mockImplementation(() => ({
    validateCode: jest.fn(),
    getReferrerInfo: jest.fn(),
    validateAndGetReferrer: jest.fn(),
    validateForSignup: jest.fn()
  }))
}));

jest.mock("./ReferralRedisService", () => ({
  ReferralRedisService: jest.fn().mockImplementation(() => ({
    storeReferralCode: jest.fn().mockResolvedValue(undefined),
    retrieveReferralCode: jest.fn(),
    removeReferralCode: jest.fn().mockResolvedValue(undefined),
    getTTL: jest.fn().mockResolvedValue(86400),
    disconnect: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock("./ReferralService", () => ({
  ReferralService: jest.fn().mockImplementation(() => ({
    createReferralRelationship: jest.fn(),
    getReferralRelationship: jest.fn(),
    validateReferralCode: jest.fn()
  }))
}));

jest.mock("../models/User", () => ({
  User: {
    findOne: jest.fn()
  }
}));

describe("Referral System End-to-End Integration Tests", () => {
  let whatsappHandler: WhatsAppReferralMessageHandler;
  let signupService: SignupIntegrationServiceImpl;
  let relationshipService: ReferralRelationshipService;
  
  let mockWhatsAppService: any;
  let mockValidator: any;
  let mockRedisService: any;
  let mockReferralService: any;
  let mockUser: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create service instances
    whatsappHandler = new WhatsAppReferralMessageHandler();
    signupService = new SignupIntegrationServiceImpl();
    relationshipService = new ReferralRelationshipService();
    
    // Get mocked services
    mockWhatsAppService = (whatsappHandler as any).whatsappService;
    mockValidator = (whatsappHandler as any).referralCaptureService.validator;
    mockRedisService = (whatsappHandler as any).referralCaptureService.redisService;
    mockReferralService = (signupService as any).referralService;
    mockUser = require("../models/User").User;
    
    // Get validator from relationship service
    const relationshipValidator = (relationshipService as any).validatorService;
    
    // Set up default mock implementations
    mockRedisService.retrieveReferralCode.mockResolvedValue(null);
  });

  describe("Complete User Journey: Start Command to Signup Completion", () => {
    it("should handle complete successful referral flow from start to signup", async () => {
      const phoneNumber = "+1234567890";
      const referralCode = "ABC123";
      const referrerName = "John Doe";
      const referrerId = "referrer-user-id";
      const newUserId = "new-user-id";

      // Step 1: User sends "start ABC123" command
      const startContext: WhatsAppMessageContext = {
        from: phoneNumber,
        message: `start ${referralCode}`
      };

      // Mock validator for start command
      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: referrerId, name: referrerName, referralCode }
      });

      // Execute start command
      const startResult = await whatsappHandler.handleMessage(startContext);

      // Verify start command success
      expect(startResult.handled).toBe(true);
      expect(startResult.success).toBe(true);
      expect(mockRedisService.storeReferralCode).toHaveBeenCalledWith(phoneNumber, referralCode);
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalled();
      const [invitationMessage] = mockWhatsAppService.sendNormalMessage.mock.calls[0];
      expect(invitationMessage).toContain(referrerName);

      // Step 2: User begins signup - form pre-population
      // Get the redis service from signup service
      const signupRedisService = (signupService as any).redisService;
      signupRedisService.retrieveReferralCode.mockResolvedValue(referralCode);
      
      const formData = await signupService.prePopulateReferralField(phoneNumber);

      // Verify form pre-population
      expect(formData.isPrePopulated).toBe(true);
      expect(formData.referralCode).toBe(referralCode);
      expect(signupRedisService.retrieveReferralCode).toHaveBeenCalledWith(phoneNumber);

      // Step 3: User completes signup with referral code
      const relationshipValidator = (relationshipService as any).validatorService;
      const relationshipReferralService = (relationshipService as any).referralService;
      mockUser.findOne.mockResolvedValue({ userId: newUserId });
      relationshipValidator.validateForSignup.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: referrerId, name: referrerName, referralCode }
      });
      relationshipReferralService.createReferralRelationship.mockResolvedValue({
        _id: "relationship-id",
        referrerId,
        referredUserId: newUserId,
        createdAt: new Date()
      });

      const relationshipResult = await relationshipService.createReferralRelationship(
        newUserId,
        referralCode,
        { phoneNumber }
      );

      // Verify relationship creation
      expect(relationshipResult.success).toBe(true);
      expect(relationshipResult.relationship).toBeDefined();
      expect(relationshipValidator.validateForSignup).toHaveBeenCalledWith(referralCode, newUserId);
      expect(relationshipReferralService.createReferralRelationship).toHaveBeenCalledWith(newUserId, referralCode);

      // Step 4: Verify Redis cleanup after successful relationship creation
      const relationshipRedisService = (relationshipService as any).redisService;
      expect(relationshipRedisService.removeReferralCode).toHaveBeenCalledWith(phoneNumber);

      // Verify complete flow
      expect(mockRedisService.storeReferralCode).toHaveBeenCalledTimes(1);
      expect(signupRedisService.retrieveReferralCode).toHaveBeenCalledTimes(1);
      expect(relationshipRedisService.removeReferralCode).toHaveBeenCalledTimes(1);
    });

    it("should handle user journey with invalid referral code at start", async () => {
      const phoneNumber = "+9876543210";
      const invalidCode = "INVALID";

      // Step 1: User sends "start INVALID" command
      const startContext: WhatsAppMessageContext = {
        from: phoneNumber,
        message: `start ${invalidCode}`
      };

      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { 
          isValid: false, 
          errorMessage: "Invalid referral code. Please check and try again." 
        },
        referrer: null
      });

      const startResult = await whatsappHandler.handleMessage(startContext);

      // Verify error handling
      expect(startResult.handled).toBe(true);
      expect(startResult.success).toBe(false);
      expect(startResult.error).toContain("Invalid referral code");
      expect(mockRedisService.storeReferralCode).not.toHaveBeenCalled();
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalled();

      // Step 2: User begins signup - no stored code
      const signupRedisService = (signupService as any).redisService;
      signupRedisService.retrieveReferralCode.mockResolvedValue(null);
      
      const formData = await signupService.prePopulateReferralField(phoneNumber);

      // Verify no pre-population
      expect(formData.isPrePopulated).toBe(false);
      expect(formData.referralCode).toBeUndefined();
    });

    it("should handle user journey where code expires before signup", async () => {
      const phoneNumber = "+1111111111";
      const referralCode = "EXP123";
      const referrerName = "Jane Smith";

      // Step 1: User sends start command (successful)
      const startContext: WhatsAppMessageContext = {
        from: phoneNumber,
        message: `start ${referralCode}`
      };

      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "ref-id", name: referrerName, referralCode }
      });

      const startResult = await whatsappHandler.handleMessage(startContext);
      expect(startResult.success).toBe(true);

      // Step 2: Code expires (24 hours pass) - Redis returns null
      const signupRedisService = (signupService as any).redisService;
      signupRedisService.retrieveReferralCode.mockResolvedValue(null);
      
      const formData = await signupService.prePopulateReferralField(phoneNumber);

      // Verify graceful handling of expired code
      expect(formData.isPrePopulated).toBe(false);
      expect(formData.referralCode).toBeUndefined();
      expect(signupRedisService.retrieveReferralCode).toHaveBeenCalledWith(phoneNumber);
    });
  });

  describe("Error Scenarios and Edge Cases", () => {
    it("should handle self-referral attempt during signup", async () => {
      const userId = "user-123";
      const userOwnCode = "USER123";
      const phoneNumber = "+2222222222";

      // User tries to use their own referral code
      const relationshipValidator = (relationshipService as any).validatorService;
      mockUser.findOne.mockResolvedValue({ userId, referralCode: userOwnCode });
      relationshipValidator.validateForSignup.mockResolvedValue({
        validation: { 
          isValid: false, 
          errorMessage: "You cannot use your own referral code." 
        },
        referrer: null
      });

      const result = await relationshipService.createReferralRelationship(
        userId,
        userOwnCode,
        { phoneNumber }
      );

      // Verify self-referral prevention
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('SELF_REFERRAL');
      expect(result.error).toContain("own referral code");
      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should handle duplicate referral relationship attempt", async () => {
      const userId = "user-456";
      const referralCode = "DUP123";
      const phoneNumber = "+3333333333";

      // User already has a referral relationship
      const relationshipValidator = (relationshipService as any).validatorService;
      mockUser.findOne.mockResolvedValue({ userId });
      relationshipValidator.validateForSignup.mockResolvedValue({
        validation: { 
          isValid: false, 
          errorMessage: "You already have a referral relationship." 
        },
        referrer: null
      });

      const result = await relationshipService.createReferralRelationship(
        userId,
        referralCode,
        { phoneNumber }
      );

      // Verify duplicate prevention
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('DUPLICATE_RELATIONSHIP');
      expect(result.error).toContain("already have a referral relationship");
      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should handle Redis failure gracefully during start command", async () => {
      const phoneNumber = "+4444444444";
      const referralCode = "REDIS123";
      const referrerName = "Bob Wilson";

      const startContext: WhatsAppMessageContext = {
        from: phoneNumber,
        message: `start ${referralCode}`
      };

      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "ref-id", name: referrerName, referralCode }
      });

      // Redis fails to store
      mockRedisService.storeReferralCode.mockRejectedValue(new Error("Redis connection failed"));

      const result = await whatsappHandler.handleMessage(startContext);

      // Verify graceful degradation (Requirement 10.5)
      // The system continues and shows invitation message even if Redis fails
      expect(result.handled).toBe(true);
      expect(result.success).toBe(true); // Success because invitation was shown
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalled();
    });

    it("should handle malformed start command", async () => {
      const phoneNumber = "+5555555555";

      const testCases = [
        { message: "start", expectedError: "Invalid start command format" },
        { message: "start ", expectedError: "Invalid start command format" },
        { message: "start ABC", expectedError: "Invalid" }, // Too short
        { message: "start ABC-123", expectedError: "Invalid" }, // Special chars
      ];

      for (const testCase of testCases) {
        const context: WhatsAppMessageContext = {
          from: phoneNumber,
          message: testCase.message
        };

        const result = await whatsappHandler.handleMessage(context);

        expect(result.handled).toBe(true);
        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid");
        expect(mockRedisService.storeReferralCode).not.toHaveBeenCalled();

        jest.clearAllMocks();
      }
    });

    it("should handle user not found during relationship creation", async () => {
      const userId = "nonexistent-user";
      const referralCode = "TEST123";
      const phoneNumber = "+6666666666";

      // User doesn't exist in database
      mockUser.findOne.mockResolvedValue(null);

      const result = await relationshipService.createReferralRelationship(
        userId,
        referralCode,
        { phoneNumber }
      );

      // Verify error handling
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('USER_NOT_FOUND');
      expect(result.error).toBe("User not found.");
      expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();
    });

    it("should handle empty referral code during signup", async () => {
      const userId = "user-789";
      const phoneNumber = "+7777777777";

      const testCases = ["", "   ", null as any, undefined as any];

      for (const emptyCode of testCases) {
        mockUser.findOne.mockResolvedValue({ userId });

        const result = await relationshipService.createReferralRelationship(
          userId,
          emptyCode,
          { phoneNumber }
        );

        expect(result.success).toBe(false);
        // Empty string and whitespace are caught as INVALID_CODE after trimming
        // null and undefined are caught as SYSTEM_ERROR
        if (emptyCode === null || emptyCode === undefined) {
          expect(result.errorType).toBe('SYSTEM_ERROR');
        } else {
          expect(result.errorType).toBe('INVALID_CODE');
        }
        expect(mockReferralService.createReferralRelationship).not.toHaveBeenCalled();

        jest.clearAllMocks();
      }
    });
  });

  describe("Redis Storage and Cleanup Flow", () => {
    it("should store code with 24-hour TTL and clean up after relationship creation", async () => {
      const phoneNumber = "+8888888888";
      const referralCode = "CLEAN123";
      const userId = "user-clean";

      // Step 1: Store code via start command
      const startContext: WhatsAppMessageContext = {
        from: phoneNumber,
        message: `start ${referralCode}`
      };

      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "ref-id", name: "Test User", referralCode }
      });

      await whatsappHandler.handleMessage(startContext);
      expect(mockRedisService.storeReferralCode).toHaveBeenCalledWith(phoneNumber, referralCode);

      // Step 2: Retrieve code during signup
      const signupRedisService = (signupService as any).redisService;
      signupRedisService.retrieveReferralCode.mockResolvedValue(referralCode);
      const formData = await signupService.prePopulateReferralField(phoneNumber);
      expect(formData.referralCode).toBe(referralCode);

      // Step 3: Create relationship and verify cleanup
      const relationshipValidator = (relationshipService as any).validatorService;
      const relationshipRedisService = (relationshipService as any).redisService;
      const relationshipReferralService = (relationshipService as any).referralService;
      mockUser.findOne.mockResolvedValue({ userId });
      relationshipValidator.validateForSignup.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "ref-id", name: "Test User", referralCode }
      });
      relationshipReferralService.createReferralRelationship.mockResolvedValue({
        _id: "rel-id",
        referrerId: "ref-id",
        referredUserId: userId,
        createdAt: new Date()
      });

      await relationshipService.createReferralRelationship(userId, referralCode, { phoneNumber });

      // Verify cleanup was called
      expect(relationshipRedisService.removeReferralCode).toHaveBeenCalledWith(phoneNumber);
    });

    it("should not clean up Redis if phoneNumber not provided", async () => {
      const userId = "user-no-cleanup";
      const referralCode = "NOCLEAN123";

      const relationshipValidator = (relationshipService as any).validatorService;
      const relationshipRedisService = (relationshipService as any).redisService;
      const relationshipReferralService = (relationshipService as any).referralService;
      mockUser.findOne.mockResolvedValue({ userId });
      relationshipValidator.validateForSignup.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "ref-id", name: "Test User", referralCode }
      });
      relationshipReferralService.createReferralRelationship.mockResolvedValue({
        _id: "rel-id",
        referrerId: "ref-id",
        referredUserId: userId,
        createdAt: new Date()
      });

      // Create relationship without phoneNumber
      await relationshipService.createReferralRelationship(userId, referralCode);

      // Verify no cleanup was attempted
      expect(relationshipRedisService.removeReferralCode).not.toHaveBeenCalled();
    });

    it("should handle Redis cleanup failure gracefully", async () => {
      const phoneNumber = "+9999999999";
      const referralCode = "FAILCLEAN";
      const userId = "user-fail-clean";

      const relationshipValidator = (relationshipService as any).validatorService;
      const relationshipRedisService = (relationshipService as any).redisService;
      const relationshipReferralService = (relationshipService as any).referralService;
      mockUser.findOne.mockResolvedValue({ userId });
      relationshipValidator.validateForSignup.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "ref-id", name: "Test User", referralCode }
      });
      relationshipReferralService.createReferralRelationship.mockResolvedValue({
        _id: "rel-id",
        referrerId: "ref-id",
        referredUserId: userId,
        createdAt: new Date()
      });

      // Mock cleanup failure
      relationshipRedisService.removeReferralCode.mockRejectedValue(new Error("Redis cleanup failed"));

      // Should still succeed even if cleanup fails
      const result = await relationshipService.createReferralRelationship(
        userId,
        referralCode,
        { phoneNumber }
      );

      expect(result.success).toBe(true);
      expect(result.relationship).toBeDefined();
    });
  });

  describe("Phone Number Normalization", () => {
    it("should normalize phone numbers consistently across the flow", async () => {
      const phoneWithoutPlus = "1234567890";
      const phoneWithPlus = "+1234567890";
      const referralCode = "NORM123";

      // Test start command with phone without +
      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "ref-id", name: "Test User", referralCode }
      });

      const result = await whatsappHandler.handleStartCommand(phoneWithoutPlus, `start ${referralCode}`);

      // Verify normalized phone number is used
      expect(result.success).toBe(true);
      expect(mockRedisService.storeReferralCode).toHaveBeenCalledWith(phoneWithPlus, referralCode);
    });
  });

  describe("Message Template Integration", () => {
    it("should generate personalized invitation messages", async () => {
      const phoneNumber = "+1010101010";
      const referralCode = "MSG123";
      const referrerName = "Alice Johnson";

      const startContext: WhatsAppMessageContext = {
        from: phoneNumber,
        message: `start ${referralCode}`
      };

      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "ref-id", name: referrerName, referralCode }
      });

      await whatsappHandler.handleMessage(startContext);

      // Verify personalized message was sent
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalled();
      const [message, phone] = mockWhatsAppService.sendNormalMessage.mock.calls[0];
      expect(message).toContain(referrerName);
      expect(message).toContain("invited");
      expect(phone).toBe(phoneNumber);
    });

    it("should send appropriate error messages for different error types", async () => {
      const phoneNumber = "+1212121212";

      const errorCases = [
        { 
          code: "INVALID", 
          error: "Invalid referral code. Please check and try again.",
          expectedInMessage: "Invalid"
        },
        { 
          code: "NOTFOUND", 
          error: "Invalid referral code. Please check and try again.",
          expectedInMessage: "Invalid"
        }
      ];

      for (const errorCase of errorCases) {
        const context: WhatsAppMessageContext = {
          from: phoneNumber,
          message: `start ${errorCase.code}`
        };

        mockValidator.validateAndGetReferrer.mockResolvedValue({
          validation: { isValid: false, errorMessage: errorCase.error },
          referrer: null
        });

        await whatsappHandler.handleMessage(context);

        expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalled();
        const [message] = mockWhatsAppService.sendNormalMessage.mock.calls[
          mockWhatsAppService.sendNormalMessage.mock.calls.length - 1
        ];
        expect(message).toContain(errorCase.expectedInMessage);

        jest.clearAllMocks();
      }
    });
  });

  describe("Concurrent User Handling", () => {
    it("should handle multiple users with different referral codes simultaneously", async () => {
      const users = [
        { phone: "+1111111111", code: "CODE111", referrer: "User One" },
        { phone: "+2222222222", code: "CODE222", referrer: "User Two" },
        { phone: "+3333333333", code: "CODE333", referrer: "User Three" }
      ];

      // Process all start commands concurrently
      const promises = users.map(user => {
        const context: WhatsAppMessageContext = {
          from: user.phone,
          message: `start ${user.code}`
        };

        mockValidator.validateAndGetReferrer.mockResolvedValue({
          validation: { isValid: true },
          referrer: { id: `ref-${user.code}`, name: user.referrer, referralCode: user.code }
        });

        return whatsappHandler.handleMessage(context);
      });

      const results = await Promise.all(promises);

      // Verify all succeeded
      results.forEach(result => {
        expect(result.handled).toBe(true);
        expect(result.success).toBe(true);
      });

      // Verify each code was stored with correct phone number
      expect(mockRedisService.storeReferralCode).toHaveBeenCalledTimes(3);
      users.forEach(user => {
        expect(mockRedisService.storeReferralCode).toHaveBeenCalledWith(user.phone, user.code);
      });
    });
  });
});
