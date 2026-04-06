/**
 * Unit tests for CommandParserService
 * Tests command parsing functionality for referral code capture
 */

import { CommandParserService } from "./CommandParserService";
import { CommandParsingError, WhatsAppMessageContext } from "../types/referral-capture.types";

describe("CommandParserService", () => {
  let parser: CommandParserService;

  beforeEach(() => {
    parser = new CommandParserService();
  });

  describe("parseStartCommandWithContext", () => {
    it("should parse valid start command with WhatsApp context", () => {
      const context: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "start ABC123"
      };
      
      const result = parser.parseStartCommandWithContext(context);
      
      expect(result).toEqual({
        command: "start",
        referralCode: "ABC123",
        phoneNumber: "+1234567890"
      });
    });

    it("should normalize phone number without + prefix", () => {
      const context: WhatsAppMessageContext = {
        from: "1234567890",
        message: "start XYZ789"
      };
      
      const result = parser.parseStartCommandWithContext(context);
      
      expect(result).toEqual({
        command: "start",
        referralCode: "XYZ789",
        phoneNumber: "+1234567890"
      });
    });

    it("should handle case-insensitive commands with context", () => {
      const context: WhatsAppMessageContext = {
        from: "+2348012345678",
        message: "START mixed123"
      };
      
      const result = parser.parseStartCommandWithContext(context);
      
      expect(result).toEqual({
        command: "start",
        referralCode: "MIXED123",
        phoneNumber: "+2348012345678"
      });
    });

    it("should return null for invalid context", () => {
      expect(parser.parseStartCommandWithContext(null as any)).toBeNull();
      expect(parser.parseStartCommandWithContext({} as any)).toBeNull();
      expect(parser.parseStartCommandWithContext({ from: "+123", message: "" })).toBeNull();
      expect(parser.parseStartCommandWithContext({ from: "", message: "start ABC123" })).toBeNull();
    });

    it("should return null for non-start commands with context", () => {
      const context: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "hello world"
      };
      
      expect(parser.parseStartCommandWithContext(context)).toBeNull();
    });

    it("should throw error for invalid start command format with context", () => {
      const context: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "start"
      };
      
      expect(() => parser.parseStartCommandWithContext(context)).toThrow(CommandParsingError);
    });

    it("should handle international phone numbers", () => {
      const testCases = [
        { from: "+2348012345678", expected: "+2348012345678" }, // Nigeria
        { from: "+14155552671", expected: "+14155552671" },     // US
        { from: "+447911123456", expected: "+447911123456" },   // UK
        { from: "2348012345678", expected: "+2348012345678" },  // Nigeria without +
      ];

      testCases.forEach(({ from, expected }) => {
        const context: WhatsAppMessageContext = {
          from,
          message: "start TEST123"
        };
        
        const result = parser.parseStartCommandWithContext(context);
        expect(result?.phoneNumber).toBe(expected);
      });
    });
  });

  describe("validateMessageContext", () => {
    it("should validate correct message context", () => {
      const validContext: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "start ABC123"
      };
      
      expect(parser.validateMessageContext(validContext)).toBe(true);
    });

    it("should validate context with phone number without + prefix", () => {
      const validContext: WhatsAppMessageContext = {
        from: "1234567890",
        message: "any message"
      };
      
      expect(parser.validateMessageContext(validContext)).toBe(true);
    });

    it("should reject invalid context objects", () => {
      expect(parser.validateMessageContext(null as any)).toBe(false);
      expect(parser.validateMessageContext(undefined as any)).toBe(false);
      expect(parser.validateMessageContext({} as any)).toBe(false);
    });

    it("should reject context with missing or invalid phone number", () => {
      expect(parser.validateMessageContext({ from: "", message: "test" })).toBe(false);
      expect(parser.validateMessageContext({ from: "invalid", message: "test" })).toBe(false);
      expect(parser.validateMessageContext({ from: "123", message: "test" })).toBe(false); // Too short
      expect(parser.validateMessageContext({ message: "test" } as any)).toBe(false);
    });

    it("should reject context with missing or invalid message", () => {
      expect(parser.validateMessageContext({ from: "+1234567890", message: "" })).toBe(false);
      expect(parser.validateMessageContext({ from: "+1234567890" } as any)).toBe(false);
      expect(parser.validateMessageContext({ from: "+1234567890", message: null } as any)).toBe(false);
    });

    it("should validate various international phone number formats", () => {
      const validPhones = [
        "+1234567890",      // 10 digits
        "+12345678901",     // 11 digits
        "+123456789012345", // 15 digits (max)
        "+2348012345678",   // Nigeria
        "+447911123456",    // UK
      ];

      validPhones.forEach(phone => {
        const context: WhatsAppMessageContext = {
          from: phone,
          message: "test message"
        };
        expect(parser.validateMessageContext(context)).toBe(true);
      });
    });

    it("should reject invalid phone number formats", () => {
      const invalidPhones = [
        "+123456",           // Too short (6 digits)
        "+1234567890123456", // Too long (16 digits)
        "+0123456789",       // Starts with 0 after +
        "+abc1234567890",    // Contains letters
        "+123-456-7890",     // Contains hyphens
      ];

      invalidPhones.forEach(phone => {
        const context: WhatsAppMessageContext = {
          from: phone,
          message: "test message"
        };
        expect(parser.validateMessageContext(context)).toBe(false);
      });
    });
  });

  describe("parseStartCommand", () => {
    it("should parse valid start command with uppercase code", () => {
      const result = parser.parseStartCommand("start ABC123");
      
      expect(result).toEqual({
        command: "start",
        referralCode: "ABC123",
        phoneNumber: ""
      });
    });

    it("should parse valid start command with lowercase code", () => {
      const result = parser.parseStartCommand("start abc123");
      
      expect(result).toEqual({
        command: "start",
        referralCode: "ABC123", // Should be normalized to uppercase
        phoneNumber: ""
      });
    });

    it("should parse case-insensitive start command", () => {
      const result = parser.parseStartCommand("START xyz789");
      
      expect(result).toEqual({
        command: "start",
        referralCode: "XYZ789",
        phoneNumber: ""
      });
    });

    it("should handle mixed case start command", () => {
      const result = parser.parseStartCommand("Start MiXeD123");
      
      expect(result).toEqual({
        command: "start",
        referralCode: "MIXED123",
        phoneNumber: ""
      });
    });

    it("should return null for non-start commands", () => {
      expect(parser.parseStartCommand("hello")).toBeNull();
      expect(parser.parseStartCommand("signup")).toBeNull();
      expect(parser.parseStartCommand("help")).toBeNull();
    });

    it("should return null for empty or invalid input", () => {
      expect(parser.parseStartCommand("")).toBeNull();
      expect(parser.parseStartCommand("   ")).toBeNull();
      expect(parser.parseStartCommand(null as any)).toBeNull();
      expect(parser.parseStartCommand(undefined as any)).toBeNull();
    });

    it("should throw error for start command without code", () => {
      expect(() => parser.parseStartCommand("start")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ")).toThrow(CommandParsingError);
    });

    it("should throw error for start command with invalid code format", () => {
      expect(() => parser.parseStartCommand("start AB")).toThrow(CommandParsingError); // Too short
      expect(() => parser.parseStartCommand("start ABCDEFGHIJKLM")).toThrow(CommandParsingError); // Too long
      expect(() => parser.parseStartCommand("start ABC-123")).toThrow(CommandParsingError); // Special characters
      expect(() => parser.parseStartCommand("start ABC 123")).toThrow(CommandParsingError); // Space in code
    });

    it("should handle whitespace around command", () => {
      const result = parser.parseStartCommand("  start ABC123  ");
      
      expect(result).toEqual({
        command: "start",
        referralCode: "ABC123",
        phoneNumber: ""
      });
    });

    it("should validate referral code length boundaries", () => {
      // Valid 6-character code
      const result6 = parser.parseStartCommand("start ABC123");
      expect(result6?.referralCode).toBe("ABC123");

      // Valid 12-character code
      const result12 = parser.parseStartCommand("start ABCDEF123456");
      expect(result12?.referralCode).toBe("ABCDEF123456");

      // Invalid 5-character code
      expect(() => parser.parseStartCommand("start ABC12")).toThrow(CommandParsingError);

      // Invalid 13-character code
      expect(() => parser.parseStartCommand("start ABCDEF1234567")).toThrow(CommandParsingError);
    });
  });

  describe("validateCommandFormat", () => {
    it("should validate correct command formats", () => {
      expect(parser.validateCommandFormat("start ABC123")).toBe(true);
      expect(parser.validateCommandFormat("START xyz789")).toBe(true);
      expect(parser.validateCommandFormat("Start MiXeD123")).toBe(true);
    });

    it("should reject invalid command formats", () => {
      expect(parser.validateCommandFormat("start")).toBe(false);
      expect(parser.validateCommandFormat("start AB")).toBe(false);
      expect(parser.validateCommandFormat("start ABC-123")).toBe(false);
      expect(parser.validateCommandFormat("hello ABC123")).toBe(false);
      expect(parser.validateCommandFormat("")).toBe(false);
    });
  });

  describe("extractReferralCode", () => {
    it("should extract referral code from valid command", () => {
      expect(parser.extractReferralCode("start ABC123")).toBe("ABC123");
      expect(parser.extractReferralCode("START xyz789")).toBe("XYZ789");
    });

    it("should return null for invalid commands", () => {
      expect(parser.extractReferralCode("hello")).toBeNull();
      expect(parser.extractReferralCode("start")).toBeNull();
    });
  });

  describe("isStartCommand", () => {
    it("should identify start commands", () => {
      expect(parser.isStartCommand("start ABC123")).toBe(true);
      expect(parser.isStartCommand("START xyz")).toBe(true);
      expect(parser.isStartCommand("Start")).toBe(true);
      expect(parser.isStartCommand("  start  ")).toBe(true);
    });

    it("should reject non-start commands", () => {
      expect(parser.isStartCommand("hello")).toBe(false);
      expect(parser.isStartCommand("signup")).toBe(false);
      expect(parser.isStartCommand("")).toBe(false);
      expect(parser.isStartCommand("restart")).toBe(false);
    });
  });

  describe("getUsageInstructions", () => {
    it("should return usage instructions", () => {
      const instructions = parser.getUsageInstructions();
      expect(instructions).toContain("start [referral_code]");
      expect(instructions).toContain("6-12 characters");
    });
  });

  describe("Edge Cases - Malformed Commands", () => {
    it("should handle commands with multiple spaces", () => {
      // The current regex allows multiple spaces, so these should actually pass
      const result1 = parser.parseStartCommand("start  ABC123");
      expect(result1?.referralCode).toBe("ABC123");
      
      const result2 = parser.parseStartCommand("start   ABC123");
      expect(result2?.referralCode).toBe("ABC123");
      
      // Tab characters are also allowed by \s+ in the regex
      const result3 = parser.parseStartCommand("start\t\tABC123");
      expect(result3?.referralCode).toBe("ABC123");
    });

    it("should handle commands with trailing content", () => {
      expect(() => parser.parseStartCommand("start ABC123 extra")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC123 text")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC123\nextra")).toThrow(CommandParsingError);
    });

    it("should handle commands with newlines and tabs", () => {
      // Newlines and tabs are allowed by \s+ in the regex
      const result1 = parser.parseStartCommand("start\nABC123");
      expect(result1?.referralCode).toBe("ABC123");
      
      const result2 = parser.parseStartCommand("start\tABC123");
      expect(result2?.referralCode).toBe("ABC123");
      
      // Trailing newlines get trimmed, so this should actually pass
      const result3 = parser.parseStartCommand("start ABC123\n");
      expect(result3?.referralCode).toBe("ABC123");
    });

    it("should handle malformed start variations", () => {
      // These start with "start" but don't match the full pattern, so they throw errors
      expect(() => parser.parseStartCommand("starts ABC123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("starting ABC123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("startABC123")).toThrow(CommandParsingError);
      
      // This doesn't start with "start" so it returns null
      expect(parser.parseStartCommand("restart ABC123")).toBeNull();
    });

    it("should handle commands with unicode and emoji", () => {
      expect(() => parser.parseStartCommand("start ABC123😀")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start 😀ABC123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABCñ123")).toThrow(CommandParsingError);
    });

    it("should handle very long malformed commands", () => {
      const longCode = "A".repeat(100);
      expect(() => parser.parseStartCommand(`start ${longCode}`)).toThrow(CommandParsingError);
      
      const longMessage = "start " + "ABC123 " + "extra ".repeat(50);
      expect(() => parser.parseStartCommand(longMessage)).toThrow(CommandParsingError);
    });
  });

  describe("Edge Cases - Missing Codes", () => {
    it("should handle start command with only whitespace", () => {
      expect(() => parser.parseStartCommand("start   ")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start\t")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start\n")).toThrow(CommandParsingError);
    });

    it("should handle start command with empty string after", () => {
      expect(() => parser.parseStartCommand("start ''")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand('start ""')).toThrow(CommandParsingError);
    });

    it("should handle start command with null-like values", () => {
      // "null" is 4 characters (too short), "undefined" is 9 characters (valid length)
      expect(() => parser.parseStartCommand("start null")).toThrow(CommandParsingError);
      const undefinedResult = parser.parseStartCommand("start undefined");
      expect(undefinedResult?.referralCode).toBe("UNDEFINED");
      expect(() => parser.parseStartCommand("start 0")).toThrow(CommandParsingError);
    });

    it("should handle start command with just punctuation", () => {
      expect(() => parser.parseStartCommand("start .")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start -")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start _")).toThrow(CommandParsingError);
    });
  });

  describe("Edge Cases - Special Characters", () => {
    it("should reject codes with hyphens and underscores", () => {
      expect(() => parser.parseStartCommand("start ABC-123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC_123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start AB-C123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start AB_C123")).toThrow(CommandParsingError);
    });

    it("should reject codes with dots and commas", () => {
      expect(() => parser.parseStartCommand("start ABC.123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC,123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start A.B.C123")).toThrow(CommandParsingError);
    });

    it("should reject codes with brackets and parentheses", () => {
      expect(() => parser.parseStartCommand("start ABC[123]")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC(123)")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start {ABC123}")).toThrow(CommandParsingError);
    });

    it("should reject codes with mathematical symbols", () => {
      expect(() => parser.parseStartCommand("start ABC+123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC=123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC*123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC/123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC%123")).toThrow(CommandParsingError);
    });

    it("should reject codes with quotes and apostrophes", () => {
      expect(() => parser.parseStartCommand("start ABC'123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand('start ABC"123')).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC`123")).toThrow(CommandParsingError);
    });

    it("should reject codes with currency and special symbols", () => {
      expect(() => parser.parseStartCommand("start ABC$123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC@123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC#123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC&123")).toThrow(CommandParsingError);
    });

    it("should reject codes with control characters", () => {
      expect(() => parser.parseStartCommand("start ABC\t123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC\n123")).toThrow(CommandParsingError);
      expect(() => parser.parseStartCommand("start ABC\r123")).toThrow(CommandParsingError);
    });
  });

  describe("Edge Cases - WhatsApp Context Validation", () => {
    it("should handle malformed phone numbers in context", () => {
      const invalidPhoneContexts = [
        { from: "abc123", message: "start ABC123" },
        { from: "+", message: "start ABC123" },
        { from: "++1234567890", message: "start ABC123" },
        { from: "+123", message: "start ABC123" }, // Too short
        { from: "+12345678901234567", message: "start ABC123" }, // Too long
      ];

      invalidPhoneContexts.forEach(context => {
        expect(parser.validateMessageContext(context)).toBe(false);
        // Note: parseStartCommandWithContext doesn't validate phone format, it just normalizes
        // The validation should be done separately using validateMessageContext
      });
    });

    it("should handle edge cases in message content with context", () => {
      const context: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "start ABC-123" // Invalid code format
      };
      
      expect(() => parser.parseStartCommandWithContext(context)).toThrow(CommandParsingError);
    });

    it("should handle context with extremely long phone numbers", () => {
      const longPhone = "+1" + "2".repeat(20);
      const context: WhatsAppMessageContext = {
        from: longPhone,
        message: "start ABC123"
      };
      
      expect(parser.validateMessageContext(context)).toBe(false);
    });

    it("should handle context with phone numbers containing letters", () => {
      const contexts = [
        { from: "+123abc7890", message: "start ABC123" },
        { from: "+1234567890x123", message: "start ABC123" },
        { from: "1-800-FLOWERS", message: "start ABC123" },
      ];

      contexts.forEach(context => {
        expect(parser.validateMessageContext(context)).toBe(false);
      });
    });

    it("should properly validate context before parsing", () => {
      const validContext: WhatsAppMessageContext = {
        from: "+1234567890",
        message: "start ABC123"
      };
      
      expect(parser.validateMessageContext(validContext)).toBe(true);
      
      const result = parser.parseStartCommandWithContext(validContext);
      expect(result).toEqual({
        command: "start",
        referralCode: "ABC123",
        phoneNumber: "+1234567890"
      });
    });
  });

  describe("Edge Cases - Boundary Conditions", () => {
    it("should handle exactly 6 character codes (minimum)", () => {
      const result = parser.parseStartCommand("start ABC123");
      expect(result?.referralCode).toBe("ABC123");
    });

    it("should handle exactly 12 character codes (maximum)", () => {
      const result = parser.parseStartCommand("start ABCDEF123456");
      expect(result?.referralCode).toBe("ABCDEF123456");
    });

    it("should reject 5 character codes (below minimum)", () => {
      expect(() => parser.parseStartCommand("start ABC12")).toThrow(CommandParsingError);
    });

    it("should reject 13 character codes (above maximum)", () => {
      expect(() => parser.parseStartCommand("start ABCDEF1234567")).toThrow(CommandParsingError);
    });

    it("should handle codes with all numbers", () => {
      const result = parser.parseStartCommand("start 123456");
      expect(result?.referralCode).toBe("123456");
    });

    it("should handle codes with all letters", () => {
      const result = parser.parseStartCommand("start ABCDEF");
      expect(result?.referralCode).toBe("ABCDEF");
    });
  });

  describe("Edge Cases - Error Message Validation", () => {
    it("should provide specific error messages for different invalid formats", () => {
      try {
        parser.parseStartCommand("start");
        fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(CommandParsingError);
        expect(error.message).toContain("Invalid start command format");
      }

      // Special characters cause the regex to not match, so it gives the first error message
      try {
        parser.parseStartCommand("start ABC-123");
        fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(CommandParsingError);
        expect(error.message).toContain("Invalid start command format");
      }

      // Test a case that would trigger the referral code format error
      // This requires modifying the implementation to test this path
      // For now, we'll test the consistency of error types
    });

    it("should maintain error type consistency", () => {
      const invalidCommands = [
        "start",
        "start ABC",
        "start ABC-123",
        "start ABCDEFGHIJKLM",
      ];

      invalidCommands.forEach(command => {
        try {
          parser.parseStartCommand(command);
          fail(`Should have thrown an error for: ${command}`);
        } catch (error) {
          expect(error).toBeInstanceOf(CommandParsingError);
          expect(error.name).toBe("CommandParsingError");
        }
      });
    });
  });
});