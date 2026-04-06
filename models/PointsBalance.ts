/**
 * PointsBalance schema for ChainPaye referral system
 * This schema tracks user point balances and earnings
 * 1 point = 1 USD
 */

import mongoose, { Document, Schema } from "mongoose";

/**
 * Interface for PointsBalance document
 */
export interface IPointsBalance extends Document {
  userId: string;
  currentBalance: number;
  totalEarned: number;
  lastUpdated: Date;
}

/**
 * PointsBalance schema definition
 */
const PointsBalanceSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true, // One balance per user
      trim: true,
    },
    currentBalance: {
      type: Number,
      required: true,
      default: 0,
      min: 0, // Prevent negative balances
    },
    totalEarned: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lastUpdated: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: false, // We manage lastUpdated manually
  }
);

/**
 * Indexes for efficient queries
 * Note: userId unique index is already defined in the schema
 */
PointsBalanceSchema.index({ totalEarned: -1 }); // Leaderboard queries (descending)

/**
 * Pre-save middleware to update lastUpdated timestamp
 */
PointsBalanceSchema.pre<IPointsBalance>("save", function (next) {
  this.lastUpdated = new Date();
  next();
});

/**
 * Validation to ensure totalEarned >= currentBalance
 * This maintains the invariant that total earned should always be >= current balance
 */
PointsBalanceSchema.pre<IPointsBalance>("save", function (next) {
  if (this.totalEarned < this.currentBalance) {
    next(new Error("Total earned cannot be less than current balance"));
  } else {
    next();
  }
});

export const PointsBalance = mongoose.model<IPointsBalance>(
  "PointsBalance",
  PointsBalanceSchema
);
