/**
 * ReferralRelationship schema for ChainPaye referral system
 * This schema defines the immutable connection between a referrer and referred user
 */

import mongoose, { Document, Schema } from "mongoose";

/**
 * Interface for ReferralRelationship document
 */
export interface IReferralRelationship extends Document {
  referrerId: string;
  referredUserId: string;
  referralCode: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * ReferralRelationship schema definition
 */
const ReferralRelationshipSchema: Schema = new Schema(
  {
    referrerId: {
      type: String,
      required: true,
      trim: true,
    },
    referredUserId: {
      type: String,
      required: true,
      unique: true, // Ensures one referral per user
      trim: true,
    },
    referralCode: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: false, // We manage createdAt manually
  }
);

/**
 * Indexes for efficient queries
 * Note: referredUserId unique index is already defined in the schema
 */
ReferralRelationshipSchema.index({ referrerId: 1 }); // Query all referred users
ReferralRelationshipSchema.index({ referralCode: 1 }); // Validate codes quickly

/**
 * Pre-save middleware to calculate expiresAt (30 days from createdAt)
 */
ReferralRelationshipSchema.pre<IReferralRelationship>("save", function (next) {
  if (this.isNew && !this.expiresAt) {
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    this.expiresAt = new Date(this.createdAt.getTime() + thirtyDaysInMs);
  }
  next();
});

export const ReferralRelationship = mongoose.model<IReferralRelationship>(
  "ReferralRelationship",
  ReferralRelationshipSchema
);
