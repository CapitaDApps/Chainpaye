/**
 * User schema for ChainPaye WhatsApp bot
 * This schema defines the structure for user accounts in the system
 */

import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

/**
 * Interface for User document
 */
export interface IUser extends Document {
  whatsappNumber: string;
  fullName: string;
  email?: string;
  country: string;
  currency: "USD" | "NGN";
  isVerified: boolean;
  verificationCode?: string;
  verificationCodeExpires?: Date;
  toronetWalletId?: string;
  pin?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePin(candidatePin: string): Promise<boolean>;
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
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
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
      enum: ["USD", "NGN"],
      default: function () {
        // Default currency based on country
        return this.country === "US" ? "USD" : "NGN";
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
    toronetWallet: {
      type: Schema.Types.ObjectId,
      unique: true,
      ref: "Wallet",
    },
    pin: {
      type: String,
      required: false,
      minlength: 4,
      maxlength: 6,
      select: false, // Don't include in queries by default
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt
  }
);

/**
 * Index for efficient queries
 */
UserSchema.index({ whatsappNumber: 1 });
UserSchema.index({ toronetWallet: 1 });
UserSchema.index({ email: 1 });

/**
 * Pre-save middleware to hash PIN
 */
UserSchema.pre<IUser>("save", async function (next) {
  // Only hash the PIN if it has been modified (or is new)
  if (!this.isModified("pin")) return next();

  try {
    // Hash PIN with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.pin = await bcrypt.hash(String(this.pin), salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

/**
 * Method to compare PIN for authentication
 */
UserSchema.methods.comparePin = async function (
  candidatePin: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePin, this.pin);
  } catch (error) {
    return false;
  }
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
