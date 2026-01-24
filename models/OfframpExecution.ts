import mongoose, { Schema, Document } from "mongoose";

export type OfframpStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface IOfframpExecution extends Document {
  executionId: string;
  userId: string;
  flowToken: string;
  ngnAmount: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  blockchain: "SOL" | "BSC";
  custodialWalletAddress: string;
  quoteId: string;
  quoteRate: number;
  quoteDetails: any;
  usdAmount: string;
  platformFee: string;
  dexpayFee: string;
  totalUsd: string;
  txHashes: {
    platformFeeTx?: string;
    dexpayTx?: string;
  };
  dexpayExecutionResponse?: any;
  status: OfframpStatus;
  createdAt: Date;
  updatedAt: Date;
}

const OfframpExecutionSchema: Schema = new Schema(
  {
    executionId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    flowToken: { type: String, required: true },
    ngnAmount: { type: Number, required: true },
    bankCode: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true },
    blockchain: { type: String, enum: ["SOL", "BSC"], required: true },
    custodialWalletAddress: { type: String, required: true },
    quoteId: { type: String, required: true },
    quoteRate: { type: Number, required: true },
    quoteDetails: { type: Schema.Types.Mixed, required: true },
    usdAmount: { type: String, required: true },
    platformFee: { type: String, required: true },
    dexpayFee: { type: String, required: true },
    totalUsd: { type: String, required: true },
    txHashes: {
      platformFeeTx: { type: String },
      dexpayTx: { type: String },
    },
    dexpayExecutionResponse: { type: Schema.Types.Mixed },
    status: { type: String, enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"], default: "PENDING" },
  },
  { timestamps: true }
);

export const OfframpExecution = mongoose.model<IOfframpExecution>("OfframpExecution", OfframpExecutionSchema);
export default OfframpExecution;