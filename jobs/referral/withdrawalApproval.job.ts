/**
 * Withdrawal Approval Job
 * 
 * Scheduled job that runs hourly to approve and process pending withdrawals
 * that have passed the 24-hour delay period.
 * 
 * Validates: Requirements 5.4, 5.5
 */

import { WithdrawalService } from "../../services/WithdrawalService";
import { PointsRepository } from "../../repositories/PointsRepository";
import { logger } from "../../utils/logger";

/**
 * Process pending withdrawals that are ready for approval
 * 
 * This job:
 * 1. Queries withdrawal requests with status "pending" and requestedAt > 24 hours ago
 * 2. Approves each withdrawal
 * 3. Processes the approved withdrawal (debit points, initiate bank transfer)
 * 
 * @returns Promise<void>
 */
export async function runWithdrawalApprovalJob(): Promise<void> {
  try {
    logger.info("Starting withdrawal approval job");

    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

    // Get pending withdrawals ready for approval
    const pendingWithdrawals = await withdrawalService.getPendingWithdrawalsForApproval();

    logger.info(`Found ${pendingWithdrawals.length} withdrawals ready for approval`);

    let approvedCount = 0;
    let processedCount = 0;
    let failedCount = 0;

    for (const withdrawal of pendingWithdrawals) {
      try {
        // Approve the withdrawal
        await withdrawalService.approveWithdrawal(withdrawal.id);
        approvedCount++;

        // Process the withdrawal
        await withdrawalService.processWithdrawal(withdrawal.id);
        processedCount++;

        logger.info(
          `Successfully processed withdrawal ${withdrawal.id} for user ${withdrawal.userId}`
        );
      } catch (error) {
        failedCount++;
        logger.error(
          `Failed to process withdrawal ${withdrawal.id}:`,
          error
        );
      }
    }

    logger.info(
      `Withdrawal approval job completed: ${approvedCount} approved, ${processedCount} processed, ${failedCount} failed`
    );
  } catch (error) {
    logger.error("Withdrawal approval job failed:", error);
    throw error;
  }
}

/**
 * Schedule the withdrawal approval job
 * 
 * This should be called during application initialization to set up the cron job.
 * Runs every hour.
 */
export function scheduleWithdrawalApprovalJob(): void {
  // Run every hour
  const HOUR_IN_MS = 60 * 60 * 1000;
  
  setInterval(async () => {
    try {
      await runWithdrawalApprovalJob();
    } catch (error) {
      logger.error("Scheduled withdrawal approval job failed:", error);
    }
  }, HOUR_IN_MS);

  logger.info("Withdrawal approval job scheduled (runs every hour)");
}
