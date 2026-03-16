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
import { whatsappBusinessService } from "../../services";

/**
 * Handle "referral" command
 * 
 * Displays user's referral dashboard with statistics and withdrawal option.
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

    const message = `
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

To view withdrawal history, type: *referral history*
     `.trim();

    // Send the dashboard message first
    await whatsappBusinessService.sendNormalMessage(message, user.whatsappNumber);

    // Then send the withdrawal flow if user has balance
    if (dashboard.currentBalance >= 20) {
      await whatsappBusinessService.sendReferralWithdrawalFlow(user.whatsappNumber, dashboard.currentBalance);
    }

    return ""; // Return empty since we've already sent the messages
  } catch (error) {
    if (error instanceof Error) {
      return `❌ ${error.message}`;
    }
    return "❌ Failed to load dashboard. Please try again.";
  }
}

/**
 * Handle "referral history" command
 * 
 * Shows user's withdrawal history and current status.
 * 
 * @param userId The user ID executing the command
 * @returns Promise<string> Formatted history message
 */
export async function handleReferralHistoryCommand(userId: string): Promise<string> {
  try {
    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

    const [withdrawals, currentBalance] = await Promise.all([
      withdrawalService.getWithdrawalHistory(userId),
      withdrawalService.getUserBalance(userId)
    ]);

    if (withdrawals.length === 0) {
      return `
📋 *Withdrawal History*

💰 *Current Balance:* $${currentBalance.toFixed(2)}

No withdrawal requests found.

Type *referral* to access your dashboard.
      `.trim();
    }

    let historyText = `
📋 *Withdrawal History*

💰 *Current Balance:* $${currentBalance.toFixed(2)}

*Recent Withdrawals:*
`;

    withdrawals.slice(0, 5).forEach((withdrawal, index) => {
      const date = withdrawal.requestedAt.toISOString().split('T')[0];
      const statusEmoji = withdrawal.status === 'completed' ? '✅' : 
                         withdrawal.status === 'failed' ? '❌' : '⏳';
      
      historyText += `
${index + 1}. ${statusEmoji} $${withdrawal.amount.toFixed(2)} - ${date}
   Status: ${withdrawal.status.toUpperCase()}`;
      
      if (withdrawal.status === 'completed' && withdrawal.transactionHash) {
        historyText += `
   TX: ${withdrawal.transactionHash.substring(0, 10)}...`;
      }
      
      if (withdrawal.status === 'failed' && withdrawal.failureReason) {
        historyText += `
   Reason: ${withdrawal.failureReason}`;
      }
    });

    if (withdrawals.length > 5) {
      historyText += `\n\n... and ${withdrawals.length - 5} more`;
    }

    historyText += `\n\nType *referral* to access your dashboard.`;

    return historyText.trim();
  } catch (error) {
    if (error instanceof Error) {
      return `❌ ${error.message}`;
    }
    return "❌ Failed to load withdrawal history. Please try again.";
  }
}

/**
 * Handle "withdraw [amount]" command (legacy support)
 * 
 * Redirects users to use the referral flow instead.
 * 
 * @param userId The user ID executing the command
 * @param amount The amount to withdraw
 * @returns Promise<string> Redirect message
 */
export async function handleWithdrawCommand(
  userId: string,
  amount: number
): Promise<string> {
  return `
💡 *Withdrawal Method Updated*

Referral earnings withdrawals are now processed via crypto (USDT on Base chain).

Type *referral* to access the new withdrawal flow.

✅ Instant processing
✅ Lower fees
✅ Direct to your wallet
  `.trim();
}