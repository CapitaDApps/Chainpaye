/**
 * sendReceipt utility - Asynchronously sends transaction receipts to users
 * This handles the complete flow: generate -> upload -> send -> update transaction
 */

import { Transaction } from "../models/Transaction";
import { User } from "../models/User";
import { WhatsAppBusinessService } from "../services/WhatsAppBusinessService";
import { generateReceipt, formatTransactionData } from "./generateReceipt";
import { Types } from "mongoose";

/**
 * Send transaction receipt asynchronously
 * This function runs in the background and doesn't block the main flow
 *
 * @param transactionId - The MongoDB ObjectId of the transaction
 * @param userPhoneNumber - The user's WhatsApp phone number
 * @param counterpartyPhoneNumber - Optional counterparty's phone number (for transfers)
 */
export async function sendTransactionReceipt(
  transactionId: string,
  userPhoneNumber: string,
  counterpartyPhoneNumber?: string
): Promise<void> {
  // Use setImmediate to run asynchronously without blocking
  setImmediate(async () => {
    try {
      console.log(
        `[Receipt] Starting receipt generation for transaction: ${transactionId}`
      );

      // 1. Fetch the transaction
      const transaction = await Transaction.findById(transactionId).populate(
        "fromUser toUser"
      );
      if (!transaction) {
        console.error(`[Receipt] Transaction not found: ${transactionId}`);
        return;
      }

      // 2. Fetch the user
      const user = await User.findOne({ whatsappNumber: userPhoneNumber });
      if (!user) {
        console.error(`[Receipt] User not found: ${userPhoneNumber}`);
        return;
      }

      // 3. Fetch counterparty if provided (for transfers)
      let counterpartyUser;
      if (counterpartyPhoneNumber) {
        counterpartyUser = await User.findOne({
          whatsappNumber: counterpartyPhoneNumber,
        });
      }

      // 4. Format transaction data for receipt
      const receiptData = await formatTransactionData(
        transaction,
        user,
        counterpartyUser || undefined
      );

      // 5. Generate receipt (returns base64)
      console.log(`[Receipt] Generating receipt image...`);
      const base64Receipt = await generateReceipt(receiptData);

      // 6. Upload to WhatsApp
      console.log(`[Receipt] Uploading receipt to WhatsApp...`);
      const whatsappService = new WhatsAppBusinessService();
      const imageId = await whatsappService.uploadImageToWhatapp(base64Receipt);

      // 7. Send receipt to user
      console.log(`[Receipt] Sending receipt to user: ${userPhoneNumber}`);
      await whatsappService.sendImageMessageById(userPhoneNumber, imageId);

      // 8. Update transaction with receipt image ID
      await Transaction.findByIdAndUpdate(transactionId, {
        receiptImageId: imageId,
      });

      console.log(
        `[Receipt] Receipt sent successfully for transaction: ${transactionId}`
      );
    } catch (error) {
      console.error(
        `[Receipt] Error sending receipt for transaction ${transactionId}:`,
        error
      );
      // Don't throw - receipt sending failure shouldn't break the main flow
    }
  });
}

/**
 * Send receipts for both sides of a transfer transaction
 *
 * @param debitTransactionId - The DEBIT transaction (sender's side)
 * @param creditTransactionId - The CREDIT transaction (receiver's side)
 * @param senderPhoneNumber - Sender's WhatsApp phone number
 * @param receiverPhoneNumber - Receiver's WhatsApp phone number
 */
export async function sendTransferReceipts(
  debitTransactionId: string,
  creditTransactionId: string,
  senderPhoneNumber: string,
  receiverPhoneNumber: string
): Promise<void> {
  // Send DEBIT receipt to sender
  await sendTransactionReceipt(
    debitTransactionId,
    senderPhoneNumber,
    receiverPhoneNumber
  );

  // Send CREDIT receipt to receiver
  await sendTransactionReceipt(
    creditTransactionId,
    receiverPhoneNumber,
    senderPhoneNumber
  );
}
