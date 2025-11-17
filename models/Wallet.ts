/**
 * Wallet schema for ChainPaye WhatsApp bot
 * This schema defines the structure for user wallets linked to Toronet
 */

import mongoose, { Schema, Document } from "mongoose";

/**
 * Stablecoin types
 */
export enum StablecoinType {
  TORO_USD = "ToroUSD",
  TORO_NGN = "ToroNGN",
}

/**
 * Interface for Wallet document
 */
export interface IWallet extends Document {
  user: mongoose.Types.ObjectId;
  toronetWalletId: string;
  publicKey: string;
  password: string; // Encrypted
  balances: {
    [key in StablecoinType]: number;
  };
  isActive: boolean;
  isFrozen: boolean;
  freezeReason?: string;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  updateBalance(coinType: StablecoinType, amount: number): void;
  getBalance(coinType: StablecoinType): number;
  freeze(reason?: string): void;
  unfreeze(): void;
}

/**
 * Wallet schema definition
 */
const WalletSchema: Schema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    toronetWalletId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    publicKey: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      trim: true,
      select: false, // Don't include in queries by default for security
    },
    balances: {
      [StablecoinType.TORO_USD]: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      [StablecoinType.TORO_NGN]: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    isFrozen: {
      type: Boolean,
      required: true,
      default: false,
    },
    freezeReason: {
      type: String,
      trim: true,
      maxlength: 255,
    },
    lastSyncAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt
  }
);

/**
 * Indexes for efficient queries
 */
WalletSchema.index({ user: 1 });
WalletSchema.index({ toronetWalletId: 1 });
WalletSchema.index({ publicKey: 1 });

/**
 * Method to update wallet balance
 */
WalletSchema.methods.updateBalance = function (
  coinType: StablecoinType,
  amount: number
): void {
  if (amount < 0) {
    throw new Error("Amount cannot be negative");
  }

  this.balances[coinType] = amount;
  this.lastSyncAt = new Date();
};

/**
 * Method to get wallet balance for a specific coin
 */
WalletSchema.methods.getBalance = function (coinType: StablecoinType): number {
  return this.balances[coinType] || 0;
};

/**
 * Method to get total balance in USD equivalent
 */
WalletSchema.methods.getTotalBalanceInUSD = function (): number {
  // TODO: Implement exchange rate calculation
  // For now, assuming 1 USD = 750 NGN
  const NGN_TO_USD_RATE = 1 / 750;
  const usdBalance = this.balances[StablecoinType.TORO_USD];
  const ngnBalanceInUSD =
    this.balances[StablecoinType.TORO_NGN] * NGN_TO_USD_RATE;

  return usdBalance + ngnBalanceInUSD;
};

/**
 * Method to freeze wallet
 */
WalletSchema.methods.freeze = function (reason?: string): void {
  this.isFrozen = true;
  if (reason) {
    this.freezeReason = reason;
  }
};

/**
 * Method to unfreeze wallet
 */
WalletSchema.methods.unfreeze = function (): void {
  this.isFrozen = false;
  this.freezeReason = undefined;
};

/**
 * Method to check if wallet can perform transactions
 */
WalletSchema.methods.canTransact = function (): boolean {
  return this.isActive && !this.isFrozen;
};

/**
 * Method to check if wallet has sufficient balance
 */
WalletSchema.methods.hasSufficientBalance = function (
  coinType: StablecoinType,
  amount: number
): boolean {
  return this.balances[coinType] >= amount;
};

/**
 * Method to deduct balance
 */
WalletSchema.methods.deductBalance = function (
  coinType: StablecoinType,
  amount: number
): void {
  if (!this.hasSufficientBalance(coinType, amount)) {
    throw new Error("Insufficient balance");
  }

  this.balances[coinType] -= amount;
  this.lastSyncAt = new Date();
};

/**
 * Method to add balance
 */
WalletSchema.methods.addBalance = function (
  coinType: StablecoinType,
  amount: number
): void {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  this.balances[coinType] += amount;
  this.lastSyncAt = new Date();
};

/**
 * Virtual for formatted balances
 */
WalletSchema.virtual("formattedBalances").get(function () {
  return {
    [StablecoinType.TORO_USD]: new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number((this.balances as any)[StablecoinType.TORO_USD])),
    [StablecoinType.TORO_NGN]: new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
    }).format(Number((this.balances as any)[StablecoinType.TORO_NGN])),
  };
});

/**
 * Virtual for total formatted balance in USD
 */
WalletSchema.virtual("formattedTotalBalanceUSD").get(function () {
  const getTotalBalanceInUSD = this.getTotalBalanceInUSD as any;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(getTotalBalanceInUSD()));
});

export const Wallet = mongoose.model<IWallet>("Wallet", WalletSchema);
