import { Types } from "mongoose";
import {
  BankDetails,
  Transaction,
  TransactionStatus,
  TransactionType,
} from "../models/Transaction";
import { OfframpTransaction, OfframpStatus } from "../models/OfframpTransaction";
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
    entryType,
    bankDetails,
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
    entryType: "DEBIT" | "CREDIT";
    bankDetails?: BankDetails;
  }) {
    // Determine entry type based on transaction type
    // let entryType: "DEBIT" | "CREDIT" | undefined;
    // if (
    //   type === TransactionType.DEPOSIT ||
    //   type === TransactionType.CONVERSION ||
    //   type === TransactionType.DIRECT_TRANSFER
    // ) {
    //   entryType = "CREDIT";
    // } else if (
    //   type === TransactionType.TRANSFER ||
    //   type === TransactionType.WITHDRAWAL
    // ) {
    //   entryType = "DEBIT";
    // }

    const transaction = await Transaction.create({
      referenceId: refId,
      toronetTransactionId: toronetTxId,
      type,
      currency,
      status,
      amount,
      totalAmount,
      fromUser,
      ...(fees && { fees }),
      ...(toUser && { toUser }),
      ...(failureReason && { failureReason }),
      ...(entryType && { entryType }),
      ...(bankDetails && { bankDetails }),
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
      entryType: "CREDIT",
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
    fees,
  }: {
    refId: string;
    toronetTxId: string;
    currency: CoinType;
    status: TransactionStatus;
    amount: number;
    fromUser: Types.ObjectId;
    failureReason?: string;
    fees: number;
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
      fees,
      entryType: "CREDIT",
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
    bankDetails,
  }: {
    refId: string;
    toronetTxId: string;
    currency: CurrencyType;
    status: TransactionStatus;
    amount: number;
    fromUser: Types.ObjectId;
    failureReason?: string;
    bankDetails: BankDetails;
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
      entryType: "DEBIT",
      bankDetails,
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
      entryType: "CREDIT",
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

  static async recordOfframp({
    refId,
    crossmintTxId,
    currency,
    status,
    cryptoAmount,
    ngnAmount,
    fromUser,
    bankDetails,
    exchangeRate,
    fees,
    chain,
    dexPayQuoteId,
    failureReason,
  }: {
    refId: string;
    crossmintTxId: string;
    currency: string; // USDC, USDT
    status: TransactionStatus;
    cryptoAmount: number; // USD amount of crypto
    ngnAmount: number; // NGN amount to bank
    fromUser: Types.ObjectId;
    bankDetails: BankDetails;
    exchangeRate: number; // NGN per USD
    fees: number; // USD fees
    chain: string; // solana, bsc, base, etc.
    dexPayQuoteId?: string;
    failureReason?: string;
  }) {
    const transaction = await Transaction.create({
      referenceId: refId,
      toronetTransactionId: crossmintTxId,
      type: TransactionType.OFF_RAMP,
      currency: `${currency.toUpperCase()}${chain.toUpperCase()}`, // e.g., USDCBASE, USDTBSC
      status,
      amount: ngnAmount, // NGN amount (what user receives)
      totalAmount: cryptoAmount + fees, // Total crypto spent (including fees)
      fromUser,
      bankDetails,
      exchangeRate,
      fees,
      entryType: "DEBIT", // Crypto is debited from user
      description: `Offramp ${cryptoAmount} ${currency.toUpperCase()} to ${bankDetails.bankName}`,
      ...(dexPayQuoteId && { 
        // Store DexPay quote ID in description for now, can be moved to separate field later
        description: `Offramp ${cryptoAmount} ${currency.toUpperCase()} to ${bankDetails.bankName} (DexPay: ${dexPayQuoteId})`
      }),
      ...(failureReason && { failureReason }),
    });

    return transaction;
  }

  static async updateOfframpStatus({
    referenceId,
    status,
    dexPayQuoteId,
    failureReason,
  }: {
    referenceId: string;
    status: TransactionStatus;
    dexPayQuoteId?: string;
    failureReason?: string;
  }) {
    const updateData: any = {
      status,
      ...(status === TransactionStatus.COMPLETED && { completedAt: new Date() }),
      ...(failureReason && { failureReason }),
    };

    // Update description to include DexPay quote ID if provided
    if (dexPayQuoteId) {
      const transaction = await Transaction.findOne({ referenceId });
      if (transaction && transaction.description) {
        updateData.description = transaction.description.includes('(DexPay:') 
          ? transaction.description 
          : `${transaction.description} (DexPay: ${dexPayQuoteId})`;
      }
    }

    const transaction = await Transaction.findOneAndUpdate(
      { referenceId },
      updateData,
      { new: true }
    );

    return transaction;
  }

  static async getTransactionHistory({
    userId,
    page = 1,
    limit = 20,
    status,
    type,
  }: {
    userId?: Types.ObjectId;
    page?: number;
    limit?: number;
    status?: TransactionStatus;
    type?: TransactionType;
  }) {
    const query: any = {};
    
    if (userId) {
      query.fromUser = userId;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (type) {
      query.type = type;
    }

    const skip = (page - 1) * limit;
    
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('fromUser', 'firstName lastName phone')
        .populate('toUser', 'firstName lastName phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(query)
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      }
    };
  }

  static async getTransactionByReference(referenceId: string) {
    const transaction = await Transaction.findOne({ referenceId })
      .populate('fromUser', 'firstName lastName phone')
      .populate('toUser', 'firstName lastName phone')
      .lean();

    return transaction;
  }

  static async createOfframpTransaction({
    refId,
    crossmintTxId,
    userId,
    asset,
    chain,
    cryptoAmount,
    fees,
    ngnAmount,
    exchangeRate,
    accountNumber,
    accountName,
    bankName,
    bankCode,
  }: {
    refId: string;
    crossmintTxId: string;
    userId: Types.ObjectId;
    asset: string;
    chain: string;
    cryptoAmount: number;
    fees: number;
    ngnAmount: number;
    exchangeRate: number;
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode?: string;
  }) {
    return OfframpTransaction.create({
      referenceId: refId,
      crossmintTxId,
      userId,
      asset,
      chain,
      cryptoAmount,
      fees,
      ngnAmount,
      exchangeRate,
      accountNumber,
      accountName,
      bankName,
      bankCode,
      status: OfframpStatus.PROCESSING,
    });
  }

  static async completeOfframpTransaction(referenceId: string, dexPayQuoteId: string) {
    return OfframpTransaction.findOneAndUpdate(
      { referenceId },
      { status: OfframpStatus.COMPLETED, dexPayQuoteId, completedAt: new Date() },
      { new: true }
    );
  }

  static async failOfframpTransaction(referenceId: string, reason: string) {
    return OfframpTransaction.findOneAndUpdate(
      { referenceId },
      { status: OfframpStatus.FAILED, failureReason: reason },
      { new: true }
    );
  }
}
