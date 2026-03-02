/**
 * WhatsAppReferralMessageHandler
 * 
 * Handles WhatsApp messages for referral code capture flow.
 * Integrates command parser, validation, Redis storage, and response sending.
 * 
 * Validates: Requirements 2.1, 2.3, 2.4, 2.5
 */

import { WhatsAppBusinessService } from "./WhatsAppBusinessService";
import { ReferralCaptureService } from "./ReferralCaptureService";
import { CommandParserService } from "./CommandParserService";
import { MessageTemplateService } from "./MessageTemplateService";
import { 
  WhatsAppMessageContext,
  CommandParsingError,
  ReferralCodeCaptureError
} from "../types/referral-capture.types";
import { logger } from "../utils/logger";

export interface WhatsAppMessageHandlerResult {
  handled: boolean;
  success: boolean;
  error?: string;
}

export class WhatsAppReferralMessageHandler {
  private whatsappService: WhatsAppBusinessService;
  private referralCaptureService: ReferralCaptureService;
  private commandParser: CommandParserService;
  private messageService: MessageTemplateService;

  constructor() {
    this.whatsappService = new WhatsAppBusinessService();
    this.referralCaptureService = new ReferralCaptureService();
    this.commandParser = new CommandParserService();
    this.messageService = new MessageTemplateService();
  }

  /**
   * Handle incoming WhatsApp message for referral code capture
   * 
   * Processes "start [referral_code]" commands and sends appropriate responses.
   * Returns whether the message was handled by this handler.
   * 
   * @param context WhatsApp message context with phone number and message text
   * @returns Result indicating if message was handled and success status
   * 
   * Validates: Requirements 2.1, 2.3, 2.4, 2.5
   */
  async handleMessage(context: WhatsAppMessageContext): Promise<WhatsAppMessageHandlerResult> {
    try {
      // Validate message context
      if (!this.commandParser.validateMessageContext(context)) {
        logger.warn("Invalid message context received", { context });
        return {
          handled: false,
          success: false,
          error: "Invalid message context"
        };
      }

      // Check if this is a start command
      if (!this.commandParser.isStartCommand(context.message)) {
        return {
          handled: false,
          success: true
        };
      }

      logger.info("Processing start command", { 
        from: context.from, 
        message: context.message 
      });

      // Parse the command with context
      const parsedCommand = this.commandParser.parseStartCommandWithContext(context);
      
      if (!parsedCommand) {
        // It's a start command but malformed - send usage instructions
        logger.warn("Malformed start command", { context });
        await this.sendUsageInstructions(context.from);
        return {
          handled: true,
          success: true
        };
      }

      // Process the referral code capture
      const result = await this.referralCaptureService.processStartCommand(
        context.message,
        parsedCommand.phoneNumber
      );

      // Send appropriate response based on result
      if (result.success) {
        logger.info("Referral code captured successfully", {
          phoneNumber: parsedCommand.phoneNumber,
          referrerName: result.referrerName
        });
        await this.sendSuccessResponse(context.from, result.message);
      } else {
        logger.warn("Referral code capture failed", {
          phoneNumber: parsedCommand.phoneNumber,
          error: result.error
        });
        await this.sendErrorResponse(context.from, result.message);
      }

      return {
        handled: true,
        success: result.success,
        error: result.error
      };

    } catch (error) {
      logger.error("Error handling WhatsApp referral message", { 
        error: error instanceof Error ? error.message : String(error),
        context,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Send appropriate error response based on error type
      if (error instanceof CommandParsingError) {
        await this.sendFormatErrorResponse(context.from);
      } else if (error instanceof ReferralCodeCaptureError) {
        await this.sendErrorResponse(context.from, error.message);
      } else {
        await this.sendSystemErrorResponse(context.from);
      }

      return {
        handled: true,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Handle start command with phone number and message text
   * 
   * Convenience method for handling messages when you have separate phone and message.
   * 
   * @param phoneNumber The user's phone number
   * @param message The message text
   * @returns Result indicating if message was handled and success status
   */
  async handleStartCommand(phoneNumber: string, message: string): Promise<WhatsAppMessageHandlerResult> {
    // Normalize phone number to include + prefix if missing
    const normalizedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    
    const context: WhatsAppMessageContext = {
      from: normalizedPhone,
      message: message
    };

    return this.handleMessage(context);
  }

  /**
   * Check if a message should be handled by this handler
   * 
   * Quick check to determine if a message is a start command
   * without processing it.
   * 
   * @param message The message text to check
   * @returns True if this handler should process the message
   */
  shouldHandle(message: string): boolean {
    return this.commandParser.isStartCommand(message);
  }

  /**
   * Send success response with invitation message
   * 
   * @param phoneNumber The user's phone number
   * @param message The success message to send
   */
  private async sendSuccessResponse(phoneNumber: string, message: string): Promise<void> {
    try {
      await this.whatsappService.sendNormalMessage(message, phoneNumber);
    } catch (error) {
      console.error("Error sending success response:", error);
      throw new ReferralCodeCaptureError(
        "Failed to send success response",
        "SEND_MESSAGE_ERROR"
      );
    }
  }

  /**
   * Send error response for invalid referral codes
   * 
   * @param phoneNumber The user's phone number
   * @param message The error message to send
   */
  private async sendErrorResponse(phoneNumber: string, message: string): Promise<void> {
    try {
      await this.whatsappService.sendNormalMessage(message, phoneNumber);
    } catch (error) {
      console.error("Error sending error response:", error);
      throw new ReferralCodeCaptureError(
        "Failed to send error response",
        "SEND_MESSAGE_ERROR"
      );
    }
  }

  /**
   * Send usage instructions for malformed start commands
   * 
   * @param phoneNumber The user's phone number
   */
  private async sendUsageInstructions(phoneNumber: string): Promise<void> {
    try {
      const instructions = this.messageService.usageInstructions();
      await this.whatsappService.sendNormalMessage(instructions, phoneNumber);
    } catch (error) {
      console.error("Error sending usage instructions:", error);
      throw new ReferralCodeCaptureError(
        "Failed to send usage instructions",
        "SEND_MESSAGE_ERROR"
      );
    }
  }

  /**
   * Send format error response for incorrectly formatted commands
   * 
   * @param phoneNumber The user's phone number
   */
  private async sendFormatErrorResponse(phoneNumber: string): Promise<void> {
    try {
      const formatError = this.messageService.formatErrorMessage();
      await this.whatsappService.sendNormalMessage(formatError, phoneNumber);
    } catch (error) {
      console.error("Error sending format error response:", error);
      throw new ReferralCodeCaptureError(
        "Failed to send format error response",
        "SEND_MESSAGE_ERROR"
      );
    }
  }

  /**
   * Send system error response for unexpected errors
   * 
   * @param phoneNumber The user's phone number
   */
  private async sendSystemErrorResponse(phoneNumber: string): Promise<void> {
    try {
      const systemError = this.messageService.errorMessage();
      await this.whatsappService.sendNormalMessage(systemError, phoneNumber);
    } catch (error) {
      console.error("Error sending system error response:", error);
      // Don't throw here to avoid infinite error loops
    }
  }

  /**
   * Get handler statistics for monitoring
   * 
   * @returns Basic handler information
   */
  getHandlerInfo(): { name: string; version: string; supportedCommands: string[] } {
    return {
      name: "WhatsAppReferralMessageHandler",
      version: "1.0.0",
      supportedCommands: ["start [referral_code]"]
    };
  }
}