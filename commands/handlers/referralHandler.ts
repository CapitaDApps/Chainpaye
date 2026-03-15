/**
 * Referral Command Handlers
 * 
 * Handlers for referral-related WhatsApp commands.
 * Includes referral dashboard and withdrawal commands.
 */

import { DashboardService } from "../../services/DashboardService";
import { WithdrawalService } from "../../services/WithdrawalService";
import { PointsRepository } from "../../repositories/PointsRepository";
import { User } from "../../models/User";

/**
 * Handle "referral" command
 * 
 * Displays user's referral dashboard with statistics.
 * 
 * @param userId The user ID executing the command
 * @returns Promise<string> Formatted dashboard message
 */
export async function handleReferralCommand(userId: string): Promise<string> {
  try {
    // Check if user has a referral code (completed KYC)
    const user = await User.findOne({ userId });
    
    if (!user?.referralCode) {
      return `
❌ *Referral Code Not Available*

You need to complete KYC verification first to get your referral code.

Type *kyc* to start verification.
      `.trim();
    }

    const dashboardService = new DashboardService();
    const dashboard = await dashboardService.getDashboard(userId);

    return `
📊 *Your Referral Dashboard*

🔗 *Referral Code:* ${dashboard.referralCode}
🔗 *Referral Link:* ${dashboard.referralLink}

👥 *Total Users Referred:* ${dashboard.totalReferred} users
💰 *Current Balance:* $${dashboard.currentBalance.toFixed(2)}
📈 *Total Earned:* $${dashboard.totalEarned.toFixed(2)}
💵 *Total Volume:* $${dashboard.totalVolume.toFixed(2)}

💡 *How it works:*
• Share your referral link with friends
• Earn 1% of offramp transaction volume from referrals
• Earnings are credited for 30 days after referred user signup
• Minimum withdrawal: $20

To withdraw earnings, type: *withdraw earnings*
     `.trim();
  } catch (error) {
    if (error instanceof Error) {
      return `❌ ${error.message}`;
    }
    return "❌ Failed to load dashboard. Please try again.";
  }
}

/**
 * Handle "withdraw [amount]" command
 * 
 * Processes withdrawal request for user's referral earnings.
 * 
 * @param userId The user ID executing the command
 * @param amount The amount to withdraw
 * @returns Promise<string> Success or error message
 */
export async function handleWithdrawCommand(
  userId: string,
  amount: number
): Promise<string> {
  try {
    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

    // Request withdrawal
    const withdrawal = await withdrawalService.requestWithdrawal(userId, amount);

    return `
✅ *Withdrawal Request Submitted*

💰 Amount: $${amount.toFixed(2)}
⏰ Status: Pending (24-hour approval period)
📅 Requested: ${withdrawal.requestedAt.toISOString().split('T')[0]}

Your withdrawal will be processed after the 24-hour security delay.
    `.trim();
  } catch (error) {
    if (error instanceof Error) {
      return `❌ ${error.message}`;
    }
    return "❌ Failed to process withdrawal request. Please try again.";
  }
}
