/**
 * SMS Service for sending OTP and notifications
 * Supports multiple SMS providers: Twilio, AWS SNS, Termii
 */

import axios from "axios";
import { logger } from "../utils/logger";

export interface SmsProvider {
  sendSms(to: string, message: string): Promise<boolean>;
  name: string;
}

/**
 * Twilio SMS Provider
 * Popular, reliable, works globally
 */
class TwilioProvider implements SmsProvider {
  name = "Twilio";
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || "";
    this.authToken = process.env.TWILIO_AUTH_TOKEN || "";
    this.fromNumber = process.env.TWILIO_FROM_NUMBER || "";
  }

  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      
      const response = await axios.post(
        url,
        new URLSearchParams({
          To: to,
          From: this.fromNumber,
          Body: message,
        }),
        {
          auth: {
            username: this.accountSid,
            password: this.authToken,
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      logger.info(`Twilio SMS sent successfully to ${to}`, { sid: response.data.sid });
      return true;
    } catch (error: any) {
      logger.error(`Twilio SMS failed for ${to}:`, error.response?.data || error.message);
      return false;
    }
  }
}

/**
 * AWS SNS SMS Provider
 * Good for AWS-integrated applications
 */
class AwsSnsProvider implements SmsProvider {
  name = "AWS SNS";

  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      // Note: You'll need to install and configure AWS SDK
      // npm install @aws-sdk/client-sns
      
      const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
      
      const snsClient = new SNSClient({
        region: process.env.AWS_REGION || "us-east-1",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
        },
      });

      const params = {
        Message: message,
        PhoneNumber: to,
        MessageAttributes: {
          "AWS.SNS.SMS.SMSType": {
            DataType: "String",
            StringValue: "Transactional",
          },
        },
      };

      const command = new PublishCommand(params);
      const response = await snsClient.send(command);

      logger.info(`AWS SNS SMS sent successfully to ${to}`, { messageId: response.MessageId });
      return true;
    } catch (error: any) {
      logger.error(`AWS SNS SMS failed for ${to}:`, error.message);
      return false;
    }
  }
}

/**
 * Termii SMS Provider
 * Popular in Nigeria and Africa
 */
class TermiiProvider implements SmsProvider {
  name = "Termii";
  private apiKey: string;
  private senderId: string;

  constructor() {
    this.apiKey = process.env.TERMII_API_KEY || "";
    this.senderId = process.env.TERMII_SENDER_ID || "ChainPaye";
  }

  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      const url = "https://api.ng.termii.com/api/sms/send";
      
      const response = await axios.post(url, {
        to: to.replace("+", ""),
        from: this.senderId,
        sms: message,
        type: "plain",
        api_key: this.apiKey,
        channel: "generic",
      });

      if (response.data.message === "Successfully Sent") {
        logger.info(`Termii SMS sent successfully to ${to}`, { messageId: response.data.message_id });
        return true;
      } else {
        logger.error(`Termii SMS failed for ${to}:`, response.data);
        return false;
      }
    } catch (error: any) {
      logger.error(`Termii SMS failed for ${to}:`, error.response?.data || error.message);
      return false;
    }
  }
}

/**
 * Generic SMS Provider (for testing)
 * Logs messages instead of sending them
 */
class MockSmsProvider implements SmsProvider {
  name = "Mock SMS";

  async sendSms(to: string, message: string): Promise<boolean> {
    logger.info(`[MOCK SMS] To: ${to}, Message: ${message}`);
    console.log(`📱 [MOCK SMS] To: ${to}`);
    console.log(`📝 Message: ${message}`);
    return true;
  }
}

/**
 * Main SMS Service Class
 */
export class SmsService {
  private provider: SmsProvider;

  constructor() {
    this.provider = this.initializeProvider();
  }

  private initializeProvider(): SmsProvider {
    const smsProvider = process.env.SMS_PROVIDER?.toLowerCase() || "mock";

    switch (smsProvider) {
      case "twilio":
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
          return new TwilioProvider();
        }
        logger.warn("Twilio credentials not found, falling back to Mock SMS");
        return new MockSmsProvider();

      case "aws":
      case "sns":
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
          return new AwsSnsProvider();
        }
        logger.warn("AWS credentials not found, falling back to Mock SMS");
        return new MockSmsProvider();

      case "termii":
        if (process.env.TERMII_API_KEY) {
          return new TermiiProvider();
        }
        logger.warn("Termii API key not found, falling back to Mock SMS");
        return new MockSmsProvider();

      case "mock":
      default:
        return new MockSmsProvider();
    }
  }

  /**
   * Send SMS message
   */
  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      // Validate phone number format
      if (!this.isValidPhoneNumber(to)) {
        logger.error(`Invalid phone number format: ${to}`);
        return false;
      }

      logger.info(`Sending SMS via ${this.provider.name} to ${to}`);
      return await this.provider.sendSms(to, message);
    } catch (error: any) {
      logger.error(`SMS sending failed:`, error.message);
      return false;
    }
  }

  /**
   * Send OTP SMS with standardized format
   */
  async sendOtp(to: string, otp: string, expiryMinutes: number = 10): Promise<boolean> {
    const message = `🔐 ChainPaye Security Code: ${otp}

This code expires in ${expiryMinutes} minutes. Do not share this code with anyone.

If you didn't request this, please ignore this message.`;

    return await this.sendSms(to, message);
  }

  /**
   * Send PIN reset confirmation SMS
   */
  async sendPinResetConfirmation(to: string): Promise<boolean> {
    const message = `✅ ChainPaye PIN Reset Successful

Your transaction PIN has been successfully updated. You can now use your new PIN for all transactions.

For security:
• Keep your PIN confidential
• Don't share it with anyone
• Contact support if you didn't make this change`;

    return await this.sendSms(to, message);
  }

  /**
   * Basic phone number validation
   */
  private isValidPhoneNumber(phoneNumber: string): boolean {
    // Remove all non-digit characters except +
    const cleaned = phoneNumber.replace(/[^\d+]/g, "");
    
    // Should start with + and have 10-15 digits
    const phoneRegex = /^\+\d{10,15}$/;
    return phoneRegex.test(cleaned);
  }

  /**
   * Get current provider name
   */
  getProviderName(): string {
    return this.provider.name;
  }
}

// Export singleton instance
export const smsService = new SmsService();