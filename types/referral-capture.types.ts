/**
 * TypeScript interfaces for referral code capture flow
 * These interfaces define the data models and service contracts for the referral system
 * 
 * Validates: Requirements 2.2, 10.1, 10.2
 */

// WhatsApp message context interface
export interface WhatsAppMessageContext {
  from: string;        // Phone number of the sender
  message: string;     // Message text content
  messageId?: string;  // Optional message ID for tracking
}

// Command parsing interfaces
export interface CommandParser {
  parseStartCommand(message: string): ParsedCommand | null;
  parseStartCommandWithContext(context: WhatsAppMessageContext): ParsedCommand | null;
  validateCommandFormat(command: string): boolean;
}

export interface ParsedCommand {
  command: 'start';
  referralCode: string;
  phoneNumber: string;
}

// Referral code validation interfaces
export interface ReferralCodeValidator {
  validateCode(code: string): Promise<ValidationResult>;
  getReferrerInfo(code: string): Promise<ReferrerInfo | null>;
}

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
  referrerId?: string;
}

export interface ReferrerInfo {
  id: string;
  name: string;
  referralCode: string;
}

// Redis storage interfaces
export interface RedisStorageService {
  storeReferralCode(phoneNumber: string, referralCode: string): Promise<void>;
  retrieveReferralCode(phoneNumber: string): Promise<string | null>;
  removeReferralCode(phoneNumber: string): Promise<void>;
  setExpiration(key: string, ttlSeconds: number): Promise<void>;
}

// Signup integration interfaces
export interface SignupIntegrationService {
  getStoredReferralCode(phoneNumber: string): Promise<string | null>;
  prePopulateReferralField(phoneNumber: string): Promise<SignupFormData>;
  processReferralOnSignup(userId: string, referralCode: string): Promise<void>;
}

export interface SignupFormData {
  referralCode?: string;
  isPrePopulated: boolean;
}

// Message template interfaces
export interface MessageTemplates {
  invitationMessage: (referrerName: string) => string;
  invalidCodeMessage: () => string;
  errorMessage: () => string;
  signupPrompt: () => string;
  usageInstructions: () => string;
  welcomeMessage: () => string;
  formatErrorMessage: () => string;
  selfReferralErrorMessage: () => string;
  alreadyReferredMessage: () => string;
}

// Redis storage schema
export interface TempReferralStorage {
  key: string;        // "referral:temp:{phoneNumber}"
  value: string;      // referral code
  ttl: number;        // 86400 (seconds)
  createdAt: Date;
}

// Error types for referral code capture
export class ReferralCodeCaptureError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "ReferralCodeCaptureError";
  }
}

export class RedisOperationError extends Error {
  constructor(message: string, public operation: string) {
    super(message);
    this.name = "RedisOperationError";
  }
}

export class CommandParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandParsingError";
  }
}