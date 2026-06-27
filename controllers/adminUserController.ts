import { Request, Response } from "express";
import { User } from "../models/User";
import { ReferralRelationship } from "../models/ReferralRelationship";
import { PointsBalance } from "../models/PointsBalance";
import { EarningsTransaction } from "../models/EarningsTransaction";
import { WithdrawalRequest, WithdrawalStatus } from "../models/WithdrawalRequest";
import { Wallet } from "../models/Wallet";
import { logger } from "../utils/logger";

export async function getUserDetails(req: Request, res: Response) {
  try {
    const userId = req.params.userId as string;
    const isObjectId = /^[a-f\d]{24}$/i.test(userId);

    const user = await User.findOne({
      $or: [
        { userId },
        { whatsappNumber: userId },
        ...(isObjectId ? [{ _id: userId }] : []),
      ],
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const internalUserId = user.userId;

    const [totalReferred, pointsBalance, earningsAgg, recentWithdrawals, recentReferrals] =
      await Promise.all([
        ReferralRelationship.countDocuments({ referrerId: internalUserId }),
        PointsBalance.findOne({ userId: internalUserId }),
        EarningsTransaction.aggregate([
          { $match: { userId: internalUserId } },
          {
            $group: {
              _id: null,
              totalVolume: { $sum: "$transactionAmount" },
              totalFees: { $sum: "$feeAmount" },
              totalEarnings: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),
        WithdrawalRequest.find({ userId: internalUserId })
          .sort({ requestedAt: -1 })
          .limit(5)
          .lean(),
        ReferralRelationship.find({ referrerId: internalUserId })
          .select("referredUserId createdAt expiresAt")
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

    const agg = earningsAgg[0] ?? { totalVolume: 0, totalFees: 0, totalEarnings: 0, count: 0 };

    return res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        userId: user.userId,
        fullName: user.fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        whatsappNumber: user.whatsappNumber,
        email: user.email,
        country: user.country,
        currency: user.currency,
        isVerified: user.isVerified,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        referredAt: user.referredAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      referralStats: {
        totalReferred,
        currentBalance: pointsBalance?.currentBalance ?? 0,
        totalEarned: pointsBalance?.totalEarned ?? 0,
        totalVolume: agg.totalVolume,
        totalFees: agg.totalFees,
        totalEarnings: agg.totalEarnings,
        earningsTransactionCount: agg.count,
      },
      recentReferrals,
      recentWithdrawals: recentWithdrawals.map((w) => ({
        id: w._id,
        amount: w.amount,
        status: w.status,
        evmAddress: w.evmAddress,
        chain: w.chain,
        token: w.token,
        requestedAt: w.requestedAt,
        completedAt: w.completedAt,
        transactionHash: w.transactionHash,
        failureReason: w.failureReason,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getAllUsers(req: Request, res: Response) {
  try {
    const limit = Math.min(100, parseInt((req.query.limit as string) || "50"));
    const offset = Math.max(0, parseInt((req.query.offset as string) || "0"));
    const filter: any = {};

    if (req.query.verified === "true") filter.isVerified = true;
    else if (req.query.verified === "false") filter.isVerified = false;

    if (req.query.country) filter.country = (req.query.country as string).toUpperCase();

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("userId fullName whatsappNumber email country currency isVerified referralCode referredBy createdAt")
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({ success: true, total, count: users.length, users });
  } catch (error: any) {
    logger.error("Error fetching all users:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function searchUsers(req: Request, res: Response) {
  try {
    const { q, limit = "20", offset = "0" } = req.query as Record<string, string>;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, error: "Query must be at least 2 characters" });
    }

    const users = await User.find({
      $or: [
        { fullName: { $regex: q!, $options: "i" } },
        { whatsappNumber: { $regex: q!, $options: "i" } },
        { userId: { $regex: q!, $options: "i" } },
        { referralCode: { $regex: q!, $options: "i" } },
        { email: { $regex: q!, $options: "i" } },
      ],
    })
      .select("userId fullName whatsappNumber email country isVerified referralCode createdAt")
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    return res.status(200).json({ success: true, count: users.length, users });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    const userId = req.params.userId as string;
    const isObjectId = /^[a-f\d]{24}$/i.test(userId);

    const user = await User.findOne({
      $or: [
        { userId },
        { whatsappNumber: userId },
        ...(isObjectId ? [{ _id: userId }] : []),
      ],
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const internalUserId = user.userId;

    // Block deletion if there's a pending withdrawal — funds are at stake
    const pendingWithdrawal = await WithdrawalRequest.findOne({
      userId: internalUserId,
      status: WithdrawalStatus.PENDING,
    });

    if (pendingWithdrawal) {
      return res.status(409).json({
        success: false,
        error: "Cannot delete user with a pending withdrawal request. Resolve it first.",
      });
    }

    // Delete all associated data in parallel
    await Promise.all([
      User.deleteOne({ _id: user._id }),
      Wallet.deleteOne({ userId: internalUserId }),
      PointsBalance.deleteOne({ userId: internalUserId }),
      EarningsTransaction.deleteMany({ userId: internalUserId }),
      ReferralRelationship.deleteMany({ referrerId: internalUserId }),
      // Remove the referral relationship where this user was referred (free up slot)
      ReferralRelationship.deleteOne({ referredUserId: internalUserId }),
      WithdrawalRequest.deleteMany({ userId: internalUserId }),
    ]);

    logger.info("User deleted by admin", { userId: internalUserId, whatsapp: user.whatsappNumber });

    return res.status(200).json({
      success: true,
      message: `User ${user.fullName} (${user.whatsappNumber}) has been deleted.`,
    });
  } catch (error: any) {
    logger.error("Error deleting user:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
