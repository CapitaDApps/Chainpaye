/**
 * Integration tests for WhatsApp Referral Message Handler
 * 
 * Tests complete flow from message receipt to response with service integration.
 * These tests verify the actual integration between components while mocking external dependencies.
 * 
 * Validates: Requirements 2.1, 2.3, 2.4, 2.5
 */

import { WhatsAppReferralMessageHandler } from "./WhatsAppReferralMessageHandler";
import { 
  WhatsAppMessageContext,
  CommandParsingError,
  ReferralCodeCaptureError
} from "../types/referral-capture.types";

// Mock external dependencies (WhatsApp API, Database, and Redis)
// Keep internal service integration intact for testing the flow
jest.mock("./WhatsAppBusinessService", () => ({
  WhatsAppBusinessService: jest.fn().mockImplementation(() => ({
    sendNormalMessage: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock database operations for testing
jest.mock("./ReferralCodeValidatorService", () => ({
  ReferralCodeValidatorService: jest.fn().mockImplementation(() => ({
    validateCode: jest.fn(),
    getReferrerInfo: jest.fn(),
    validateAndGetReferrer: jest.fn()
  }))
}));

// Mock Redis operations for testing
jest.mock("./ReferralRedisService", () => ({
  ReferralRedisService: jest.fn().mockImplementation(() => ({
    storeReferralCode: jest.fn().mockResolvedValue(undefined),
    retrieveReferralCode: jest.fn().mockResolvedValue(null),
    removeReferralCode: jest.fn().mockResolvedValue(undefined),
    getTTL: jest.fn().mockResolvedValue(86400),
    disconnect: jest.fn().mockResolvedValue(undefined)
  }))
}));

describe("WhatsApp Referral Message Handler Integration Tests", () => {
  let handler: WhatsAppReferralMessageHandler;
  let mockWhatsAppService: any;
  let mockValidator: any;
  let mockRedisService: any;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create handler instance
    handler = new WhatsAppReferralMessageHandler();

    // Get the mocked services
    mockWhatsAppService = (handler as any).whatsappService;
    mockValidator = (handler as any).referralCaptureService.validator;
    mockRedisService = (handler as any).referralCaptureService.redisService;
  });

  afterEach(async () => {
    // Clean up any test state
    jest.clearAllMocks();
  });

  describe("Complete Integration Flow", () => {
    it("should handle complete successful referral code capture flow", async () => {
      const context: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "start ABC123"
      };

      // Setup validator mock for successful validation
      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "user123", name: "John Doe", referralCode: "ABC123" }
      });

      // Execute the complete flow
      const result = await handler.handleMessage(context);

      // Verify the result
      expect(result.handled).toBe(true);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify WhatsApp message was sent
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalledTimes(1);
      const [sentMessage, sentPhone] = mockWhatsAppService.sendNormalMessage.mock.calls[0];
      expect(sentPhone).toBe("+1234567890");
      expect(sentMessage).toContain("John Doe");
      expect(sentMessage).toContain("invited");

      // Verify referral code was stored in Redis
      expect(mockRedisService.storeReferralCode).toHaveBeenCalledWith("+1234567890", "ABC123");
    });

    it("should handle complete flow with invalid referral code", async () => {
      const context: WhatsAppMessageContext = {
        from: "+9876543210",
        message: "start INVALID"
      };

      // Setup validator mock for invalid code
      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { 
          isValid: false, 
          errorMessage: "Invalid referral code. Please check and try again." 
        },
        referrer: null
      });

      // Execute the complete flow
      const result = await handler.handleMessage(context);

      // Verify the result
      expect(result.handled).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid referral code. Please check and try again.");

      // Verify error message was sent
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalledTimes(1);
      const [sentMessage, sentPhone] = mockWhatsAppService.sendNormalMessage.mock.calls[0];
      expect(sentPhone).toBe("+9876543210");
      expect(sentMessage).toContain("Invalid referral code");

      // Verify no code was stored in Redis
      expect(mockRedisService.storeReferralCode).not.toHaveBeenCalled();
    });

    it("should handle malformed start command with usage instructions", async () => {
      const context: WhatsAppMessageContext = {
        from: "+1111111111",
        message: "start"
      };

      // Execute the complete flow - this should throw a CommandParsingError
      const result = await handler.handleMessage(context);

      // Verify the result - malformed commands are handled as errors
      expect(result.handled).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid start command format");

      // Verify format error message was sent
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalledTimes(1);
      const [sentMessage, sentPhone] = mockWhatsAppService.sendNormalMessage.mock.calls[0];
      expect(sentPhone).toBe("+1111111111");
      expect(sentMessage).toContain("format");

      // Verify no code was stored in Redis
      expect(mockRedisService.storeReferralCode).not.toHaveBeenCalled();
    });

    it("should not handle non-start commands", async () => {
      const context: WhatsAppMessageContext = {
        from: "+2222222222",
        message: "hello world"
      };

      // Execute the complete flow
      const result = await handler.handleMessage(context);

      // Verify the result
      expect(result.handled).toBe(false);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify no WhatsApp message was sent
      expect(mockWhatsAppService.sendNormalMessage).not.toHaveBeenCalled();

      // Verify no code was stored in Redis
      expect(mockRedisService.storeReferralCode).not.toHaveBeenCalled();
    });
  });

  describe("Redis Integration", () => {
    it("should store referral codes with proper parameters", async () => {
      const phoneNumber = "+1234567890";
      const referralCode = "TEST123";

      const context: WhatsAppMessageContext = {
        from: phoneNumber,
        message: `start ${referralCode}`
      };

      // Setup validator mock
      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "user123", name: "Test User", referralCode }
      });

      // Execute the flow
      await handler.handleMessage(context);

      // Verify Redis store was called with correct parameters
      expect(mockRedisService.storeReferralCode).toHaveBeenCalledWith(phoneNumber, referralCode);
    });

    it("should handle Redis connection errors gracefully", async () => {
      const context: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "start ABC123"
      };

      // Setup validator mock
      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "user123", name: "John Doe", referralCode: "ABC123" }
      });

      // Mock Redis to throw an error
      mockRedisService.storeReferralCode.mockRejectedValue(new Error("Redis connection failed"));

      // Execute the flow
      const result = await handler.handleMessage(context);

      // Should handle the error gracefully
      expect(result.handled).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe("System error");
    });
  });

  describe("Command Parser Integration", () => {
    it("should handle various referral code formats", async () => {
      const testCases = [
        { code: "ABC123", expected: "ABC123" },
        { code: "abc123", expected: "ABC123" }, // Should normalize to uppercase
        { code: "Test99", expected: "TEST99" },
        { code: "123456", expected: "123456" },
        { code: "ABCDEF123456", expected: "ABCDEF123456" } // 12 character max
      ];

      for (const testCase of testCases) {
        const phoneNumber = `+123456789${testCases.indexOf(testCase)}`;
        const context: WhatsAppMessageContext = {
          from: phoneNumber,
          message: `start ${testCase.code}`
        };

        // Setup validator mock
        mockValidator.validateAndGetReferrer.mockResolvedValue({
          validation: { isValid: true },
          referrer: { id: "user123", name: "Test User", referralCode: testCase.expected }
        });

        // Execute the flow
        const result = await handler.handleMessage(context);

        // Verify success
        expect(result.handled).toBe(true);
        expect(result.success).toBe(true);

        // Verify normalized code is stored
        expect(mockRedisService.storeReferralCode).toHaveBeenCalledWith(phoneNumber, testCase.expected);

        // Clean up for next iteration
        jest.clearAllMocks();
      }
    });

    it("should reject invalid referral code formats", async () => {
      const invalidCodes = [
        "AB12", // Too short (less than 6 characters)
        "ABCDEFGHIJKLM", // Too long (more than 12 characters)
        "ABC-123", // Contains special characters
        "ABC 123", // Contains spaces
        "ABC@123" // Contains special characters
      ];

      for (const invalidCode of invalidCodes) {
        const phoneNumber = `+987654321${invalidCodes.indexOf(invalidCode)}`;
        const context: WhatsAppMessageContext = {
          from: phoneNumber,
          message: `start ${invalidCode}`
        };

        // Execute the flow
        const result = await handler.handleMessage(context);

        // Should handle parsing error
        expect(result.handled).toBe(true);
        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid");

        // Verify no code was stored
        expect(mockRedisService.storeReferralCode).not.toHaveBeenCalled();
      }
    });
  });

  describe("Phone Number Normalization", () => {
    it("should handle phone numbers with and without + prefix", async () => {
      const testCases = [
        { input: "+1234567890", expected: "+1234567890" },
        { input: "1234567890", expected: "+1234567890" }
      ];

      for (const testCase of testCases) {
        // Setup validator mock
        mockValidator.validateAndGetReferrer.mockResolvedValue({
          validation: { isValid: true },
          referrer: { id: "user123", name: "Test User", referralCode: "ABC123" }
        });

        // Test using handleStartCommand method
        const result = await handler.handleStartCommand(testCase.input, "start ABC123");

        expect(result.handled).toBe(true);
        expect(result.success).toBe(true);

        // Verify code is stored with normalized phone number
        expect(mockRedisService.storeReferralCode).toHaveBeenCalledWith(testCase.expected, "ABC123");

        // Clean up
        jest.clearAllMocks();
      }
    });
  });

  describe("Error Handling Integration", () => {
    it("should handle validator service errors", async () => {
      const context: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "start ABC123"
      };

      // Setup validator to throw an error
      mockValidator.validateAndGetReferrer.mockRejectedValue(new Error("Database connection failed"));

      // Execute the flow
      const result = await handler.handleMessage(context);

      // Should handle the error gracefully
      expect(result.handled).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe("System error");

      // Verify error message was sent
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalledTimes(1);
      const [sentMessage] = mockWhatsAppService.sendNormalMessage.mock.calls[0];
      expect(sentMessage).toContain("trouble processing");
    });

    it("should handle WhatsApp service errors during success response", async () => {
      const context: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "start ABC123"
      };

      // Setup validator mock
      mockValidator.validateAndGetReferrer.mockResolvedValue({
        validation: { isValid: true },
        referrer: { id: "user123", name: "John Doe", referralCode: "ABC123" }
      });

      // Setup WhatsApp service to fail
      mockWhatsAppService.sendNormalMessage.mockRejectedValue(new Error("WhatsApp API error"));

      // Execute the flow - should throw ReferralCodeCaptureError
      await expect(handler.handleMessage(context)).rejects.toThrow(ReferralCodeCaptureError);

      // Verify Redis store was called (operation completed before WhatsApp error)
      expect(mockRedisService.storeReferralCode).toHaveBeenCalledWith("+1234567890", "ABC123");
    });
  });

  describe("Message Template Integration", () => {
    it("should generate proper invitation messages with referrer names", async () => {
      const testReferrers = [
        { name: "John Doe", code: "JOHN123" },
        { name: "Jane Smith", code: "JANE456" },
        { name: "Bob Wilson", code: "BOB789" }
      ];

      for (const referrer of testReferrers) {
        const phoneNumber = `+12345${testReferrers.indexOf(referrer)}67890`;
        const context: WhatsAppMessageContext = {
          from: phoneNumber,
          message: `start ${referrer.code}`
        };

        // Setup validator mock
        mockValidator.validateAndGetReferrer.mockResolvedValue({
          validation: { isValid: true },
          referrer: { id: "user123", name: referrer.name, referralCode: referrer.code }
        });

        // Execute the flow
        const result = await handler.handleMessage(context);

        expect(result.handled).toBe(true);
        expect(result.success).toBe(true);

        // Verify personalized message was sent
        expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalled();
        const [sentMessage] = mockWhatsAppService.sendNormalMessage.mock.calls[
          mockWhatsAppService.sendNormalMessage.mock.calls.length - 1
        ];
        expect(sentMessage).toContain(referrer.name);
        expect(sentMessage).toContain("invited");

        // Clean up
        jest.clearAllMocks();
      }
    });
  });
});