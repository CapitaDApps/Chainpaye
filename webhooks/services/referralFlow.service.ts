import { User } from "../../models/User";
import { WithdrawalRequest } from "../../models/WithdrawalRequest";
import { PointsBalance } from "../../models/PointsBalance";
import { EarningsTransaction } from "../../models/EarningsTransaction";
import { ReferralRelationship } from "../../models/ReferralRelationship";
import { logger } from "../../utils/logger";

/**
 * ReferralFlowService
 * Handles data preparation for the referral dashboard WhatsApp Flow
 */
export class ReferralFlowService {
  /**
   * Get dashboard data for the main referral screen
   */
  async getDashboardData(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    // Get points balance
    const pointsBalance = await PointsBalance.findOne({ userId });
    const currentBalance = pointsBalance?.currentBalance || 0;
    const totalEarned = pointsBalance?.totalEarned || 0;

    // Get total referred users
    const totalReferred = await ReferralRelationship.countDocuments({
      referrerId: userId,
    });

    // Calculate total volume and fees from earnings transactions
    const earningsTransactions = await EarningsTransaction.find({
      referrerId: userId,
    });

    let totalVolume = 0;
    let totalFees = 0;

    earningsTransactions.forEach((transaction) => {
      totalVolume += transaction.transactionVolume || 0;
      totalFees += transaction.earningsAmount || 0;
    });

    const whatsappNumber = process.env.WHATSAPP_PHONE_NUMBER || "";
    const referralLink = `https://wa.me/${whatsappNumber}?text=start%20${user.referralCode}`;

    return {
      referralCode: user.referralCode || "",
      referralLink,
      currentBalance: currentBalance.toFixed(2),
      totalEarned: totalEarned.toFixed(2),
      totalReferred,
      totalVolume: totalVolume.toFixed(2),
      totalFees: totalFees.toFixed(2),
    };
  }

  /**
   * Get data for share referral screen
   */
  async getShareReferralData(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const whatsappNumber = process.env.WHATSAPP_PHONE_NUMBER || "";
    const referralLink = `https://wa.me/${whatsappNumber}?text=start%20${user.referralCode}`;

    return {
      referralCode: user.referralCode || "",
      referralLink,
    };
  }

  /**
   * Get data for withdrawal request screen
   */
  async getWithdrawalRequestData(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    // Get points balance
    const pointsBalance = await PointsBalance.findOne({ userId });
    const currentBalance = pointsBalance?.currentBalance || 0;

    const minWithdrawal = 20;
    const insufficientBalance = currentBalance < minWithdrawal;

    // Check last withdrawal for 7-day limit
    const lastWithdrawal = await WithdrawalRequest.findOne({
      userId,
      status: { $in: ["pending", "completed"] },
    }).sort({ createdAt: -1 });

    let withdrawalLimitReached = false;
    let daysRemaining = "0";
    let lastWithdrawalDate = "";

    if (lastWithdrawal) {
      const nextDate = new Date(lastWithdrawal.createdAt);
      nextDate.setDate(nextDate.getDate() + 7);
      const today = new Date();

      if (today < nextDate) {
        withdrawalLimitReached = true;
        const diffTime = nextDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysRemaining = diffDays.toString();
        lastWithdrawalDate = lastWithdrawal.createdAt.toLocaleDateString(
          "en-US",
          {
            month: "short",
            day: "numeric",
            year: "numeric",
          }
        );
      }
    }

    const canWithdraw = !insufficientBalance && !withdrawalLimitReached;

    return {
      currentBalance: currentBalance.toFixed(2),
      bnbWalletAddress: user.bnbWalletAddress || "Not set",
      canWithdraw,
      has_error: false,
      error_message: "",
      insufficientBalance,
      withdrawalLimitReached,
      minWithdrawal: minWithdrawal.toFixed(2),
      lastWithdrawalDate,
      daysRemaining,
    };
  }

  /**
   * Process withdrawal request and return confirmation data
   */
  async processWithdrawalRequest(userId: string, amount: number) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    // Get points balance
    const pointsBalance = await PointsBalance.findOne({ userId });
    const currentBalance = pointsBalance?.currentBalance || 0;

    // Validate amount
    if (amount < 20) {
      throw new Error("Minimum withdrawal amount is $20");
    }

    if (amount > currentBalance) {
      throw new Error("Insufficient balance");
    }

    // Check 7-day limit
    const lastWithdrawal = await WithdrawalRequest.findOne({
      userId,
      status: { $in: ["pending", "completed"] },
    }).sort({ createdAt: -1 });

    if (lastWithdrawal) {
      const nextDate = new Date(lastWithdrawal.createdAt);
      nextDate.setDate(nextDate.getDate() + 7);
      const today = new Date();

      if (today < nextDate) {
        throw new Error("You can only withdraw once every 7 days");
      }
    }

    // Create withdrawal request
    const withdrawal = new WithdrawalRequest({
      userId,
      amount,
      status: "pending",
      destination: "bnb_wallet",
      walletAddress: user.bnbWalletAddress,
      createdAt: new Date(),
    });

    await withdrawal.save();

    // Deduct from points balance
    if (pointsBalance) {
      pointsBalance.currentBalance -= amount;
      await pointsBalance.save();
    }

    logger.info(`Withdrawal request created for user ${userId}: $${amount}`);

    const nextWithdrawalDate = new Date();
    nextWithdrawalDate.setDate(nextWithdrawalDate.getDate() + 7);

    return {
      withdrawalAmount: amount.toFixed(2),
      requestDate: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      bnbWalletAddress: user.bnbWalletAddress || "Not set",
      newBalance: (currentBalance - amount).toFixed(2),
      nextWithdrawalDate: nextWithdrawalDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
  }

  /**
   * Get withdrawal history data
   */
  async getWithdrawalHistory(userId: string) {
    const withdrawals = await WithdrawalRequest.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);

    if (withdrawals.length === 0) {
      return {
        historyText: "",
        hasWithdrawals: false,
      };
    }

    const historyLines = withdrawals.map((w) => {
      const statusEmoji =
        w.status === "completed" ? "✅" : w.status === "failed" ? "❌" : "🔄";
      const statusText =
        w.status === "completed"
          ? "Completed"
          : w.status === "failed"
          ? "Failed"
          : "Under Review";

      const requestDate = w.createdAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      let line = `$${w.amount.toFixed(2)} - ${statusText} ${statusEmoji}\n${requestDate}\nBNB Wallet`;

      if (w.status === "completed" && w.completedAt) {
        const completedDate = w.completedAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        line += `\nPaid: ${completedDate}`;
      }

      return line;
    });

    return {
      historyText: historyLines.join("\n\n"),
      hasWithdrawals: true,
    };
  }
}
