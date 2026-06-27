/**
 * Unit tests for MessageTemplateService
 * 
 * Tests message formatting with various referrer names and error message generation.
 * Validates: Requirements 2.3, 2.4
 */

import { MessageTemplateService } from './MessageTemplateService';

describe('MessageTemplateService', () => {
  let service: MessageTemplateService;

  beforeEach(() => {
    service = new MessageTemplateService();
  });

  describe('invitationMessage', () => {
    it('should format invitation message with referrer name', () => {
      const result = service.invitationMessage('John Doe');
      
      expect(result).toContain('You have been invited to join ChainPaye by John Doe');
      expect(result).toContain('🎉 Welcome to ChainPaye!');
      expect(result).toContain('Ready to get started? Let\'s set up your account! 🚀');
    });

    it('should handle names with special characters', () => {
      const result = service.invitationMessage('John <script>alert("xss")</script> Doe');
      
      expect(result).toContain('You have been invited to join ChainPaye by John scriptalert(xss)/script Doe');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
    });

    it('should handle very long names by truncating', () => {
      const longName = 'A'.repeat(100);
      const result = service.invitationMessage(longName);
      
      expect(result).toContain('You have been invited to join ChainPaye by ' + 'A'.repeat(50));
      expect(result).not.toContain('A'.repeat(51));
    });

    it('should handle empty or null names gracefully', () => {
      const result1 = service.invitationMessage('');
      const result2 = service.invitationMessage(null as any);
      const result3 = service.invitationMessage(undefined as any);
      
      expect(result1).toContain('You have been invited to join ChainPaye by ChainPaye User');
      expect(result2).toContain('You have been invited to join ChainPaye by ChainPaye User');
      expect(result3).toContain('You have been invited to join ChainPaye by ChainPaye User');
    });

    it('should handle names with only whitespace', () => {
      const result = service.invitationMessage('   ');
      
      expect(result).toContain('You have been invited to join ChainPaye by ChainPaye User');
    });

    it('should preserve valid names with spaces', () => {
      const result = service.invitationMessage('John Smith Jr.');
      
      expect(result).toContain('You have been invited to join ChainPaye by John Smith Jr.');
    });
  });

  describe('invalidCodeMessage', () => {
    it('should return appropriate error message for invalid codes', () => {
      const result = service.invalidCodeMessage();
      
      expect(result).toContain('❌ Invalid referral code');
      expect(result).toContain('doesn\'t exist or has expired');
      expect(result).toContain('You can also sign up without a referral code');
    });

    it('should be consistent across multiple calls', () => {
      const result1 = service.invalidCodeMessage();
      const result2 = service.invalidCodeMessage();
      
      expect(result1).toBe(result2);
    });
  });

  describe('errorMessage', () => {
    it('should return generic error message for system errors', () => {
      const result = service.errorMessage();
      
      expect(result).toContain('⚠️ Something went wrong');
      expect(result).toContain('having trouble processing');
      expect(result).toContain('try again in a few moments');
    });
  });

  describe('signupPrompt', () => {
    it('should return signup encouragement message', () => {
      const result = service.signupPrompt();
      
      expect(result).toContain('✅ Referral code accepted!');
      expect(result).toContain('saved and will be applied');
      expect(result).toContain('Type "signup" to get started');
    });
  });

  describe('usageInstructions', () => {
    it('should provide clear usage instructions', () => {
      const result = service.usageInstructions();
      
      expect(result).toContain('📝 How to use a referral code');
      expect(result).toContain('start [referral_code]');
      expect(result).toContain('Example: start ABC123');
      expect(result).toContain('6-12 characters long');
    });
  });

  describe('welcomeMessage', () => {
    it('should provide welcome message with options', () => {
      const result = service.welcomeMessage();
      
      expect(result).toContain('👋 Welcome to ChainPaye!');
      expect(result).toContain('Have a referral code? Type: start [code]');
      expect(result).toContain('Ready to sign up? Type: signup');
      expect(result).toContain('Need help? Type: help');
    });
  });

  describe('formatErrorMessage', () => {
    it('should provide specific format error guidance', () => {
      const result = service.formatErrorMessage();
      
      expect(result).toContain('❌ Invalid referral code format');
      expect(result).toContain('6-12 characters long');
      expect(result).toContain('Letters and numbers only');
      expect(result).toContain('No spaces or special characters');
      expect(result).toContain('Example: ABC123 or XYZ789ABC');
    });
  });

  describe('selfReferralErrorMessage', () => {
    it('should explain self-referral prevention', () => {
      const result = service.selfReferralErrorMessage();
      
      expect(result).toContain('❌ You cannot use your own referral code');
      expect(result).toContain('meant to be shared with friends and family');
      expect(result).toContain('You\'ll earn rewards when others use your code');
    });
  });

  describe('alreadyReferredMessage', () => {
    it('should explain existing referral relationship', () => {
      const result = service.alreadyReferredMessage();
      
      expect(result).toContain('ℹ️ You already have a referral connection');
      expect(result).toContain('already linked to a referrer');
      expect(result).toContain('cannot be changed once established');
    });
  });

  describe('edge cases and security', () => {
    it('should handle non-string input types gracefully', () => {
      const result1 = service.invitationMessage(123 as any);
      const result2 = service.invitationMessage({} as any);
      const result3 = service.invitationMessage([] as any);
      
      expect(result1).toContain('ChainPaye User');
      expect(result2).toContain('ChainPaye User');
      expect(result3).toContain('ChainPaye User');
    });

    it('should sanitize potentially harmful characters', () => {
      const maliciousName = 'John<script>alert("xss")</script>&"\'Doe';
      const result = service.invitationMessage(maliciousName);
      
      // Check that harmful characters are removed from the name part
      expect(result).toContain('Johnscriptalert(xss)/scriptDoe');
      
      // Check that the original harmful characters are not in the name
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
      
      // The message template itself may contain quotes, but not from the malicious input
      const nameInMessage = result.match(/You have been invited to join ChainPaye by (.+?)\./);
      if (nameInMessage) {
        expect(nameInMessage[1]).not.toContain('&');
        expect(nameInMessage[1]).not.toContain('"');
        expect(nameInMessage[1]).not.toContain("'");
        expect(nameInMessage[1]).not.toContain('<');
        expect(nameInMessage[1]).not.toContain('>');
      }
    });

    it('should maintain message structure integrity', () => {
      const result = service.invitationMessage('Test User');
      
      // Check that all expected sections are present
      expect(result).toMatch(/🎉 Welcome to ChainPaye!/);
      expect(result).toMatch(/You have been invited to join ChainPaye by/);
      expect(result).toMatch(/ChainPaye makes cross-border payments/);
      expect(result).toMatch(/Ready to get started\? Let's set up your account! 🚀/);
    });
  });
});