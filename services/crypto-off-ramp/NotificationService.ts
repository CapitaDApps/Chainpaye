/**
 * NotificationService - Handles user communications and receipt delivery for crypto off-ramp workflow
 *
 * This service implements receipt delivery through available communication channels
 * and provides status updates and error notifications to users.
 *
 * Requirements: 12.4
 */

import {
  INotificationService,
  OffRampTransaction,
  TransactionReceipt,
} from "../../types/crypto-off-ramp.types";
import { sendTransactionReceipt } from "../../utils/sendReceipt";

export interface NotificationServiceConfig {
  enableWhatsApp: boolean;
  enableEmail: boolean;
  enableSMS: boolean;
  enableInApp: boolean;
  defaultChannels: string[];
  retryAttempts: number;
  retryDelayMs: number;
}

export interface DeliveryResult {
  success: boolean;
  channel: string;
  error?: string;
  deliveredAt?: Date;
}

export interface ReceiptDeliveryResult {
  transactionId: string;
  userId: string;
  deliveryResults: DeliveryResult[];
  allChannelsSuccessful: boolean;
  primaryChannelSuccessful: boolean;
}

/**
 * NotificationService provides comprehensive user communication capabilities
 * including receipt delivery, status updates, and error notifications.
 */
export class NotificationService implements INotificationService {
  private readonly config: NotificationServiceConfig;

  constructor(config?: Partial<NotificationServiceConfig>) {
    this.config = {
      enableWhatsApp: true,
      enableEmail: false,
      enableSMS: false,
      enableInApp: false,
      defaultChannels: ["whatsapp"],
      retryAttempts: 3,
      retryDelayMs: 2000,
      ...config,
    };
  }

  /**
   * Send transaction receipt to user through available communication channels
   * Requirements: 12.4
   *
   * @param userId - The user ID to send receipt to
   * @param transaction - The completed transaction
   * @returns Promise<void>
   */
  async sendReceipt(
    userId: string,
    transaction: OffRampTransaction,
  ): Promise<void> {
    try {
      this.log(
        `Sending receipt for transaction ${transaction.id} to user ${userId}`,
      );

      // Generate receipt from transaction
      const receipt = this.generateReceiptFromTransaction(transaction);

      // Deliver receipt through available channels
      const deliveryResult = await this.deliverReceipt(
        userId,
        transaction,
        receipt,
      );

      if (!deliveryResult.primaryChannelSuccessful) {
        throw new Error(
          `Failed to deliver receipt through primary channel for transaction ${transaction.id}`,
        );
      }

      this.log(
        `Receipt delivered successfully for transaction ${transaction.id}`,
      );
    } catch (error) {
      this.log(
        `Error sending receipt for transaction ${transaction.id}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Send status update message to user
   *
   * @param userId - The user ID to send update to
   * @param message - The status message to send
   * @returns Promise<void>
   */
  async sendStatusUpdate(userId: string, message: string): Promise<void> {
    try {
      this.log(`Sending status update to user ${userId}: ${message}`);

      // For now, we'll use WhatsApp as the primary channel for status updates
      if (this.config.enableWhatsApp) {
        await this.sendWhatsAppMessage(userId, message);
      }

      this.log(`Status update sent successfully to user ${userId}`);
    } catch (error) {
      this.log(
        `Error sending status update to user ${userId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Send error notification to user
   *
   * @param userId - The user ID to send notification to
   * @param error - The error message to send
   * @returns Promise<void>
   */
  async sendErrorNotification(userId: string, error: string): Promise<void> {
    try {
      this.log(`Sending error notification to user ${userId}: ${error}`);

      // Format error message for user consumption
      const userFriendlyError = this.formatErrorForUser(error);

      // Send through available channels
      if (this.config.enableWhatsApp) {
        await this.sendWhatsAppMessage(
          userId,
          `❌ Transaction Error: ${userFriendlyError}`,
        );
      }

      this.log(`Error notification sent successfully to user ${userId}`);
    } catch (notificationError) {
      this.log(
        `Error sending error notification to user ${userId}: ${(notificationError as Error).message}`,
      );
      // Don't throw here - we don't want notification failures to break the main flow
    }
  }

  /**
   * Send completion notification with success message
   * Requirements: 12.1
   *
   * @param userId - The user ID to send notification to
   * @param transaction - The completed transaction
   * @returns Promise<void>
   */
  async sendCompletionNotification(
    userId: string,
    transaction: OffRampTransaction,
  ): Promise<void> {
    try {
      this.log(
        `Sending completion notification for transaction ${transaction.id} to user ${userId}`,
      );

      // Format completion message as per requirement 12.1
      const completionMessage = this.formatCompletionMessage(transaction);

      // Send through available channels
      if (this.config.enableWhatsApp) {
        await this.sendWhatsAppMessage(userId, completionMessage);
      }

      this.log(
        `Completion notification sent successfully for transaction ${transaction.id}`,
      );
    } catch (error) {
      this.log(
        `Error sending completion notification for transaction ${transaction.id}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  // Private helper methods

  /**
   * Deliver receipt through available communication channels
   */
  private async deliverReceipt(
    userId: string,
    transaction: OffRampTransaction,
    receipt: TransactionReceipt,
  ): Promise<ReceiptDeliveryResult> {
    const deliveryResults: DeliveryResult[] = [];
    const channels = this.getAvailableChannels();

    for (const channel of channels) {
      try {
        this.log(
          `Attempting receipt delivery via ${channel} for transaction ${transaction.id}`,
        );

        const result = await this.deliverReceiptViaChannel(
          userId,
          transaction,
          receipt,
          channel,
        );
        deliveryResults.push(result);

        if (result.success) {
          this.log(
            `Receipt delivered successfully via ${channel} for transaction ${transaction.id}`,
          );
        } else {
          this.log(
            `Receipt delivery failed via ${channel} for transaction ${transaction.id}: ${result.error}`,
          );
        }
      } catch (error) {
        this.log(
          `Error delivering receipt via ${channel}: ${(error as Error).message}`,
        );
        deliveryResults.push({
          success: false,
          channel,
          error: (error as Error).message,
        });
      }
    }

    const primaryChannelResult = deliveryResults.find(
      (r) => r.channel === channels[0],
    );
    const allChannelsSuccessful = deliveryResults.every((r) => r.success);
    const primaryChannelSuccessful = primaryChannelResult?.success || false;

    return {
      transactionId: transaction.id,
      userId,
      deliveryResults,
      allChannelsSuccessful,
      primaryChannelSuccessful,
    };
  }

  /**
   * Deliver receipt via specific channel
   */
  private async deliverReceiptViaChannel(
    userId: string,
    transaction: OffRampTransaction,
    receipt: TransactionReceipt,
    channel: string,
  ): Promise<DeliveryResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        this.log(
          `Receipt delivery attempt ${attempt}/${this.config.retryAttempts} via ${channel}`,
        );

        switch (channel) {
          case "whatsapp":
            await this.deliverReceiptViaWhatsApp(userId, transaction, receipt);
            break;
          case "email":
            await this.deliverReceiptViaEmail(userId, transaction, receipt);
            break;
          case "sms":
            await this.deliverReceiptViaSMS(userId, transaction, receipt);
            break;
          case "in-app":
            await this.deliverReceiptViaInApp(userId, transaction, receipt);
            break;
          default:
            throw new Error(`Unsupported delivery channel: ${channel}`);
        }

        return {
          success: true,
          channel,
          deliveredAt: new Date(),
        };
      } catch (error) {
        lastError = error as Error;
        this.log(
          `Receipt delivery attempt ${attempt} failed via ${channel}: ${lastError.message}`,
        );

        // Wait before retry (except on last attempt)
        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelayMs * attempt);
        }
      }
    }

    return {
      success: false,
      channel,
      error:
        lastError?.message ||
        `Receipt delivery failed after ${this.config.retryAttempts} attempts`,
    };
  }

  /**
   * Deliver receipt via WhatsApp
   */
  private async deliverReceiptViaWhatsApp(
    userId: string,
    transaction: OffRampTransaction,
    receipt: TransactionReceipt,
  ): Promise<void> {
    // Use the existing sendTransactionReceipt utility
    // Note: This assumes we can get the user's WhatsApp number from userId
    const userPhoneNumber = await this.getUserPhoneNumber(userId);

    if (!userPhoneNumber) {
      throw new Error(`No WhatsApp number found for user ${userId}`);
    }

    // For crypto off-ramp, we'll create a mock transaction ID that matches the existing utility's expectations
    // In a real implementation, we'd need to adapt the existing utility or create a new one for off-ramp receipts
    await sendTransactionReceipt(transaction.id, userPhoneNumber);
  }

  /**
   * Deliver receipt via Email (placeholder implementation)
   */
  private async deliverReceiptViaEmail(
    userId: string,
    transaction: OffRampTransaction,
    receipt: TransactionReceipt,
  ): Promise<void> {
    // Placeholder for email delivery implementation
    this.log(
      `Email delivery not yet implemented for transaction ${transaction.id}`,
    );
    throw new Error("Email delivery not yet implemented");
  }

  /**
   * Deliver receipt via SMS (placeholder implementation)
   */
  private async deliverReceiptViaSMS(
    userId: string,
    transaction: OffRampTransaction,
    receipt: TransactionReceipt,
  ): Promise<void> {
    // Placeholder for SMS delivery implementation
    this.log(
      `SMS delivery not yet implemented for transaction ${transaction.id}`,
    );
    throw new Error("SMS delivery not yet implemented");
  }

  /**
   * Deliver receipt via In-App notification (placeholder implementation)
   */
  private async deliverReceiptViaInApp(
    userId: string,
    transaction: OffRampTransaction,
    receipt: TransactionReceipt,
  ): Promise<void> {
    // Placeholder for in-app delivery implementation
    this.log(
      `In-app delivery not yet implemented for transaction ${transaction.id}`,
    );
    throw new Error("In-app delivery not yet implemented");
  }

  /**
   * Send WhatsApp message to user
   */
  private async sendWhatsAppMessage(
    userId: string,
    message: string,
  ): Promise<void> {
    const userPhoneNumber = await this.getUserPhoneNumber(userId);

    if (!userPhoneNumber) {
      throw new Error(`No WhatsApp number found for user ${userId}`);
    }

    // Use WhatsApp service to send message
    // This would integrate with the existing WhatsAppBusinessService
    // For now, we'll log the message
    this.log(`WhatsApp message to ${userPhoneNumber}: ${message}`);
  }

  /**
   * Generate receipt from transaction data
   * Requirements: 12.3
   */
  private generateReceiptFromTransaction(
    transaction: OffRampTransaction,
  ): TransactionReceipt {
    return {
      transactionId: transaction.id,
      userId: transaction.userId,
      asset: transaction.asset,
      chain: transaction.chain,
      amount: transaction.amount,
      fiatAmount: transaction.fiatAmount,
      exchangeRate: transaction.exchangeRate,
      fees: {
        chainpaye: transaction.chainpayeFee,
        dexpay: transaction.dexpayFee,
        total: transaction.totalFees,
      },
      bankDetails: {
        bankName: transaction.bankName,
        accountName: transaction.accountName,
        accountNumber: transaction.accountNumber,
      },
      timestamps: {
        initiated: transaction.createdAt,
        completed: transaction.completedAt || new Date(),
      },
      references: {
        ...(transaction.crossmintTransactionId !== undefined
          ? { crossmintTxId: transaction.crossmintTransactionId }
          : {}),
        ...(transaction.dexpayQuoteId !== undefined
          ? { dexpayQuoteId: transaction.dexpayQuoteId }
          : {}),
        ...(transaction.dexpayOrderId !== undefined
          ? { dexpayOrderId: transaction.dexpayOrderId }
          : {}),
      },
    };
  }

  /**
   * Format completion message as per requirement 12.1
   */
  private formatCompletionMessage(transaction: OffRampTransaction): string {
    return (
      `✅ Transaction Successful\n\n` +
      `You will receive your money in seconds.\n\n` +
      `Transaction Details:\n` +
      `• Amount: ${transaction.amount} ${transaction.asset}\n` +
      `• Fiat Amount: ₦${transaction.fiatAmount.toLocaleString()}\n` +
      `• Bank: ${transaction.bankName}\n` +
      `• Account: ${transaction.accountName}\n` +
      `• Transaction ID: ${transaction.id}`
    );
  }

  /**
   * Format error message for user consumption
   */
  private formatErrorForUser(error: string): string {
    // Convert technical errors to user-friendly messages
    const errorMappings: Record<string, string> = {
      "insufficient funds":
        "You do not have enough balance for this transaction",
      "invalid pin": "The PIN you entered is incorrect",
      "network error": "There was a connection problem. Please try again",
      "api error":
        "Our services are temporarily unavailable. Please try again later",
      timeout: "The transaction took too long to process. Please try again",
      expired:
        "The transaction session has expired. Please start a new transaction",
    };

    const lowerError = error.toLowerCase();
    for (const [key, message] of Object.entries(errorMappings)) {
      if (lowerError.includes(key)) {
        return message;
      }
    }

    // Default user-friendly message
    return "An error occurred while processing your transaction. Please try again or contact support";
  }

  /**
   * Get available delivery channels based on configuration
   */
  private getAvailableChannels(): string[] {
    const channels: string[] = [];

    if (this.config.enableWhatsApp) channels.push("whatsapp");
    if (this.config.enableEmail) channels.push("email");
    if (this.config.enableSMS) channels.push("sms");
    if (this.config.enableInApp) channels.push("in-app");

    return channels.length > 0 ? channels : this.config.defaultChannels;
  }

  /**
   * Get user's phone number for WhatsApp delivery
   * This is a placeholder - in a real implementation, this would query the user database
   */
  private async getUserPhoneNumber(userId: string): Promise<string | null> {
    // Placeholder implementation
    // In a real system, this would query the user database to get the WhatsApp number
    this.log(
      `Getting phone number for user ${userId} (placeholder implementation)`,
    );
    return null; // Return null for now since we don't have access to the user database
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Log message with timestamp
   */
  private log(message: string): void {
    console.log(
      `[NotificationService] ${new Date().toISOString()}: ${message}`,
    );
  }
}

export default NotificationService;
