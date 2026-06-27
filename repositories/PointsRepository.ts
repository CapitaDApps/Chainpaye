/**
 * PointsRepository
 * 
 * Repository for managing user point balances and transactions.
 * Provides atomic operations for crediting/debiting points and maintains audit trail.
 * 
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5
 */

import mongoose from "mongoose";
import { PointsBalance, IPointsBalance } from "../models/PointsBalance";
import { EarningsTransaction, IEarningsTransaction } from "../models/EarningsTransaction";

/**
 * Interface for earnings history records
 */
export interface EarningsRecord {
  userId: string;
  amount: number;
  transactionId: string;
  timestamp: Date;
  type: 'credit' | 'debit';
}

/**
 * Repository for point balance operations
 */
export class PointsRepository {
  /**
   * Get current balance for a user
   * 
   * @param userId The user ID to query
   * @returns Promise<number> The current balance (0 if no balance record exists)
   * 
   * Validates: Requirements 4.2
   */
  async getBalance(userId: string): Promise<number> {
    const pointsBalance = await PointsBalance.findOne({ userId });
    return pointsBalance?.currentBalance ?? 0;
  }

  /**
   * Get total earned points for a user
   * 
   * @param userId The user ID to query
   * @returns Promise<number> The total earned points (0 if no balance record exists)
   * 
   * Validates: Requirements 4.4
   */
  async getTotalEarned(userId: string): Promise<number> {
    const pointsBalance = await PointsBalance.findOne({ userId });
    return pointsBalance?.totalEarned ?? 0;
  }

  /**
   * Credit points to a user's balance atomically
   * 
   * This method:
   * 1. Creates a points balance record if it doesn't exist
   * 2. Increments both currentBalance and totalEarned
   * 3. Creates an earnings transaction record for audit trail
   * 4. Uses MongoDB transactions to ensure atomicity
   * 
   * @param userId The user ID to credit points to
   * @param amount The amount of points to credit
   * @param transactionId The transaction ID for audit trail
   * @returns Promise<void>
   * 
   * Validates: Requirements 4.2, 9.4
   */
  async creditPoints(userId: string, amount: number, transactionId: string): Promise<void> {
    if (amount <= 0) {
      throw new Error("Credit amount must be positive");
    }

    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Find or create points balance
        let pointsBalance = await PointsBalance.findOne({ userId }).session(session);

        if (!pointsBalance) {
          pointsBalance = new PointsBalance({
            userId,
            currentBalance: 0,
            totalEarned: 0,
          });
        }

        // Update balances
        pointsBalance.currentBalance += amount;
        pointsBalance.totalEarned += amount;
        await pointsBalance.save({ session });

        // Create earnings transaction record for audit trail
        const earningsTransaction = new EarningsTransaction({
          userId,
          referredUserId: '', // Will be set by caller if applicable
          offrampTransactionId: transactionId,
          amount,
          feeAmount: 0, // Will be set by caller if applicable
          transactionAmount: 0, // Will be set by caller if applicable
          timestamp: new Date(),
        });
        await earningsTransaction.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Debit points from a user's balance atomically with validation
   * 
   * This method:
   * 1. Validates the user has sufficient balance
   * 2. Prevents negative balances
   * 3. Decrements currentBalance (but not totalEarned)
   * 4. Uses MongoDB transactions to ensure atomicity
   * 
   * @param userId The user ID to debit points from
   * @param amount The amount of points to debit
   * @param withdrawalId The withdrawal ID for audit trail
   * @returns Promise<void>
   * @throws Error if insufficient balance or balance would become negative
   * 
   * Validates: Requirements 4.3, 4.5
   */
  async debitPoints(userId: string, amount: number, withdrawalId: string): Promise<void> {
    if (amount <= 0) {
      throw new Error("Debit amount must be positive");
    }

    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Find points balance
        const pointsBalance = await PointsBalance.findOne({ userId }).session(session);

        if (!pointsBalance) {
          throw new Error("Points balance not found for user");
        }

        // Validate sufficient balance
        if (pointsBalance.currentBalance < amount) {
          throw new Error(
            `Insufficient balance. Current: ${pointsBalance.currentBalance}, Required: ${amount}`
          );
        }

        // Deduct from current balance (totalEarned remains unchanged)
        pointsBalance.currentBalance -= amount;

        // Additional safety check to prevent negative balance
        if (pointsBalance.currentBalance < 0) {
          throw new Error("Operation would result in negative balance");
        }

        await pointsBalance.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get earnings history for a user
   * 
   * Returns all earnings transactions (credits) for the user, sorted by timestamp descending.
   * 
   * @param userId The user ID to query
   * @returns Promise<EarningsRecord[]> Array of earnings records
   * 
   * Validates: Requirements 9.4
   */
  async getEarningsHistory(userId: string): Promise<EarningsRecord[]> {
    const transactions = await EarningsTransaction.find({ userId })
      .sort({ timestamp: -1 })
      .lean();

    return transactions.map((tx) => ({
      userId: tx.userId,
      amount: tx.amount,
      transactionId: tx.offrampTransactionId,
      timestamp: tx.timestamp,
      type: 'credit' as const,
    }));
  }
}
