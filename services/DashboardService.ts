/**
 * DashboardService
 * 
 * Service for aggregating and displaying referral statistics.
 * Provides comprehensive dashboard data including referral counts, volumes, and earnings.
 * 
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import { ReferralRelationship } from "../models/ReferralRelationship";
import { PointsBalance } from "../models/PointsBalance";
import { EarningsTransaction } from "../models/EarningsTransaction";
import { User } from "../models/User";

/**
 * Interface for referral dashboard data
 */
export interface ReferralDashboard {
  referralCode: string;
  referralLink: string;
  totalReferred: number;
  currentBalance: number;
  totalEarned: number;
  totalVolume: number;
  totalFees: number;
  totalEarnings: number;
}

/**
 * Service for generating referral dashboards
 */
export class DashboardService {
  private baseUrl: string;
  private cache: Map<string, { data: ReferralDashboard; timestamp: number }>;
  private cacheTTL: number = 30000; // 30 seconds

  constructor(baseUrl: string = "https://chainpaye.com/referral") {
    this.baseUrl = baseUrl;
    this.cache = new Map();
  }

  /**
   * Get comprehensive dashboard data for a user
   * 
   * Aggregates:
   * - Referral code and link
   * - Total referred users count
   * - Current balance and total earned
   * - Total volume from referred users
   * - Total fees generated
   * - Total earnings from referrals
   * 
   * @param userId The user ID to generate dashboard for
   * @returns Promise<ReferralDashboard> Complete dashboard data
   * 
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */
  async getDashboard(userId: string): Promise<ReferralDashboard> {
    // Check cache
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    // Get user's referral code
    const user = await User.findOne({ userId });
    if (!user || !user.referralCode) {
      throw new Error("User not found or has no referral code");
    }

    // Get referral count
    const totalReferred = await ReferralRelationship.countDocuments({
      referrerId: userId,
    });

    // Get points balance
    const pointsBalance = await PointsBalance.findOne({ userId });
    const currentBalance = pointsBalance?.currentBalance ?? 0;
    const totalEarned = pointsBalance?.totalEarned ?? 0;

    // Get all referred user IDs
    const referredUsers = await ReferralRelationship.find({
      referrerId: userId,
    }).select("referredUserId");
    const referredUserIds = referredUsers.map((r) => r.referredUserId);

    // Aggregate earnings transactions to get volume and fees
    const earningsAgg = await EarningsTransaction.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalVolume: { $sum: "$transactionAmount" },
          totalFees: { $sum: "$feeAmount" },
          totalEarnings: { $sum: "$amount" },
        },
      },
    ]);

    const aggregated = earningsAgg[0] || {
      totalVolume: 0,
      totalFees: 0,
      totalEarnings: 0,
    };

    // Build dashboard
    const dashboard: ReferralDashboard = {
      referralCode: user.referralCode,
      referralLink: `${this.baseUrl}/${user.referralCode}`,
      totalReferred,
      currentBalance,
      totalEarned,
      totalVolume: aggregated.totalVolume,
      totalFees: aggregated.totalFees,
      totalEarnings: aggregated.totalEarnings,
    };

    // Cache the result
    this.cache.set(userId, { data: dashboard, timestamp: Date.now() });

    return dashboard;
  }

  /**
   * Clear cache for a specific user
   * 
   * @param userId The user ID to clear cache for
   */
  clearCache(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Clear all cached dashboard data
   */
  clearAllCache(): void {
    this.cache.clear();
  }
}
