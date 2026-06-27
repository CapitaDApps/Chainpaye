/**
 * WithdrawalRequest schema for ChainPaye referral system
 * This schema maintains an audit trail of all referral earnings withdrawal requests
 * Updated for crypto withdrawals (USDT on Base chain)
 * Validates: Requirements 5.3, 9.5
 */

import mongoose, { Document, Schema } from "mongoose";

/**
 * Withdrawal request status enum
 */
export enum WithdrawalStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * Withdrawal method enum
 */
export enum WithdrawalMethod {
  CRYPTO = "crypto",
}

/**
 * Interface for WithdrawalRequest document
 */
export interface IWithdrawalRequest extends Document {
  userId: string;
  amount: number;
  method: WithdrawalMethod;
  evmAddress: string;
  chain: string;
  token: string;
  status: WithdrawalStatus;
  requestedAt: Date;
  completedAt?: Date;
  failureReason?: string;
  transactionHash?: string;
  adminNotes?: string;
}

/**
 * WithdrawalRequest schema definition
 */
const WithdrawalRequestSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
      description: "The user requesting the withdrawal",
    },
    amount: {
      type: Number,
      required: true,
      min: 20, // Minimum withdrawal amount is $20
      description: "Amount to withdraw in USD (points)",
    },
    method: {
      type: String,
      required: true,
      enum: Object.values(WithdrawalMethod),
      default: WithdrawalMethod.CRYPTO,
      description: "Withdrawal method (crypto only for referral earnings)",
    },
    evmAddress: {
      type: String,
      required: true,
      trim: true,
      description: "User's EVM wallet address for receiving USDT",
    },
    chain: {
      type: String,
      required: true,
      trim: true,
      default: "base",
      description: "Blockchain network (Base)",
    },
    token: {
      type: String,
      required: true,
      trim: true,
      default: "USDT",
      description: "Token to receive (USDT)",
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(WithdrawalStatus),
      default: WithdrawalStatus.PENDING,
      description: "Current status of the withdrawal request",
    },
    requestedAt: {
      type: Date,
      required: true,
      default: Date.now,
      description: "When the withdrawal was requested",
    },
    completedAt: {
      type: Date,
      description: "When the withdrawal was completed and funds sent",
    },
    failureReason: {
      type: String,
      trim: true,
      description: "Reason for withdrawal failure if status is 'failed'",
    },
    transactionHash: {
      type: String,
      trim: true,
      description: "Blockchain transaction hash for completed withdrawals",
    },
    adminNotes: {
      type: String,
      trim: true,
      description: "Admin notes for internal tracking",
    },
  },
  {
    timestamps: false, // We manage timestamps manually
  }
);

/**
 * Indexes for efficient queries
 */
WithdrawalRequestSchema.index({ userId: 1 }); // Query user's withdrawal history
WithdrawalRequestSchema.index({ status: 1 }); // Find pending withdrawals
WithdrawalRequestSchema.index({ requestedAt: -1 }); // Check withdrawal frequency (descending)

export const WithdrawalRequest = mongoose.model<IWithdrawalRequest>(
  "WithdrawalRequest",
  WithdrawalRequestSchema
);
