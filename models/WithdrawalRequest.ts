/**
 * WithdrawalRequest schema for ChainPaye referral system
 * This schema maintains an audit trail of all withdrawal requests
 * Validates: Requirements 5.3, 9.5
 */

import mongoose, { Document, Schema } from "mongoose";

/**
 * Withdrawal request status enum
 */
export enum WithdrawalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * Interface for WithdrawalRequest document
 */
export interface IWithdrawalRequest extends Document {
  userId: string;
  amount: number;
  status: WithdrawalStatus;
  requestedAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  failureReason?: string;
  bankTransferId?: string;
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
      min: 100, // Minimum withdrawal amount is $100
      description: "Amount to withdraw in USD (points)",
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
    approvedAt: {
      type: Date,
      description: "When the withdrawal was approved (after 24-hour delay)",
    },
    completedAt: {
      type: Date,
      description: "When the withdrawal was completed and bank transfer succeeded",
    },
    failureReason: {
      type: String,
      trim: true,
      description: "Reason for withdrawal failure if status is 'failed'",
    },
    bankTransferId: {
      type: String,
      trim: true,
      description: "Reference to the bank transfer transaction",
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
