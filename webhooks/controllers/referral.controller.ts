/**
 * Referral Webhook Controllers
 * 
 * Webhook handlers for referral system events.
 * Includes KYC completion and offramp transaction webhooks.
 */

import { ReferralService } from "../../services/ReferralService";
import { EarningsService, OfframpTransaction } from "../../services/EarningsService";
import { logger } from "../../utils/logger";

/**
 * Handle KYC completion webhook
 * 
 * Generates a referral code for the user when they complete KYC.
 * 
 * @param userId The user ID who completed KYC
 * @returns Promise<void>
 */
export async function handleKYCCompletion(userId: string): Promise<void> {
  try {
    const referralService = new ReferralService();
    
    // Generate referral code for the user
    const referralCode = await referralService.createReferralCode(userId);
    
    logger.info(`Generated referral code for user ${userId}: ${referralCode}`);
  } catch (error) {
    logger.error(`Failed to generate referral code for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Handle offramp transaction completion webhook
 * 
 * Processes referral earnings when a referred user completes an offramp transaction.
 * 
 * @param transaction The completed offramp transaction
 * @returns Promise<void>
 */
export async function handleOfframpTransaction(
  transaction: OfframpTransaction
): Promise<void> {
  try {
    const earningsService = new EarningsService();
    
    // Process referral earnings
    await earningsService.processTransactionEarnings(transaction);
    
    logger.info(
      `Processed referral earnings for transaction ${transaction.id} by user ${transaction.userId}`
    );
  } catch (error) {
    logger.error(
      `Failed to process referral earnings for transaction ${transaction.id}:`,
      error
    );
    // Don't throw - we don't want to fail the transaction if referral processing fails
    // The transaction should still complete successfully
  }
}
