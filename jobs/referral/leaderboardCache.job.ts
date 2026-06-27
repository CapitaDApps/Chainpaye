/**
 * Leaderboard Cache Refresh Job
 * 
 * Scheduled job that runs every 5 minutes to refresh the leaderboard cache.
 * 
 * Validates: Requirements 7.1
 */

import { LeaderboardService } from "../../services/LeaderboardService";
import { logger } from "../../utils/logger";

/**
 * Refresh the leaderboard cache
 * 
 * @returns Promise<void>
 */
export async function runLeaderboardCacheRefreshJob(): Promise<void> {
  try {
    logger.info("Starting leaderboard cache refresh job");

    const leaderboardService = new LeaderboardService();
    
    // Refresh the cache
    const leaderboard = await leaderboardService.refreshCache(50);

    logger.info(`Leaderboard cache refreshed with ${leaderboard.length} entries`);
  } catch (error) {
    logger.error("Leaderboard cache refresh job failed:", error);
    throw error;
  }
}

/**
 * Schedule the leaderboard cache refresh job
 * 
 * This should be called during application initialization to set up the cron job.
 * Runs every 5 minutes.
 */
export function scheduleLeaderboardCacheRefreshJob(): void {
  // Run every 5 minutes
  const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
  
  setInterval(async () => {
    try {
      await runLeaderboardCacheRefreshJob();
    } catch (error) {
      logger.error("Scheduled leaderboard cache refresh job failed:", error);
    }
  }, FIVE_MINUTES_IN_MS);

  logger.info("Leaderboard cache refresh job scheduled (runs every 5 minutes)");
}
