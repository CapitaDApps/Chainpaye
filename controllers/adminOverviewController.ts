import { Request, Response } from "express";
import { User } from "../models/User";
import { Transaction, TransactionStatus, TransactionType } from "../models/Transaction";
import { OfframpTransaction, OfframpStatus } from "../models/OfframpTransaction";
import { WithdrawalRequest, WithdrawalStatus } from "../models/WithdrawalRequest";
import { PointsBalance } from "../models/PointsBalance";
import { logger } from "../utils/logger";

export async function getOverview(_req: Request, res: Response) {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOf7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOf30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      verifiedUsers,
      newUsersToday,
      newUsers7d,
      newUsers30d,
      txStats,
      offrampStats,
      withdrawalStats,
      referralBalanceStats,
      usdFlowStats,
      ngnFlowStats,
      recentSignups,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ createdAt: { $gte: startOfToday } }),
      User.countDocuments({ createdAt: { $gte: startOf7Days } }),
      User.countDocuments({ createdAt: { $gte: startOf30Days } }),

      // Transaction volume & fee aggregation (all statuses)
      Transaction.aggregate([
        { $group: {
          _id: "$status",
          count: { $sum: 1 },
          volume: { $sum: "$amount" },
          fees: { $sum: "$fees" },
        }},
      ]),

      // Offramp aggregation
      OfframpTransaction.aggregate([
        { $group: {
          _id: "$status",
          count: { $sum: 1 },
          cryptoVolume: { $sum: "$cryptoAmount" },
          ngnVolume: { $sum: "$ngnAmount" },
          fees: { $sum: "$fees" },
        }},
      ]),

      // Withdrawal aggregation
      WithdrawalRequest.aggregate([
        { $group: {
          _id: "$status",
          count: { $sum: 1 },
          amount: { $sum: "$amount" },
        }},
      ]),

      // Total referral balances outstanding
      PointsBalance.aggregate([
        { $group: {
          _id: null,
          totalCurrentBalance: { $sum: "$currentBalance" },
          totalEverEarned: { $sum: "$totalEarned" },
        }},
      ]),

      // Completed USD tx volume (incoming = CREDIT, outgoing = DEBIT)
      Transaction.aggregate([
        { $match: { status: TransactionStatus.COMPLETED, currency: "USD" } },
        {
          $group: {
            _id: "$entryType",
            count: { $sum: 1 },
            volume: { $sum: "$amount" },
            fees: { $sum: "$fees" },
          },
        },
      ]),

      // Completed NGN tx volume (incoming = CREDIT, outgoing = DEBIT)
      Transaction.aggregate([
        { $match: { status: TransactionStatus.COMPLETED, currency: "NGN" } },
        {
          $group: {
            _id: "$entryType",
            count: { $sum: 1 },
            volume: { $sum: "$amount" },
          },
        },
      ]),

      // Last 5 signups
      User.find()
        .select("fullName whatsappNumber country isVerified createdAt")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    // Flatten tx stats
    const txByStatus: Record<string, { count: number; volume: number; fees: number }> = {};
    for (const row of txStats) {
      txByStatus[row._id] = { count: row.count, volume: row.volume, fees: row.fees };
    }
    const totalTxCount = txStats.reduce((s, r) => s + r.count, 0);
    const totalTxVolume = txStats.reduce((s, r) => s + r.volume, 0);
    const totalTxFees = txStats.reduce((s, r) => s + r.fees, 0);

    // Completed USD volume only
    const completedUsdRow = txStats.find((r) => r._id === TransactionStatus.COMPLETED);
    // We'll use usdFlowStats for the accurate completed USD figure
    const usdFlowByEntry: Record<string, { count: number; volume: number; fees: number }> = {};
    for (const row of usdFlowStats) {
      usdFlowByEntry[row._id ?? "UNKNOWN"] = { count: row.count, volume: row.volume, fees: row.fees };
    }
    const completedUsdVolume =
      (usdFlowByEntry["CREDIT"]?.volume ?? 0) + (usdFlowByEntry["DEBIT"]?.volume ?? 0);

    // NGN flow
    const ngnFlowByEntry: Record<string, { count: number; volume: number }> = {};
    for (const row of ngnFlowStats) {
      ngnFlowByEntry[row._id ?? "UNKNOWN"] = { count: row.count, volume: row.volume };
    }

    // Flatten offramp stats
    const offrampByStatus: Record<string, any> = {};
    for (const row of offrampStats) {
      offrampByStatus[row._id] = row;
    }
    const totalOfframpCount = offrampStats.reduce((s, r) => s + r.count, 0);
    const totalOfframpCrypto = offrampStats.reduce((s, r) => s + r.cryptoVolume, 0);
    const totalOfframpNgn = offrampStats.reduce((s, r) => s + r.ngnVolume, 0);
    const totalOfframpFees = offrampStats.reduce((s, r) => s + r.fees, 0);

    // Flatten withdrawal stats
    const wByStatus: Record<string, { count: number; amount: number }> = {};
    for (const row of withdrawalStats) {
      wByStatus[row._id] = { count: row.count, amount: row.amount };
    }

    const rb = referralBalanceStats[0] ?? { totalCurrentBalance: 0, totalEverEarned: 0 };

    return res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          verified: verifiedUsers,
          unverified: totalUsers - verifiedUsers,
          newToday: newUsersToday,
          new7d: newUsers7d,
          new30d: newUsers30d,
        },
        transactions: {
          total: totalTxCount,
          totalVolume: totalTxVolume,
          completedUsdVolume,
          totalFees: totalTxFees,
          byStatus: txByStatus,
        },
        offramp: {
          total: totalOfframpCount,
          totalCryptoVolume: totalOfframpCrypto,
          totalNgnVolume: totalOfframpNgn,
          totalFees: totalOfframpFees,
          byStatus: offrampByStatus,
        },
        withdrawals: {
          byStatus: wByStatus,
          pendingAmount: wByStatus[WithdrawalStatus.PENDING]?.amount ?? 0,
          completedAmount: wByStatus[WithdrawalStatus.COMPLETED]?.amount ?? 0,
        },
        referralEarnings: {
          totalOutstandingBalance: rb.totalCurrentBalance,
          totalEverEarned: rb.totalEverEarned,
        },
        moneyFlow: {
          usd: {
            incoming: {
              volume: usdFlowByEntry["CREDIT"]?.volume ?? 0,
              count: usdFlowByEntry["CREDIT"]?.count ?? 0,
              fees: usdFlowByEntry["CREDIT"]?.fees ?? 0,
            },
            outgoing: {
              volume: usdFlowByEntry["DEBIT"]?.volume ?? 0,
              count: usdFlowByEntry["DEBIT"]?.count ?? 0,
              fees: usdFlowByEntry["DEBIT"]?.fees ?? 0,
            },
            netInApp:
              (usdFlowByEntry["CREDIT"]?.volume ?? 0) -
              (usdFlowByEntry["DEBIT"]?.volume ?? 0),
          },
          ngn: {
            incoming: {
              volume: ngnFlowByEntry["CREDIT"]?.volume ?? 0,
              count: ngnFlowByEntry["CREDIT"]?.count ?? 0,
            },
            outgoing: {
              volume: ngnFlowByEntry["DEBIT"]?.volume ?? 0,
              count: ngnFlowByEntry["DEBIT"]?.count ?? 0,
            },
            netInApp:
              (ngnFlowByEntry["CREDIT"]?.volume ?? 0) -
              (ngnFlowByEntry["DEBIT"]?.volume ?? 0),
          },
        },
        recentSignups,
      },
    });
  } catch (error: any) {
    console.error("Error fetching admin overview:", error);
    logger.error("Error fetching admin overview:", error?.message || String(error));
    return res.status(500).json({ success: false, error: error?.message || String(error) });
  }
}
