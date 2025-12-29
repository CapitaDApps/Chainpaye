/**
 * Transaction schema for ChainPaye WhatsApp bot
 * This schema defines the structure for payment and transfer transactions
 */

import mongoose, { Schema, Document } from "mongoose";
import { IUser } from "./User";

/**
 * Transaction types
 */
export enum TransactionType {
  PAYMENT = "payment",
  TRANSFER = "transfer",
  DEPOSIT = "deposit",
  WITHDRAWAL = "withdrawal",
  DIRECT_TRANSFER = "direct_transfer",
  CONVERSION = "conversion",
}

/**
 * Transaction status
 */
export enum TransactionStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

/**
 * Interface for Transaction document
 */
export interface ITransaction extends Document {
  referenceId: string;
  type: TransactionType;
  status: TransactionStatus;
  fromUser?: mongoose.Types.ObjectId | IUser;
  toUser?: mongoose.Types.ObjectId;
  amount: number;
  currency: "USD" | "NGN";
  description?: string;
  toronetTransactionId?: string;
  bankDetails?: {
    accountNumber: string;
    accountName: string;
    bankName: string;
    routingNumber?: string;
  };
  exchangeRate?: number;
  fees?: number;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  failureReason?: string;
  hash?: string;
  // Fields for conversion transactions
  fromCurrency?: "USD" | "NGN";
  toCurrency?: "USD" | "NGN";
  fromAmount?: number;
  toAmount?: number;
  markAsCompleted: (toronetTransactionId?: string) => void;
}

/**
 * Transaction schema definition
 */
const TransactionSchema: Schema = new Schema(
  {
    referenceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: function () {
        return (
          "TXN" +
          Date.now() +
          Math.random().toString(36).substr(2, 9).toUpperCase()
        );
      },
    },
    type: {
      type: String,
      required: true,
      enum: Object.values(TransactionType),
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.PENDING,
      trim: true,
    },
    fromUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.type !== TransactionType.DIRECT_TRANSFER;
      },
    },
    toUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.type === TransactionType.TRANSFER;
      },
    },
    hash: {
      type: String,
      trim: true,
      required: function () {
        return (
          (this.type as unknown as TransactionType) ===
          TransactionType.DIRECT_TRANSFER
        );
      },
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      required: true,
      enum: ["USD", "NGN"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 255,
    },
    toronetTransactionId: {
      type: String,
      trim: true,
      required: true,
    },
    bankDetails: {
      type: Object,
      default: {},
    },
    exchangeRate: {
      type: Number,
      min: 0,
    },
    // Fields for conversion transactions
    fromCurrency: {
      type: String,
      enum: ["USD", "NGN"],
      required: false,
    },
    toCurrency: {
      type: String,
      enum: ["USD", "NGN"],
      required: false,
    },
    fromAmount: {
      type: Number,
      min: 0,
      required: false,
    },
    toAmount: {
      type: Number,
      min: 0,
      required: false,
    },
    fees: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    completedAt: {
      type: Date,
    },
    failureReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt
  }
);

/**
 * Indexes for efficient queries
 */
TransactionSchema.index({ referenceId: 1 });
TransactionSchema.index({ fromUser: 1, createdAt: -1 });
TransactionSchema.index({ toUser: 1, createdAt: -1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ type: 1 });
TransactionSchema.index({ toronetTransactionId: 1 });

/**
 * Pre-save middleware to calculate total amount
 */
TransactionSchema.pre<ITransaction>("save", function (next) {
  if (this.isModified("amount") || this.isModified("fees")) {
    this.totalAmount = this.amount + (this.fees || 0);
  }
  next();
});

/**
 * Method to mark transaction as completed
 */
TransactionSchema.methods.markAsCompleted = function (
  toronetTransactionId?: string
): void {
  this.status = TransactionStatus.COMPLETED;
  this.completedAt = new Date();
  if (toronetTransactionId) {
    this.toronetTransactionId = toronetTransactionId;
  }
};

/**
 * Method to mark transaction as failed
 */
TransactionSchema.methods.markAsFailed = function (reason: string): void {
  this.status = TransactionStatus.FAILED;
  this.failureReason = reason;
};

/**
 * Method to check if transaction can be cancelled
 */
TransactionSchema.methods.canBeCancelled = function (): boolean {
  return (
    this.status === TransactionStatus.PENDING ||
    this.status === TransactionStatus.PROCESSING
  );
};

/**
 * Method to cancel transaction
 */
TransactionSchema.methods.cancel = function (reason?: string): void {
  if (!this.canBeCancelled()) {
    throw new Error("Transaction cannot be cancelled in current status");
  }
  this.status = TransactionStatus.CANCELLED;
  if (reason) {
    this.failureReason = reason;
  }
};

/**
 * Virtual for formatted total amount
 */
TransactionSchema.virtual("formattedTotalAmount").get(function () {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(this.currency),
  }).format(Number(this.totalAmount));
});

export const Transaction = mongoose.model<ITransaction>(
  "Transaction",
  TransactionSchema
);
