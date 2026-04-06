/**
 * Withdrawal Notification Job
 * 
 * Scheduled job that runs periodically to notify admins about pending withdrawals
 * and send reminders to users about withdrawal status.
 * 
 * Validates: Requirements 5.4, 5.5
 */

import { WithdrawalService } from "../../services/WithdrawalService";
import { PointsRepository } from "../../repositories/PointsRepository";
import { whatsappBusinessService } from "../../services";
import { logger } from "../../utils/logger";

/**
 * Send notifications about pending withdrawals
 * 
 * This job:
 * 1. Queries withdrawal requests with status "pending"
 * 2. Logs summary for admin monitoring
 * 3. Optionally sends reminders for old pending requests
 * 
 * @returns Promise<void>
 */
export async function runWithdrawalNotificationJob(): Promise<void> {
  try {
    logger.info("Starting withdrawal notification job");

    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

    // Get pending withdrawals
    const pendingWithdrawals = await withdrawalService.getPendingWithdrawals();

    if (pendingWithdrawals.length === 0) {
      logger.info("No pending withdrawals found");
      return;
    }

    // Calculate total pending amount
    const totalPendingAmount = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);

    // Log summary for admin monitoring
    logger.info(`Pending withdrawal summary:`, {
      count: pendingWithdrawals.length,
      totalAmount: totalPendingAmount.toFixed(2),
      oldestRequest: pendingWithdrawals[0]?.requestedAt,
    });

    // Check for withdrawals older than 24 hours and send reminders
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const oldPendingWithdrawals = pendingWithdrawals.filter(
      w => w.requestedAt <= twentyFourHoursAgo
    );

    if (oldPendingWithdrawals.length > 0) {
      logger.warn(`Found ${oldPendingWithdrawals.length} withdrawals pending for over 24 hours`);
      
      // Send reminder to users for very old requests (over 48 hours)
      const fortyEightHoursAgo = new Date();
      fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

      const veryOldWithdrawals = oldPendingWithdrawals.filter(
        w => w.requestedAt <= fortyEightHoursAgo
      );

      for (const withdrawal of veryOldWithdrawals) {
        try {
          const reminderMessage = `
⏰ *Withdrawal Update*

Your withdrawal request is still being processed:

💰 *Amount:* $${withdrawal.amount.toFixed(2)} USDT
📅 *Requested:* ${withdrawal.requestedAt.toISOString().split('T')[0]}
⏰ *Status:* Under Review

We're working to process your request as quickly as possible. You'll receive a notification once completed.

Type *referral history* to check status anytime.
          `.trim();

          await whatsappBusinessService.sendNormalMessage(reminderMessage, withdrawal.userId);
          
          logger.info(`Sent reminder for withdrawal ${withdrawal.id} to user ${withdrawal.userId}`);
        } catch (error) {
          logger.error(`Failed to send reminder for withdrawal ${withdrawal.id}:`, error);
        }
      }
    }

    logger.info("Withdrawal notification job completed successfully");
  } catch (error) {
    logger.error("Withdrawal notification job failed:", error);
    throw error;
  }
}

/**
 * Schedule the withdrawal notification job
 * 
 * This should be called during application initialization to set up the cron job.
 * Runs every 6 hours.
 */
export function scheduleWithdrawalNotificationJob(): void {
  // Run every 6 hours
  const SIX_HOURS_IN_MS = 6 * 60 * 60 * 1000;
  
  setInterval(async () => {
    try {
      await runWithdrawalNotificationJob();
    } catch (error) {
      logger.error("Scheduled withdrawal notification job failed:", error);
    }
  }, SIX_HOURS_IN_MS);

  logger.info("Withdrawal notification job scheduled (runs every 6 hours)");
}