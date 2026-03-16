/**
 * WithdrawalService
 * 
 * Service for processing referral earnings withdrawal requests via crypto (USDT on Base).
 * Handles validation, request creation, and admin-managed completion.
 * 
 * Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6
 */

import mongoose from "mongoose";
import { WithdrawalRequest, IWithdrawalRequest, WithdrawalStatus, WithdrawalMethod } from "../models/WithdrawalRequest";
import { PointsRepository } from "../repositories/PointsRepository";
import { CrossmintService } from "./CrossmintService";

/**
 * Validation result for withdrawal requests
 */
export interface WithdrawalValidation {
  canWithdraw: boolean;
  reason?: string;
}

/**
 * Interface for creating withdrawal requests
 */
export interface CreateWithdrawalRequest {
  userId: string;
  amount: number;
  evmAddress: string;
}

/**
 * Service for managing referral earnings withdrawal requests
 */
export class WithdrawalService {
  private pointsRepository: PointsRepository;
  private crossmintService: CrossmintService;

  constructor(
    pointsRepository: PointsRepository,
    crossmintService?: CrossmintService
  ) {
    this.pointsRepository = pointsRepository;
    this.crossmintService = crossmintService!;
  }

  /**
   * Validate if a user can withdraw the specified amount
   * 
   * Checks:
   * 1. User has at least $20 in their balance
   * 2. User has not made a withdrawal request in the past 7 days
   * 
   * @param userId The user ID requesting withdrawal
   * @param amount The amount to withdraw
   * @returns Promise<WithdrawalValidation> Validation result with reason if invalid
   * 
   * Validates: Requirements 5.1, 5.2, 5.6
   */
  async canWithdraw(userId: string, amount: number): Promise<WithdrawalValidation> {
    // Check minimum withdrawal amount ($20)
    if (amount < 20) {
      return {
        canWithdraw: false,
        reason: `Minimum withdrawal amount is $20. Requested amount: $${amount}`,
      };
    }

    // Check user has sufficient balance
    const currentBalance = await this.pointsRepository.getBalance(userId);
    if (currentBalance < amount) {
      return {
        canWithdraw: false,
        reason: `Insufficient balance. Your current balance is $${currentBalance}.`,
      };
    }

    // Check withdrawal frequency (once per 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentWithdrawal = await WithdrawalRequest.findOne({
      userId,
      requestedAt: { $gte: sevenDaysAgo },
    }).sort({ requestedAt: -1 });

    if (recentWithdrawal) {
      const lastWithdrawalDate = recentWithdrawal.requestedAt.toISOString().split('T')[0];
      return {
        canWithdraw: false,
        reason: `You can only withdraw once per week. Your last withdrawal was on ${lastWithdrawalDate}.`,
      };
    }

    return { canWithdraw: true };
  }

  /**
   * Request a withdrawal
   * 
   * Creates a pending withdrawal request after validation.
   * The withdrawal will be approved after 24 hours.
   * 
   * @param userId The user ID requesting withdrawal
   * @param amount The amount to withdraw
   * @param evmAddress The user's EVM wallet address
   * @param chain The blockchain network (default: "base")
   * @param token The token to receive (default: "USDT")
   * @returns Promise<IWithdrawalRequest> The created withdrawal request
   * @throws Error if validation fails
   * 
   * Validates: Requirements 5.1, 5.2, 5.3, 5.6
   */
  async requestWithdrawal(
    userId: string,
    amount: number,
    evmAddress: string,
    chain: string = "base",
    token: string = "USDT"
  ): Promise<IWithdrawalRequest> {
    // Validate withdrawal request
    const validation = await this.canWithdraw(userId, amount);
    if (!validation.canWithdraw) {
      throw new Error(validation.reason);
    }

    // Create pending withdrawal request
    const withdrawalRequest = new WithdrawalRequest({
      userId,
      amount,
      evmAddress,
      chain,
      token,
      method: WithdrawalMethod.CRYPTO,
      status: WithdrawalStatus.PENDING,
      requestedAt: new Date(),
    });

    await withdrawalRequest.save();
    return withdrawalRequest;
  }

  /**
   * Approve a withdrawal request (admin action)
   *
   * Marks a pending withdrawal as completed after the 24-hour delay period.
   *
   * @param withdrawalId The withdrawal request ID to approve
   * @returns Promise<IWithdrawalRequest> The approved withdrawal request
   * @throws Error if withdrawal not found or not in pending status
   */
  async approveWithdrawal(withdrawalId: string): Promise<IWithdrawalRequest> {
    const withdrawal = await WithdrawalRequest.findById(withdrawalId);

    if (!withdrawal) {
      throw new Error("Withdrawal request not found");
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new Error(`Cannot approve withdrawal with status: ${withdrawal.status}`);
    }

    // Check if 24 hours have passed
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    if (withdrawal.requestedAt > twentyFourHoursAgo) {
      throw new Error("Withdrawal cannot be approved before 24-hour delay period");
    }

    withdrawal.status = WithdrawalStatus.COMPLETED;
    withdrawal.completedAt = new Date();
    await withdrawal.save();

    return withdrawal;
  }

  /**
   * Process an approved withdrawal
   *
   * Debits points from the user's balance and marks the withdrawal as completed.
   *
   * @param withdrawalId The withdrawal request ID to process
   * @returns Promise<IWithdrawalRequest> The completed withdrawal request
   * @throws Error if withdrawal not found or not in pending status
   */
  async processWithdrawal(withdrawalId: string): Promise<IWithdrawalRequest> {
    const withdrawal = await WithdrawalRequest.findById(withdrawalId);

    if (!withdrawal) {
      throw new Error("Withdrawal request not found");
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new Error(`Cannot process withdrawal with status: ${withdrawal.status}`);
    }

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        // Debit points from user's balance
        await this.pointsRepository.debitPoints(
          withdrawal.userId,
          withdrawal.amount,
          withdrawalId
        );

        withdrawal.status = WithdrawalStatus.COMPLETED;
        withdrawal.completedAt = new Date();
        await withdrawal.save({ session });
      });

      return withdrawal;
    } catch (error) {
      withdrawal.status = WithdrawalStatus.FAILED;
      withdrawal.failureReason = error instanceof Error ? error.message : "Unknown error";
      await withdrawal.save();
      throw new Error(`Withdrawal processing failed: ${withdrawal.failureReason}`);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get current balance for a user
   */
  async getUserBalance(userId: string): Promise<number> {
    return this.pointsRepository.getBalance(userId);
  }

  /**
   * Get withdrawal history for a user
   * 
   * @param userId The user ID to query
   * @returns Promise<IWithdrawalRequest[]> Array of withdrawal requests
   */
  async getWithdrawalHistory(userId: string): Promise<IWithdrawalRequest[]> {
    return WithdrawalRequest.find({ userId }).sort({ requestedAt: -1 });
  }

  /**
   * Get pending withdrawals ready for approval (24+ hours old)
   * 
   * @returns Promise<IWithdrawalRequest[]> Array of pending withdrawals ready for approval
   */
  async getPendingWithdrawalsForApproval(): Promise<IWithdrawalRequest[]> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    return WithdrawalRequest.find({
      status: WithdrawalStatus.PENDING,
      requestedAt: { $lte: twentyFourHoursAgo },
    });
  }
}
