import mongoose, { Schema, Document } from "mongoose";

export enum OfframpStatus {
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface IOfframpTransaction extends Document {
  referenceId: string;
  crossmintTxId: string;
  userId: mongoose.Types.ObjectId;
  asset: string;         // USDC, USDT
  chain: string;         // base, bsc, solana, etc.
  cryptoAmount: number;  // USD value of crypto sent
  fees: number;          // flat fee in USD
  ngnAmount: number;     // NGN amount to bank
  exchangeRate: number;  // NGN per USD
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode?: string;
  dexPayQuoteId?: string;
  status: OfframpStatus;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

const OfframpTransactionSchema = new Schema<IOfframpTransaction>(
  {
    referenceId: { type: String, required: true, unique: true, trim: true },
    crossmintTxId: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    asset: { type: String, required: true, trim: true },
    chain: { type: String, required: true, trim: true },
    cryptoAmount: { type: Number, required: true },
    fees: { type: Number, required: true, default: 0 },
    ngnAmount: { type: Number, required: true },
    exchangeRate: { type: Number, required: true },
    accountNumber: { type: String, required: true, trim: true },
    accountName: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    bankCode: { type: String, trim: true },
    dexPayQuoteId: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(OfframpStatus),
      default: OfframpStatus.PROCESSING,
    },
    failureReason: { type: String, trim: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

OfframpTransactionSchema.index({ referenceId: 1 });
OfframpTransactionSchema.index({ userId: 1, createdAt: -1 });
OfframpTransactionSchema.index({ status: 1 });

export const OfframpTransaction = mongoose.model<IOfframpTransaction>(
  "OfframpTransaction",
  OfframpTransactionSchema
);
