import { Request, Response } from "express";
import { PointsBalance } from "../models/PointsBalance";
import { ReferralRelationship } from "../models/ReferralRelationship";
import { EarningsTransaction } from "../models/EarningsTransaction";
import { User } from "../models/User";
import { logger } from "../utils/logger";

export async function getLeaderboard(req: Request, res: Response) {
  try {
    const { sortBy = "totalEarned", limit = "50" } = req.query as Record<string, string>;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    // Top earners by totalEarned or currentBalance from PointsBalance
    const sortField = sortBy === "currentBalance" ? "currentBalance" : "totalEarned";

    const topBalances = await PointsBalance.find({ totalEarned: { $gt: 0 } })
      .sort({ [sortField]: -1 })
      .limit(limitNum)
      .lean();

    if (!topBalances.length) {
      return res.json({ success: true, data: [] });
    }

    const userIds = topBalances.map(b => b.userId);

    // Fetch user info, referral counts, and volume in parallel
    const [users, referralCounts, volumeAgg] = await Promise.all([
      User.find({ userId: { $in: userIds } })
        .select("userId fullName whatsappNumber country referralCode createdAt")
        .lean(),

      ReferralRelationship.aggregate([
        { $match: { referrerId: { $in: userIds } } },
        { $group: { _id: "$referrerId", count: { $sum: 1 } } },
      ]),

      EarningsTransaction.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: {
          _id: "$userId",
          totalVolume: { $sum: "$transactionAmount" },
          totalFees: { $sum: "$feeAmount" },
          txCount: { $sum: 1 },
          lastActivity: { $max: "$timestamp" },
        }},
      ]),
    ]);

    // Build lookup maps
    const userMap = Object.fromEntries(users.map(u => [u.userId, u]));
    const refCountMap = Object.fromEntries(referralCounts.map(r => [r._id, r.count]));
    const volumeMap = Object.fromEntries(volumeAgg.map(v => [v._id, v]));

    const data = topBalances.map((b, i) => {
      const user = userMap[b.userId];
      const vol = volumeMap[b.userId] ?? { totalVolume: 0, totalFees: 0, txCount: 0, lastActivity: null };
      return {
        rank: i + 1,
        userId: b.userId,
        fullName: user?.fullName ?? "Unknown",
        whatsappNumber: user?.whatsappNumber ?? "—",
        country: user?.country ?? "—",
        referralCode: user?.referralCode ?? "—",
        currentBalance: b.currentBalance,
        totalEarned: b.totalEarned,
        referralCount: refCountMap[b.userId] ?? 0,
        totalVolume: vol.totalVolume,
        totalFees: vol.totalFees,
        earningsTxCount: vol.txCount,
        lastActivity: vol.lastActivity,
        joinedAt: user?.createdAt ?? null,
      };
    });

    // If sorting by referral count, re-sort (PointsBalance doesn't store this)
    if (sortBy === "referralCount") {
      data.sort((a, b) => b.referralCount - a.referralCount);
      data.forEach((d, i) => { d.rank = i + 1; });
    }
    if (sortBy === "totalVolume") {
      data.sort((a, b) => b.totalVolume - a.totalVolume);
      data.forEach((d, i) => { d.rank = i + 1; });
    }

    return res.json({ success: true, data });
  } catch (error: any) {
    logger.error("Error fetching leaderboard:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
