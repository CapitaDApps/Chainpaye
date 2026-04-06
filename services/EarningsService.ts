/**
 * EarningsService
 * 
 * Manages referral earnings calculation and point crediting for the ChainPaye referral system.
 * Handles transaction fee calculation, referrer earnings computation, and atomic point updates.
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 9.3, 9.4
 */

import mongoose from "mongoose";
import { ReferralService } from "./ReferralService";
import { PointsBalance } from "../models/PointsBalance";
import { EarningsTransaction } from "../models/EarningsTransaction";

/**
 * Interface for offramp transaction data
 */
export interface OfframpTransaction {
  id: string;
  userId: string;
  amount: number;
  sellAmountUsd: number; // USD value of crypto being sold (with spread)
  timestamp: Date;
}

/**
 * Service for calculating and processing referral earnings
 */
export class EarningsService {
  private referralService: ReferralService;
  private static readonly REFERRAL_PERCENTAGE = 0.01; // 1% of transaction volume

  constructor() {
    this.referralService = new ReferralService();
  }

  /**
   * Calculate referrer earnings (1% of offramp volume)
   * 
   * @param sellAmountUsd The USD value of crypto being sold (with spread included)
   * @returns number The earnings amount (1% of sellAmountUsd)
   * 
   * Validates: Requirements 3.1, 3.2
   */
  calculateReferrerEarnings(sellAmountUsd: number): number {
    return sellAmountUsd * EarningsService.REFERRAL_PERCENTAGE;
  }

  /**
   * Process transaction earnings for a referral relationship
   * 
   * This method:
   * 1. Checks if the user has a referral relationship
   * 2. Validates the relationship is within the 30-day earning period
   * 3. Calculates earnings (1% of offramp volume)
   * 4. Credits earnings to the referrer atomically using MongoDB transactions
   * 5. Logs the earnings transaction for audit trail
   * 
   * @param transaction The offramp transaction to process
   * @returns Promise<void>
   * 
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 9.3, 9.4
   */
  async processTransactionEarnings(transaction: OfframpTransaction): Promise<void> {
    // Check if user has a referral relationship
    const relationship = await this.referralService.getReferralRelationship(transaction.userId);
    
    if (!relationship) {
      // No referral relationship, nothing to process
      return;
    }

    // Check if within 30-day earning period
    if (!this.referralService.isWithinReferralPeriod(relationship)) {
      // Outside earning period, no earnings to credit
      return;
    }

    // Calculate earnings (1% of offramp volume)
    const earnings = this.calculateReferrerEarnings(transaction.sellAmountUsd);

    // Credit points atomically using MongoDB transactions
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Find or create points balance for referrer
        let pointsBalance = await PointsBalance.findOne({ 
          userId: relationship.referrerId 
        }).session(session);

        if (!pointsBalance) {
          // Create new points balance if doesn't exist
          pointsBalance = new PointsBalance({
            userId: relationship.referrerId,
            currentBalance: 0,
            totalEarned: 0,
          });
        }

        // Update balances
        pointsBalance.currentBalance += earnings;
        pointsBalance.totalEarned += earnings;
        await pointsBalance.save({ session });

        // Log earnings transaction for audit trail
        const earningsTransaction = new EarningsTransaction({
          userId: relationship.referrerId,
          referredUserId: transaction.userId,
          offrampTransactionId: transaction.id,
          amount: earnings,
          feeAmount: earnings, // 1% of transaction volume
          transactionAmount: transaction.amount,
          timestamp: transaction.timestamp,
        });
        await earningsTransaction.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }
}

