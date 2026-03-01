/**
 * EarningsTransaction schema for ChainPaye referral system
 * This schema maintains an audit trail of all referral earnings transactions
 * Validates: Requirements 9.4
 */

import mongoose, { Document, Schema } from "mongoose";

/**
 * Interface for EarningsTransaction document
 */
export interface IEarningsTransaction extends Document {
  userId: string;
  referredUserId: string;
  offrampTransactionId: string;
  amount: number;
  feeAmount: number;
  transactionAmount: number;
  timestamp: Date;
}

/**
 * EarningsTransaction schema definition
 */
const EarningsTransactionSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
      description: "The referrer who earned the points",
    },
    referredUserId: {
      type: String,
      required: true,
      trim: true,
      description: "The user who generated the transaction",
    },
    offrampTransactionId: {
      type: String,
      required: true,
      trim: true,
      description: "Reference to the offramp transaction that generated earnings",
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      description: "Points earned by the referrer (25% of fee)",
    },
    feeAmount: {
      type: Number,
      required: true,
      min: 0,
      description: "Original transaction fee (1.5% of transaction amount)",
    },
    transactionAmount: {
      type: Number,
      required: true,
      min: 0,
      description: "Original offramp transaction amount",
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      description: "When the earnings were credited",
    },
  },
  {
    timestamps: false, // We manage timestamp manually
  }
);

/**
 * Indexes for efficient queries
 */
EarningsTransactionSchema.index({ userId: 1 }); // Query user's earnings history
EarningsTransactionSchema.index({ referredUserId: 1 }); // Track referred user's generated earnings
EarningsTransactionSchema.index({ timestamp: -1 }); // Time-based queries (descending)

export const EarningsTransaction = mongoose.model<IEarningsTransaction>(
  "EarningsTransaction",
  EarningsTransactionSchema
);
