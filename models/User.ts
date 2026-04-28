/**
 * User schema for ChainPaye WhatsApp bot
 * This schema defines the structure for user accounts in the system
 */

import argon2 from "argon2";
import mongoose, { Document, Schema } from "mongoose";

/**
 * Interface for User document
 */
export interface IUser extends Document {
  whatsappNumber: string;
  userId: string;
  firstName?: string; // Set during KYC verification
  lastName?: string; // Set during KYC verification
  fullName: string; // Set during onboarding, used for wallet creation
  email?: string;
  country: string;
  currency: "USD" | "NGN" | "EUR" | "GBP";
  isVerified: boolean;
  verificationCode?: string;
  verificationCodeExpires?: Date;
  pin?: string;
  dob?: string;
  referralCode?: string; // Unique referral code for this user
  referredBy?: string; // User ID of the referrer
  referredAt?: Date; // Timestamp when user was referred
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePin(candidatePin: string): Promise<boolean>;
  markVerified(): Promise<void>;
}

/**
 * User schema definition
 */
const UserSchema: Schema = new Schema(
  {
    whatsappNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\+\d{1,15}$/, // International phone number format
    },
    userId: {
      type: String,
      required: true,
      unique: true,
    },

    firstName: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    lastName: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      sparse: true, // Allows multiple null values
      unique: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2, // ISO 3166-1 alpha-2 country code
    },
    currency: {
      type: String,
      required: true,
      enum: ["USD", "NGN", "EUR", "GBP"],
      default: function () {
        // Default currency based on country
        if (this.country === "US") return "USD";
        if (this.country === "GB") return "GBP";
        return "NGN";
      },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationCode: {
      type: String,
      select: false, // Don't include in queries by default
    },
    verificationCodeExpires: {
      type: Date,
      select: false,
    },

    pin: {
      type: String,
      required: true,
      select: false, // Don't include in queries by default
    },
    dob: {
      type: String,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values, unique only when set
      trim: true,
      minlength: 6,
      maxlength: 12,
    },
    referredBy: {
      type: String,
      trim: true,
    },
    referredAt: {
      type: Date,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt
  },
);

/**
 * Index for efficient queries
 */
UserSchema.index({ whatsappNumber: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ referralCode: 1 });
UserSchema.index({ referredBy: 1 });
/**
 * Pre-save middleware to hash PIN
 */
// UserSchema.pre<IUser>("save", async function (next) {
//   // Only hash the PIN if it has been modified (or is new)
//   if (!this.isModified("pin")) return next();

//   try {
//   if(this.pin){
//       this.pin = await argon2.hash(this.pin);
//   }
//     next();
//   } catch (error) {
//     next(error as Error);
//   }
// });

/**
 * Method to compare PIN for authentication
 */
UserSchema.methods.comparePin = async function (
  candidatePin: string,
): Promise<boolean> {
  try {
    return await argon2.verify(this.pin, candidatePin);
  } catch (error) {
    return false;
  }
};

UserSchema.methods.markVerified = async function () {
  this.isVerified = true;
};

/**
 * Method to generate verification code
 */
UserSchema.methods.generateVerificationCode = function (): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.verificationCode = code;
  this.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return code;
};

/**
 * Method to check if verification code is valid
 */
UserSchema.methods.isVerificationCodeValid = function (code: string): boolean {
  if (!this.verificationCode || !this.verificationCodeExpires) {
    return false;
  }

  return (
    this.verificationCode === code && this.verificationCodeExpires > new Date()
  );
};

/**
 * Method to clear verification code
 */
UserSchema.methods.clearVerificationCode = function (): void {
  this.verificationCode = undefined;
  this.verificationCodeExpires = undefined;
};

export const User = mongoose.model<IUser>("User", UserSchema);
