/**
 * LeaderboardService
 * 
 * Service for generating and caching referral leaderboards.
 * Ranks users by total points earned and displays top performers.
 * 
 * Validates: Requirements 7.1, 7.2, 7.3
 */

import { PointsBalance } from "../models/PointsBalance";
import { ReferralRelationship } from "../models/ReferralRelationship";
import { User } from "../models/User";

/**
 * Interface for leaderboard entry
 */
export interface LeaderboardEntry {
  userId: string;
  username: string;
  totalEarned: number;
  totalReferred: number;
  rank: number;
}

/**
 * Service for generating leaderboards
 */
export class LeaderboardService {
  private cache: { data: LeaderboardEntry[]; timestamp: number } | null = null;
  private cacheTTL: number = 300000; // 5 minutes

  /**
   * Get leaderboard of top referrers
   * 
   * Returns top users ranked by total points earned, including:
   * - User ID and username
   * - Total points earned
   * - Total users referred
   * - Rank position
   * 
   * @param limit Maximum number of entries to return (default: 50)
   * @returns Promise<LeaderboardEntry[]> Sorted leaderboard entries
   * 
   * Validates: Requirements 7.1, 7.2, 7.3
   */
  async getLeaderboard(limit: number = 50): Promise<LeaderboardEntry[]> {
    // Check cache
    if (this.cache && Date.now() - this.cache.timestamp < this.cacheTTL) {
      return this.cache.data.slice(0, limit);
    }

    // Query points balances sorted by totalEarned descending
    const topBalances = await PointsBalance.find()
      .sort({ totalEarned: -1 })
      .limit(limit)
      .lean();

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = [];

    for (let i = 0; i < topBalances.length; i++) {
      const balance = topBalances[i];
      
      // Get user info
      const user = await User.findOne({ userId: balance.userId });
      const username = user?.fullName || user?.userId || "Unknown";

      // Get referral count
      const totalReferred = await ReferralRelationship.countDocuments({
        referrerId: balance.userId,
      });

      entries.push({
        userId: balance.userId,
        username,
        totalEarned: balance.totalEarned,
        totalReferred,
        rank: i + 1,
      });
    }

    // Cache the result
    this.cache = { data: entries, timestamp: Date.now() };

    return entries;
  }

  /**
   * Clear the leaderboard cache
   */
  clearCache(): void {
    this.cache = null;
  }

  /**
   * Refresh the leaderboard cache
   * 
   * @param limit Maximum number of entries to cache
   * @returns Promise<LeaderboardEntry[]> Refreshed leaderboard
   */
  async refreshCache(limit: number = 50): Promise<LeaderboardEntry[]> {
    this.clearCache();
    return this.getLeaderboard(limit);
  }
}
