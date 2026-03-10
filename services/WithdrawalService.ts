/**
 * WithdrawalService
 * 
 * Service for processing withdrawal requests from the referral system.
 * Handles validation, request creation, approval, and bank transfer processing.
 * 
 * Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6
 */

import mongoose from "mongoose";
import { WithdrawalRequest, IWithdrawalRequest, WithdrawalStatus } from "../models/WithdrawalRequest";
import { PointsRepository } from "../repositories/PointsRepository";

/**
 * Validation result for withdrawal requests
 */
export interface WithdrawalValidation {
  canWithdraw: boolean;
  reason?: string;
}

/**
 * Interface for bank transfer service (to be implemented)
 */
export interface BankTransferService {
  initiateTransfer(userId: string, amount: number): Promise<string>; // Returns transfer ID
}

/**
 * Service for managing withdrawal requests
 */
export class WithdrawalService {
  private pointsRepository: PointsRepository;
  private bankTransferService: BankTransferService | undefined;

  constructor(
    pointsRepository: PointsRepository,
    bankTransferService?: BankTransferService
  ) {
    this.pointsRepository = pointsRepository;
    this.bankTransferService = bankTransferService;
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
   * @returns Promise<IWithdrawalRequest> The created withdrawal request
   * @throws Error if validation fails
   * 
   * Validates: Requirements 5.1, 5.2, 5.3, 5.6
   */
  async requestWithdrawal(userId: string, amount: number): Promise<IWithdrawalRequest> {
    // Validate withdrawal request
    const validation = await this.canWithdraw(userId, amount);
    if (!validation.canWithdraw) {
      throw new Error(validation.reason);
    }

    // Create pending withdrawal request
    const withdrawalRequest = new WithdrawalRequest({
      userId,
      amount,
      status: WithdrawalStatus.PENDING,
      requestedAt: new Date(),
    });

    await withdrawalRequest.save();
    return withdrawalRequest;
  }

  /**
   * Approve a withdrawal request
   * 
   * Approves a withdrawal after the 24-hour delay period.
   * Updates the status to 'approved' and sets the approvedAt timestamp.
   * 
   * @param withdrawalId The withdrawal request ID to approve
   * @returns Promise<IWithdrawalRequest> The approved withdrawal request
   * @throws Error if withdrawal not found or not in pending status
   * 
   * Validates: Requirements 5.4
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

    // Update status to approved
    withdrawal.status = WithdrawalStatus.APPROVED;
    withdrawal.approvedAt = new Date();
    await withdrawal.save();

    return withdrawal;
  }

  /**
   * Process an approved withdrawal
   * 
   * This method:
   * 1. Debits points from the user's balance
   * 2. Initiates bank transfer
   * 3. Updates withdrawal status to 'completed'
   * 4. Handles failures with rollback
   * 
   * @param withdrawalId The withdrawal request ID to process
   * @returns Promise<IWithdrawalRequest> The completed withdrawal request
   * @throws Error if withdrawal not found or not in approved status
   * 
   * Validates: Requirements 5.5
   */
  async processWithdrawal(withdrawalId: string): Promise<IWithdrawalRequest> {
    const withdrawal = await WithdrawalRequest.findById(withdrawalId);

    if (!withdrawal) {
      throw new Error("Withdrawal request not found");
    }

    if (withdrawal.status !== WithdrawalStatus.APPROVED) {
      throw new Error(`Cannot process withdrawal with status: ${withdrawal.status}`);
    }

    const session = await mongoose.startSession();
    let bankTransferId: string | undefined;

    try {
      await session.withTransaction(async () => {
        // Debit points from user's balance
        await this.pointsRepository.debitPoints(
          withdrawal.userId,
          withdrawal.amount,
          withdrawalId
        );

        // Initiate bank transfer
        if (this.bankTransferService) {
          bankTransferId = await this.bankTransferService.initiateTransfer(
            withdrawal.userId,
            withdrawal.amount
          );
        } else {
          // For testing/development: simulate successful transfer
          bankTransferId = `MOCK_TRANSFER_${Date.now()}`;
        }

        // Update withdrawal status to completed
        withdrawal.status = WithdrawalStatus.COMPLETED;
        withdrawal.completedAt = new Date();
        withdrawal.bankTransferId = bankTransferId;
        await withdrawal.save({ session });
      });

      return withdrawal;
    } catch (error) {
      // Rollback: mark withdrawal as failed
      withdrawal.status = WithdrawalStatus.FAILED;
      withdrawal.failureReason = error instanceof Error ? error.message : "Unknown error";
      await withdrawal.save();

      throw new Error(`Withdrawal processing failed: ${withdrawal.failureReason}`);
    } finally {
      await session.endSession();
    }
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
