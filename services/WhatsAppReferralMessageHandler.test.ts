/**
 * Unit tests for WhatsAppReferralMessageHandler
 * 
 * Tests message handling, error scenarios, and integration with services.
 * 
 * Validates: Requirements 2.1, 2.3, 2.4, 2.5
 */

import { WhatsAppReferralMessageHandler } from "./WhatsAppReferralMessageHandler";
import { 
  WhatsAppMessageContext,
  CommandParsingError,
  ReferralCodeCaptureError
} from "../types/referral-capture.types";

// Mock the services to avoid import issues
jest.mock("./WhatsAppBusinessService", () => ({
  WhatsAppBusinessService: jest.fn().mockImplementation(() => ({
    sendNormalMessage: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock("./ReferralCaptureService", () => ({
  ReferralCaptureService: jest.fn().mockImplementation(() => ({
    processStartCommand: jest.fn()
  }))
}));

jest.mock("./CommandParserService", () => ({
  CommandParserService: jest.fn().mockImplementation(() => ({
    validateMessageContext: jest.fn(),
    isStartCommand: jest.fn(),
    parseStartCommandWithContext: jest.fn()
  }))
}));

jest.mock("./MessageTemplateService", () => ({
  MessageTemplateService: jest.fn().mockImplementation(() => ({
    usageInstructions: jest.fn(),
    formatErrorMessage: jest.fn(),
    errorMessage: jest.fn()
  }))
}));

describe("WhatsAppReferralMessageHandler", () => {
  let handler: WhatsAppReferralMessageHandler;
  let mockWhatsAppService: any;
  let mockReferralCaptureService: any;
  let mockCommandParser: any;
  let mockMessageService: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create handler instance
    handler = new WhatsAppReferralMessageHandler();

    // Get the mocked services
    mockWhatsAppService = (handler as any).whatsappService;
    mockReferralCaptureService = (handler as any).referralCaptureService;
    mockCommandParser = (handler as any).commandParser;
    mockMessageService = (handler as any).messageService;
  });

  describe("handleMessage", () => {
    const validContext: WhatsAppMessageContext = {
      from: "+1234567890",
      message: "start ABC123"
    };

    it("should handle valid start command successfully", async () => {
      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(true);
      mockCommandParser.parseStartCommandWithContext.mockReturnValue({
        command: "start",
        referralCode: "ABC123",
        phoneNumber: "+1234567890"
      });
      mockReferralCaptureService.processStartCommand.mockResolvedValue({
        success: true,
        message: "Welcome! You have been invited by John Doe.",
        referrerName: "John Doe"
      });
      mockWhatsAppService.sendNormalMessage.mockResolvedValue();

      // Execute
      const result = await handler.handleMessage(validContext);

      // Verify
      expect(result.handled).toBe(true);
      expect(result.success).toBe(true);
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalledWith(
        "Welcome! You have been invited by John Doe.",
        "+1234567890"
      );
    });

    it("should handle invalid referral code", async () => {
      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(true);
      mockCommandParser.parseStartCommandWithContext.mockReturnValue({
        command: "start",
        referralCode: "INVALID",
        phoneNumber: "+1234567890"
      });
      mockReferralCaptureService.processStartCommand.mockResolvedValue({
        success: false,
        message: "Invalid referral code. Please check and try again.",
        error: "Invalid code"
      });
      mockWhatsAppService.sendNormalMessage.mockResolvedValue();

      // Execute
      const result = await handler.handleMessage(validContext);

      // Verify
      expect(result.handled).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid code");
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalledWith(
        "Invalid referral code. Please check and try again.",
        "+1234567890"
      );
    });

    it("should not handle non-start commands", async () => {
      const nonStartContext: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "hello"
      };

      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(false);

      // Execute
      const result = await handler.handleMessage(nonStartContext);

      // Verify
      expect(result.handled).toBe(false);
      expect(result.success).toBe(true);
      expect(mockReferralCaptureService.processStartCommand).not.toHaveBeenCalled();
      expect(mockWhatsAppService.sendNormalMessage).not.toHaveBeenCalled();
    });

    it("should handle invalid message context", async () => {
      const invalidContext: WhatsAppMessageContext = {
        from: "",
        message: "start ABC123"
      };

      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(false);

      // Execute
      const result = await handler.handleMessage(invalidContext);

      // Verify
      expect(result.handled).toBe(false);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid message context");
    });

    it("should handle malformed start command", async () => {
      const malformedContext: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "start"
      };

      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(true);
      mockCommandParser.parseStartCommandWithContext.mockReturnValue(null);
      mockMessageService.usageInstructions.mockReturnValue("Usage: start [referral_code]");
      mockWhatsAppService.sendNormalMessage.mockResolvedValue();

      // Execute
      const result = await handler.handleMessage(malformedContext);

      // Verify
      expect(result.handled).toBe(true);
      expect(result.success).toBe(true);
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalledWith(
        "Usage: start [referral_code]",
        "+1234567890"
      );
    });

    it("should handle CommandParsingError", async () => {
      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(true);
      mockCommandParser.parseStartCommandWithContext.mockImplementation(() => {
        throw new CommandParsingError("Invalid command format");
      });
      mockMessageService.formatErrorMessage.mockReturnValue("Format error message");
      mockWhatsAppService.sendNormalMessage.mockResolvedValue();

      // Execute
      const result = await handler.handleMessage(validContext);

      // Verify
      expect(result.handled).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid command format");
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalledWith(
        "Format error message",
        "+1234567890"
      );
    });

    it("should handle ReferralCodeCaptureError", async () => {
      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(true);
      mockCommandParser.parseStartCommandWithContext.mockImplementation(() => {
        throw new ReferralCodeCaptureError("Capture error", "CAPTURE_ERROR");
      });
      mockWhatsAppService.sendNormalMessage.mockResolvedValue();

      // Execute
      const result = await handler.handleMessage(validContext);

      // Verify
      expect(result.handled).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Capture error");
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalledWith(
        "Capture error",
        "+1234567890"
      );
    });

    it("should handle system errors", async () => {
      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(true);
      mockCommandParser.parseStartCommandWithContext.mockImplementation(() => {
        throw new Error("System error");
      });
      mockMessageService.errorMessage.mockReturnValue("System error message");
      mockWhatsAppService.sendNormalMessage.mockResolvedValue();

      // Execute
      const result = await handler.handleMessage(validContext);

      // Verify
      expect(result.handled).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toBe("System error");
      expect(mockWhatsAppService.sendNormalMessage).toHaveBeenCalledWith(
        "System error message",
        "+1234567890"
      );
    });
  });

  describe("handleStartCommand", () => {
    it("should handle start command with phone and message", async () => {
      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(true);
      mockCommandParser.parseStartCommandWithContext.mockReturnValue({
        command: "start",
        referralCode: "ABC123",
        phoneNumber: "+1234567890"
      });
      mockReferralCaptureService.processStartCommand.mockResolvedValue({
        success: true,
        message: "Success message"
      });
      mockWhatsAppService.sendNormalMessage.mockResolvedValue();

      // Execute
      const result = await handler.handleStartCommand("+1234567890", "start ABC123");

      // Verify
      expect(result.handled).toBe(true);
      expect(result.success).toBe(true);
    });

    it("should normalize phone number without + prefix", async () => {
      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(true);
      mockCommandParser.parseStartCommandWithContext.mockReturnValue({
        command: "start",
        referralCode: "ABC123",
        phoneNumber: "+1234567890"
      });
      mockReferralCaptureService.processStartCommand.mockResolvedValue({
        success: true,
        message: "Success message"
      });
      mockWhatsAppService.sendNormalMessage.mockResolvedValue();

      // Execute
      const result = await handler.handleStartCommand("1234567890", "start ABC123");

      // Verify
      expect(result.handled).toBe(true);
      expect(result.success).toBe(true);
      expect(mockCommandParser.validateMessageContext).toHaveBeenCalledWith({
        from: "+1234567890",
        message: "start ABC123"
      });
    });
  });

  describe("shouldHandle", () => {
    it("should return true for start commands", () => {
      mockCommandParser.isStartCommand.mockReturnValue(true);
      
      const result = handler.shouldHandle("start ABC123");
      
      expect(result).toBe(true);
      expect(mockCommandParser.isStartCommand).toHaveBeenCalledWith("start ABC123");
    });

    it("should return false for non-start commands", () => {
      mockCommandParser.isStartCommand.mockReturnValue(false);
      
      const result = handler.shouldHandle("hello");
      
      expect(result).toBe(false);
      expect(mockCommandParser.isStartCommand).toHaveBeenCalledWith("hello");
    });
  });

  describe("getHandlerInfo", () => {
    it("should return handler information", () => {
      const info = handler.getHandlerInfo();
      
      expect(info).toEqual({
        name: "WhatsAppReferralMessageHandler",
        version: "1.0.0",
        supportedCommands: ["start [referral_code]"]
      });
    });
  });

  describe("error handling in message sending", () => {
    it("should handle WhatsApp service errors", async () => {
      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(true);
      mockCommandParser.parseStartCommandWithContext.mockReturnValue({
        command: "start",
        referralCode: "ABC123",
        phoneNumber: "+1234567890"
      });
      mockReferralCaptureService.processStartCommand.mockResolvedValue({
        success: true,
        message: "Success message"
      });
      mockWhatsAppService.sendNormalMessage.mockRejectedValue(new Error("WhatsApp API error"));

      // Execute and verify it throws
      await expect(handler.handleMessage({
        from: "+1234567890",
        message: "start ABC123"
      })).rejects.toThrow(ReferralCodeCaptureError);
    });

    it("should not throw on system error response failure", async () => {
      // Setup mocks
      mockCommandParser.validateMessageContext.mockReturnValue(true);
      mockCommandParser.isStartCommand.mockReturnValue(true);
      mockCommandParser.parseStartCommandWithContext.mockImplementation(() => {
        throw new Error("System error");
      });
      mockMessageService.errorMessage.mockReturnValue("System error message");
      mockWhatsAppService.sendNormalMessage.mockRejectedValue(new Error("WhatsApp API error"));

      // Execute - should not throw
      const result = await handler.handleMessage({
        from: "+1234567890",
        message: "start ABC123"
      });

      // Verify
      expect(result.handled).toBe(true);
      expect(result.success).toBe(false);
    });
  });
});