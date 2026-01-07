import { Types } from "mongoose";
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from "../models/Transaction";
import { CoinType, CurrencyType } from "../types/toronetService.types";

export class TransactionService {
  // Generic recordTransaction for backward compatibility
  static async recordTransaction({
    refId,
    toronetTxId,
    type,
    currency,
    status,
    amount,
    totalAmount,
    fromUser,
    toUser,
    failureReason,
    fees,
  }: {
    refId: string;
    toronetTxId: string;
    type: TransactionType;
    currency: CurrencyType;
    status: TransactionStatus;
    amount: number;
    totalAmount: number;
    fromUser: Types.ObjectId;
    toUser?: Types.ObjectId;
    failureReason?: string;
    fees?: number;
  }) {
    // Determine entry type based on transaction type
    let entryType: "DEBIT" | "CREDIT" | undefined;
    if (
      type === TransactionType.DEPOSIT ||
      type === TransactionType.CONVERSION ||
      type === TransactionType.DIRECT_TRANSFER
    ) {
      entryType = "CREDIT";
    } else if (
      type === TransactionType.TRANSFER ||
      type === TransactionType.WITHDRAWAL
    ) {
      entryType = "DEBIT";
    }

    const transaction = await Transaction.create({
      referenceId: refId,
      toronetTransactionId: toronetTxId,
      type,
      currency,
      status,
      fees: fees || (type === TransactionType.DEPOSIT ? amount * 0.015 : 0), // 1.5% fee for deposits
      amount,
      totalAmount,
      fromUser,
      ...(toUser && { toUser }),
      ...(failureReason && { failureReason }),
      ...(entryType && { entryType }),
    });

    return transaction;
  }

  // Specific functions for different transaction types
  static async recordTransfer({
    refId,
    toronetTxId,
    currency,
    status,
    amount,
    fromUser,
    toUser,
    failureReason,
  }: {
    refId: string;
    toronetTxId: string;
    currency: CurrencyType;
    status: TransactionStatus;
    amount: number;
    fromUser: Types.ObjectId;
    toUser: Types.ObjectId;
    failureReason?: string;
  }) {
    // Create DEBIT transaction for sender
    const debitParams: any = {
      refId: `${refId}_DEBIT`,
      toronetTxId,
      type: TransactionType.TRANSFER,
      currency,
      status,
      amount,
      totalAmount: amount,
      fromUser,
      toUser,
      entryType: "DEBIT",
    };

    // Create CREDIT transaction for receiver
    const creditParams: any = {
      refId: `${refId}_CREDIT`,
      toronetTxId,
      type: TransactionType.TRANSFER,
      currency,
      status,
      amount,
      totalAmount: amount,
      fromUser,
      toUser,
      entryType: "CREDIT",
    };

    if (failureReason) {
      debitParams.failureReason = failureReason;
      creditParams.failureReason = failureReason;
    }

    // Create both transactions
    const [debitTransaction, creditTransaction] = await Promise.all([
      this.recordTransaction(debitParams),
      this.recordTransaction(creditParams),
    ]);

    return {
      debit: debitTransaction,
      credit: creditTransaction,
    };
  }

  static async recordDeposit({
    refId,
    toronetTxId,
    currency,
    status,
    amount,
    fromUser,
    failureReason,
  }: {
    refId: string;
    toronetTxId: string;
    currency: CurrencyType;
    status: TransactionStatus;
    amount: number;
    fromUser: Types.ObjectId;
    failureReason?: string;
  }) {
    const params: any = {
      refId,
      toronetTxId,
      type: TransactionType.DEPOSIT,
      currency,
      status,
      amount,
      totalAmount: amount,
      fromUser,
    };

    if (failureReason) {
      params.failureReason = failureReason;
    }

    return this.recordTransaction(params);
  }

  static async recordCryptoDeposit({
    refId,
    toronetTxId,
    currency,
    status,
    amount,
    fromUser,
    failureReason,
  }: {
    refId: string;
    toronetTxId: string;
    currency: CoinType;
    status: TransactionStatus;
    amount: number;
    fromUser: Types.ObjectId;
    failureReason?: string;
  }) {
    const params: any = {
      refId,
      toronetTxId,
      type: TransactionType.OFF_RAMP,
      currency,
      status,
      amount,
      totalAmount: amount,
      fromUser,
      fees: amount * 0.01, // Flat fee for crypto deposits
    };

    if (failureReason) {
      params.failureReason = failureReason;
    }

    return this.recordTransaction(params);
  }

  static async recordWithdrawal({
    refId,
    toronetTxId,
    currency,
    status,
    amount,
    fromUser,
    failureReason,
  }: {
    refId: string;
    toronetTxId: string;
    currency: CurrencyType;
    status: TransactionStatus;
    amount: number;
    fromUser: Types.ObjectId;
    failureReason?: string;
  }) {
    const params: any = {
      refId,
      toronetTxId,
      type: TransactionType.WITHDRAWAL,
      currency,
      status,
      amount,
      totalAmount: amount,
      fromUser,
    };

    if (failureReason) {
      params.failureReason = failureReason;
    }

    return this.recordTransaction(params);
  }

  static async recordDirectTransfer({
    refId,
    toronetTxId,
    currency,
    status,
    amount,
    fromUser,
    hash,
    failureReason,
  }: {
    refId: string;
    toronetTxId: string;
    currency: CurrencyType;
    status: TransactionStatus;
    amount: number;
    fromUser: Types.ObjectId;
    hash: string;
    failureReason?: string;
  }) {
    const params: any = {
      refId,
      toronetTxId,
      type: TransactionType.DIRECT_TRANSFER,
      currency,
      status,
      amount,
      totalAmount: amount,
      fromUser,
    };

    if (failureReason) {
      params.failureReason = failureReason;
    }

    return this.recordTransaction(params);
  }

  static async recordConversion({
    refId,
    toronetTxId,
    status,
    fromUser,
    fromCurrency,
    toCurrency,
    fromAmount,
    toAmount,
    failureReason,
  }: {
    refId: string;
    toronetTxId: string;
    status: TransactionStatus;
    fromUser: Types.ObjectId;
    fromCurrency: CurrencyType;
    toCurrency: CurrencyType;
    fromAmount: number;
    toAmount: number;
    failureReason?: string;
  }) {
    const transaction = await Transaction.create({
      referenceId: refId,
      toronetTransactionId: toronetTxId,
      type: TransactionType.CONVERSION,
      currency: fromCurrency, // Use the source currency as the main currency
      status,
      amount: fromAmount,
      totalAmount: fromAmount,
      fromUser,
      fromCurrency,
      toCurrency,
      fromAmount,
      toAmount,
      ...(failureReason && { failureReason }),
    });

    return transaction;
  }
}
