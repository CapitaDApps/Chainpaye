import { Types } from "mongoose";
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from "../models/Transaction";
import { CurrencyType } from "../types/toronetService.types";

export class TransactionService {
  static async recordTransaction({
    refId,
    toronetTxId,
    type,
    currency,
    status,
    amount,
    fromUser,
    toUser,
    failureReason,
  }: {
    refId: string;
    toronetTxId: string;
    type: TransactionType;
    currency: CurrencyType;
    status: TransactionStatus;
    amount: number;
    fromUser: Types.ObjectId;
    toUser?: Types.ObjectId;
    failureReason?: string;
  }) {
    const transaction = await Transaction.create({
      referenceId: refId,
      toronetTransactionId: toronetTxId,
      type,
      currency,
      status,
      fees: 1.5, // 1.5%
      amount,
      totalAmount: amount,
      fromUser,
      ...(toUser && { toUser }),
      ...(failureReason && { failureReason }),
    });

    return transaction;
  }
}
