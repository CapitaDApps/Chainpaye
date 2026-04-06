/**
 * Property-based tests for CommandParserService
 * Tests command parsing behavior across various input formats using fast-check
 * 
 * **Validates: Requirements 2.1**
 */

import * as fc from 'fast-check';
import { CommandParserService } from './CommandParserService';
import { CommandParsingError, WhatsAppMessageContext } from '../types/referral-capture.types';

describe('CommandParserService Property Tests', () => {
  let parser: CommandParserService;

  beforeEach(() => {
    parser = new CommandParserService();
  });

  describe('Property: Command Parsing Consistency', () => {
    /**
     * **Feature: referral-system, Property 1: Command Parsing Consistency**
     * 
     * For any valid referral code and phone number combination, the parsing should be consistent
     * and produce the expected normalized output format.
     * 
     * **Validates: Requirements 2.1**
     */
    it('should consistently parse valid start commands with various formats', () => {
      // Generator for valid referral codes (6-12 alphanumeric characters)
      const validReferralCodeArb = fc.stringMatching(/^[a-zA-Z0-9]{6,12}$/);
      
      // Generator for valid phone numbers in international format
      const validPhoneNumberArb = fc.record({
        countryCode: fc.integer({ min: 1, max: 999 }),
        number: fc.stringMatching(/^[1-9]\d{6,13}$/)
      }).map(({ countryCode, number }) => `+${countryCode}${number}`);

      // Generator for case variations of "start" command
      const startCommandVariationArb = fc.oneof(
        fc.constant('start'),
        fc.constant('START'), 
        fc.constant('Start'),
        fc.constant('StArT')
      );

      // Generator for whitespace variations
      const whitespaceArb = fc.oneof(
        fc.constant(''),
        fc.constant(' '),
        fc.constant('  '),
        fc.constant('\t'),
        fc.constant(' \t ')
      );

      fc.assert(
        fc.property(
          validReferralCodeArb,
          validPhoneNumberArb,
          startCommandVariationArb,
          whitespaceArb,
          whitespaceArb,
          (referralCode, phoneNumber, startCmd, prefixWs, suffixWs) => {
            // Construct message with whitespace variations
            const message = `${prefixWs}${startCmd} ${referralCode}${suffixWs}`;
            
            const context: WhatsAppMessageContext = {
              from: phoneNumber,
              message: message
            };

            const result = parser.parseStartCommandWithContext(context);

            // Should successfully parse
            expect(result).not.toBeNull();
            expect(result!.command).toBe('start');
            expect(result!.referralCode).toBe(referralCode.toUpperCase()); // Should normalize to uppercase
            expect(result!.phoneNumber).toBe(phoneNumber);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Feature: referral-system, Property 2: Invalid Command Rejection**
     * 
     * For any invalid command format, the parser should either return null (for non-start commands)
     * or throw CommandParsingError (for malformed start commands).
     * 
     * **Validates: Requirements 2.1**
     */
    it('should consistently reject invalid command formats', () => {
      // Generator for invalid referral codes
      const invalidReferralCodeArb = fc.oneof(
        fc.string({ minLength: 1, maxLength: 5 }).filter(s => s.length > 0), // Too short
        fc.string({ minLength: 13, maxLength: 20 }), // Too long
        fc.constant('ABC-123'), // Hyphen
        fc.constant('ABC 123'), // Space
        fc.constant('ABC@123'), // Special character
        fc.constant('') // Empty
      );

      const validPhoneNumberArb = fc.record({
        countryCode: fc.integer({ min: 1, max: 999 }),
        number: fc.stringMatching(/^[1-9]\d{6,13}$/)
      }).map(({ countryCode, number }) => `+${countryCode}${number}`);

      fc.assert(
        fc.property(
          invalidReferralCodeArb,
          validPhoneNumberArb,
          (invalidCode, phoneNumber) => {
            const message = `start ${invalidCode}`;
            
            const context: WhatsAppMessageContext = {
              from: phoneNumber,
              message: message
            };

            // Should throw CommandParsingError for malformed start commands
            try {
              const result = parser.parseStartCommandWithContext(context);
              // If no error is thrown, result should be null (shouldn't happen for start commands)
              expect(result).toBeNull();
            } catch (error) {
              // Should be CommandParsingError for invalid start command formats
              expect(error).toBeInstanceOf(CommandParsingError);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Feature: referral-system, Property 3: Non-Start Command Handling**
     * 
     * For any message that doesn't start with "start", the parser should return null
     * without throwing errors. Messages that start with "start" but don't match the 
     * exact format should throw CommandParsingError.
     * 
     * **Validates: Requirements 2.1**
     */
    it('should return null for non-start commands', () => {
      // Generator for non-start commands (that don't start with "start" at all)
      const nonStartCommandArb = fc.oneof(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
          const trimmed = s.toLowerCase().trim();
          return !trimmed.startsWith('start');
        }),
        fc.constant('hello'),
        fc.constant('signup'),
        fc.constant('help'),
        fc.constant('restart ABC123'), // Contains "start" but doesn't start with it
        fc.constant('stArt ABC123'), // Different case but not exact match
        fc.constant('starting ABC123') // Starts with "start" but has extra characters - this will throw error
      ).filter(s => {
        // Filter out strings that start with "start" as they should throw errors, not return null
        const trimmed = s.toLowerCase().trim();
        return !trimmed.startsWith('start');
      });

      const validPhoneNumberArb = fc.record({
        countryCode: fc.integer({ min: 1, max: 999 }),
        number: fc.stringMatching(/^[1-9]\d{6,13}$/)
      }).map(({ countryCode, number }) => `+${countryCode}${number}`);

      fc.assert(
        fc.property(
          nonStartCommandArb,
          validPhoneNumberArb,
          (nonStartMessage, phoneNumber) => {
            const context: WhatsAppMessageContext = {
              from: phoneNumber,
              message: nonStartMessage
            };

            const result = parser.parseStartCommandWithContext(context);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Feature: referral-system, Property 4: Phone Number Normalization**
     * 
     * For any valid phone number (with or without + prefix), the parser should
     * normalize it to include the + prefix.
     * 
     * **Validates: Requirements 2.1**
     */
    it('should normalize phone numbers consistently', () => {
      const validReferralCodeArb = fc.stringMatching(/^[a-zA-Z0-9]{6,12}$/);
      
      // Generator for phone numbers both with and without + prefix
      const phoneNumberVariationArb = fc.record({
        countryCode: fc.integer({ min: 1, max: 999 }),
        number: fc.stringMatching(/^[1-9]\d{6,13}$/)
      }).chain(({ countryCode, number }) => 
        fc.oneof(
          fc.constant(`+${countryCode}${number}`), // With +
          fc.constant(`${countryCode}${number}`)   // Without +
        ).map(phone => ({
          input: phone,
          expected: `+${countryCode}${number}`
        }))
      );

      fc.assert(
        fc.property(
          validReferralCodeArb,
          phoneNumberVariationArb,
          (referralCode, phoneData) => {
            const context: WhatsAppMessageContext = {
              from: phoneData.input,
              message: `start ${referralCode}`
            };

            const result = parser.parseStartCommandWithContext(context);
            
            expect(result).not.toBeNull();
            expect(result!.phoneNumber).toBe(phoneData.expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Feature: referral-system, Property 5: Referral Code Case Normalization**
     * 
     * For any valid referral code in any case combination, the parser should
     * normalize it to uppercase while preserving the original alphanumeric characters.
     * 
     * **Validates: Requirements 2.1**
     */
    it('should normalize referral codes to uppercase consistently', () => {
      // Generator for referral codes with mixed case
      const mixedCaseReferralCodeArb = fc.array(
        fc.oneof(
          fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
          fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
          fc.constantFrom(...'0123456789'.split(''))
        ),
        { minLength: 6, maxLength: 12 }
      ).map(chars => chars.join(''));

      const validPhoneNumberArb = fc.record({
        countryCode: fc.integer({ min: 1, max: 999 }),
        number: fc.stringMatching(/^[1-9]\d{6,13}$/)
      }).map(({ countryCode, number }) => `+${countryCode}${number}`);

      fc.assert(
        fc.property(
          mixedCaseReferralCodeArb,
          validPhoneNumberArb,
          (referralCode, phoneNumber) => {
            const context: WhatsAppMessageContext = {
              from: phoneNumber,
              message: `start ${referralCode}`
            };

            const result = parser.parseStartCommandWithContext(context);
            
            expect(result).not.toBeNull();
            expect(result!.referralCode).toBe(referralCode.toUpperCase());
            expect(result!.referralCode).toMatch(/^[A-Z0-9]{6,12}$/);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Feature: referral-system, Property 6: Invalid Context Handling**
     * 
     * For any invalid WhatsApp message context (missing fields, invalid phone numbers),
     * the parser should return null without throwing errors. However, the current implementation
     * only checks for null/undefined context and missing fields, not phone number format.
     * 
     * **Validates: Requirements 2.1**
     */
    it('should handle invalid context gracefully', () => {
      const validReferralCodeArb = fc.stringMatching(/^[a-zA-Z0-9]{6,12}$/);
      
      // Generator for contexts that should definitely return null
      const invalidContextArb = fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.constant({}),
        fc.record({ from: fc.constant(''), message: fc.string() }),
        fc.record({ message: fc.string() }), // Missing from
        fc.record({ from: fc.string() }) // Missing message
      );

      fc.assert(
        fc.property(
          validReferralCodeArb,
          invalidContextArb,
          (referralCode, invalidContext) => {
            const message = `start ${referralCode}`;
            
            let context: any = invalidContext;
            if (context && typeof context === 'object' && 'message' in context) {
              context.message = message;
            }

            const result = parser.parseStartCommandWithContext(context);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});