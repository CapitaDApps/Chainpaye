/**
 * Send Offramp Receipt Utility
 * 
 * Handles sending offramp receipts to users via WhatsApp.
 * Separate from the existing transaction receipt system.
 */

import { WhatsAppBusinessService } from "../services/WhatsAppBusinessService";
import {
  generateOfframpReceipt,
  prepareOfframpReceiptData,
  OfframpReceiptData,
} from "./generateOfframpReceipt";
import { logger } from "./logger";

/**
 * Interface for offramp transaction details
 */
export interface OfframpTransactionDetails {
  ngnAmount: number;
  cryptoSpentUsd: number;
  fees: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  transactionDate: Date;
  transactionReference: string;
  status?: "Successful" | "Pending" | "Failed";
  countryCode?: string; // IANA country code for local time formatting (e.g. "NG", "GB")
  asset?: string; // Crypto asset (e.g., "USDC", "USDT")
  chain?: string; // Blockchain network (e.g., "Stellar", "Base", "Solana")
}

/**
 * Send offramp receipt to user via WhatsApp
 * 
 * @param phoneNumber - User's WhatsApp phone number
 * @param transactionDetails - Offramp transaction details
 * @returns Promise<void>
 */
export async function sendOfframpReceipt(
  phoneNumber: string,
  transactionDetails: OfframpTransactionDetails
): Promise<void> {
  try {
    logger.info(
      `[Offramp Receipt] Starting receipt generation for ${phoneNumber}`
    );

    // Prepare receipt data
    const receiptData = prepareOfframpReceiptData(
      transactionDetails.ngnAmount,
      transactionDetails.cryptoSpentUsd,
      transactionDetails.fees,
      transactionDetails.bankName,
      transactionDetails.accountName,
      transactionDetails.accountNumber,
      transactionDetails.transactionDate,
      transactionDetails.transactionReference,
      transactionDetails.status || "Successful",
      transactionDetails.countryCode
    );

    // Generate receipt image (returns base64)
    logger.info(`[Offramp Receipt] Generating receipt image...`);
    const base64Receipt = await generateOfframpReceipt(receiptData);

    // Upload to WhatsApp
    logger.info(`[Offramp Receipt] Uploading receipt to WhatsApp...`);
    const whatsappService = new WhatsAppBusinessService();
    const imageId = await whatsappService.uploadImageToWhatapp(base64Receipt);

    // Send receipt to user
    logger.info(`[Offramp Receipt] Sending receipt to user: ${phoneNumber}`);
    await whatsappService.sendImageMessageById(phoneNumber, imageId);

    logger.info(
      `[Offramp Receipt] Receipt sent successfully to ${phoneNumber}`
    );
  } catch (error) {
    logger.error(
      `[Offramp Receipt] Error sending receipt to ${phoneNumber}:`,
      error
    );
    // Don't throw - receipt sending failure shouldn't break the main flow
  }
}

/**
 * Send offramp receipt asynchronously (non-blocking)
 * 
 * @param phoneNumber - User's WhatsApp phone number
 * @param transactionDetails - Offramp transaction details
 */
export function sendOfframpReceiptAsync(
  phoneNumber: string,
  transactionDetails: OfframpTransactionDetails
): void {
  // Use setImmediate to run asynchronously without blocking
  setImmediate(async () => {
    await sendOfframpReceipt(phoneNumber, transactionDetails);
  });
}
