/**
 * Property-based tests for MessageTemplateService
 * 
 * **Property 3: Personalized Message Generation**
 * **Validates: Requirements 2.3**
 */

import fc from 'fast-check';
import { MessageTemplateService } from './MessageTemplateService';

describe('MessageTemplateService Property Tests', () => {
  let service: MessageTemplateService;

  beforeEach(() => {
    service = new MessageTemplateService();
  });

  describe('Property 3: Personalized Message Generation', () => {
    it('should always generate valid invitation messages for any referrer name', () => {
      fc.assert(
        fc.property(
          // Generate various types of strings including edge cases
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }), // Normal strings
            fc.string({ minLength: 0, maxLength: 0 }),   // Empty strings
            fc.constantFrom('', '   ', null, undefined), // Edge cases
            fc.string().map(s => s + '<script>alert("xss")</script>'), // XSS attempts
            fc.string().map(s => s + '&"\'<>'), // Special characters
            fc.string({ minLength: 100, maxLength: 200 }) // Very long strings
          ),
          (referrerName: any) => {
            const result = service.invitationMessage(referrerName);
            
            // Property: Result should always be a non-empty string
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
            
            // Property: Result should always contain the core invitation structure
            expect(result).toContain('Welcome to ChainPaye');
            expect(result).toContain('You have been invited to join ChainPaye by');
            expect(result).toContain('Ready to get started');
            
            // Property: Result should never contain harmful script tags
            expect(result).not.toContain('<script>');
            expect(result).not.toContain('</script>');
            
            // Property: If input is valid string, referrer name should appear in message
            if (referrerName && typeof referrerName === 'string' && referrerName.trim()) {
              const sanitizedName = referrerName.trim().replace(/[<>"'&]/g, '').substring(0, 50);
              if (sanitizedName) {
                expect(result).toContain(sanitizedName);
              } else {
                expect(result).toContain('ChainPaye User');
              }
            } else {
              // Property: Invalid inputs should default to "ChainPaye User"
              expect(result).toContain('ChainPaye User');
            }
            
            // Property: Message should always be well-formed (no undefined/null in template)
            expect(result).not.toContain('undefined');
            expect(result).not.toContain('null');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always generate consistent error messages', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }), // Number of times to call
          (numCalls: number) => {
            const results = [];
            for (let i = 0; i < numCalls; i++) {
              results.push(service.invalidCodeMessage());
              results.push(service.errorMessage());
              results.push(service.signupPrompt());
            }
            
            // Property: All calls to the same method should return identical results
            const invalidMessages = results.filter((_, index) => index % 3 === 0);
            const errorMessages = results.filter((_, index) => index % 3 === 1);
            const signupMessages = results.filter((_, index) => index % 3 === 2);
            
            expect(new Set(invalidMessages).size).toBe(1);
            expect(new Set(errorMessages).size).toBe(1);
            expect(new Set(signupMessages).size).toBe(1);
            
            // Property: Messages should always be non-empty strings
            results.forEach(result => {
              expect(typeof result).toBe('string');
              expect(result.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle name sanitization consistently', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (inputName: string) => {
            const result = service.invitationMessage(inputName);
            
            // Property: Sanitized names should never contain dangerous characters
            const nameMatch = result.match(/You have been invited to join ChainPaye by (.+?)\./);
            if (nameMatch) {
              const extractedName = nameMatch[1];
              
              // Property: Extracted name should not contain harmful characters
              expect(extractedName).not.toContain('<');
              expect(extractedName).not.toContain('>');
              expect(extractedName).not.toContain('"');
              expect(extractedName).not.toContain("'");
              expect(extractedName).not.toContain('&');
              
              // Property: Extracted name should not exceed 50 characters
              expect(extractedName.length).toBeLessThanOrEqual(50);
              
              // Property: Name should be properly sanitized
              const trimmedInput = inputName.trim();
              const cleanInput = trimmedInput.replace(/[<>"'&]/g, '');
              const expectedName = cleanInput.substring(0, 50);
              
              if (expectedName.length > 0) {
                // The extracted name should match the expected name, but the regex stops at first period
                // So if the expected name contains a period, the extracted name will be truncated
                const periodIndex = expectedName.indexOf('.');
                const expectedExtracted = periodIndex >= 0 ? expectedName.substring(0, periodIndex) : expectedName;
                
                if (expectedExtracted.length > 0) {
                  expect(extractedName).toBe(expectedExtracted);
                } else {
                  expect(extractedName).toBe('ChainPaye User');
                }
              } else {
                expect(extractedName).toBe('ChainPaye User');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain message structure integrity for all inputs', () => {
      fc.assert(
        fc.property(
          fc.anything(), // Test with any possible input
          (input: any) => {
            const result = service.invitationMessage(input);
            
            // Property: Message should always have the expected structure
            const lines = result.split('\n').filter(line => line.trim());
            
            // Should have multiple lines (welcome, invitation, description, call-to-action)
            expect(lines.length).toBeGreaterThanOrEqual(3);
            
            // Should start with welcome
            expect(lines[0]).toContain('Welcome to ChainPaye');
            
            // Should contain invitation line
            const hasInvitationLine = lines.some(line => 
              line.includes('You have been invited to join ChainPaye by')
            );
            expect(hasInvitationLine).toBe(true);
            
            // Should end with call-to-action
            const lastLine = lines[lines.length - 1];
            expect(lastLine).toContain('Ready to get started');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});