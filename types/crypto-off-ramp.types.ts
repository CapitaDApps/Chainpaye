/**
 * Core TypeScript interfaces for the Crypto Off-Ramp Feature
 * These interfaces define the data models and enums used throughout the system
 */

// Enums
export enum OffRampStep {
  DISPLAY_WALLETS = 1,
  REQUEST_ASSET_CHAIN = 2,
  WALLET_CREATION = 3,
  DEPOSIT_CONFIRMATION = 4,
  SPEND_FORM = 5,
  BANK_RESOLUTION = 6,
  BALANCE_VALIDATION = 7,
  PIN_CONFIRMATION = 8,
  CRYPTO_TRANSFER = 9,
  QUOTE_CREATION = 10,
  QUOTE_FINALIZATION = 11,
  COMPLETION = 12,
}

export enum TransactionStatus {
  INITIATED = "initiated",
  WALLET_PREPARED = "wallet_prepared",
  DEPOSIT_CONFIRMED = "deposit_confirmed",
  BANK_VALIDATED = "bank_validated",
  BALANCE_VERIFIED = "balance_verified",
  PIN_CONFIRMED = "pin_confirmed",
  CRYPTO_TRANSFERRED = "crypto_transferred",
  QUOTE_CREATED = "quote_created",
  QUOTE_FINALIZED = "quote_finalized",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export type SupportedAsset = "USDC" | "USDT";
export type SupportedChain =
  | "bep20"
  | "base"
  | "arbitrum"
  | "solana"
  | "hedera"
  | "apechain"
  | "lisk";

// Supported asset-chain combinations as defined in requirements
export const SUPPORTED_ASSETS: Record<SupportedAsset, SupportedChain[]> = {
  USDC: ["bep20", "base", "arbitrum", "solana", "hedera", "apechain", "lisk"],
  USDT: ["bep20", "arbitrum", "solana", "hedera", "apechain", "lisk"],
};

// Core Workflow Interfaces
export interface WorkflowState {
  id: string;
  userId: string;
  currentStep: OffRampStep;
  stepData: Record<string, any>;
  status: "active" | "completed" | "failed" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
}

export interface StepResult {
  success: boolean;
  nextStep?: OffRampStep;
  data?: any;
  error?: string;
}

// Transaction Models
export interface OffRampTransaction {
  id: string;
  userId: string;
  workflowId: string;

  // Asset Information
  asset: SupportedAsset;
  chain: SupportedChain;
  amount: number;

  // Wallet Information
  sourceWalletAddress: string;

  // Banking Information
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;

  // Financial Details
  exchangeRate: number;
  chainpayeFee: number; // 1.5% of amount
  dexpayFee: number; // $0.2 in NGN
  totalFees: number;
  fiatAmount: number; // Amount in NGN

  // Transaction References
  crossmintTransactionId?: string;
  dexpayQuoteId?: string;
  dexpayOrderId?: string;

  // Status and Timestamps
  status: TransactionStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Wallet and Balance Models
export interface WalletInfo {
  address: string;
  chainType: string;
  walletType: "smart" | "mpc";
  balances: Balance[];
}

export interface Balance {
  asset: string;
  chain: string;
  amount: number;
  usdValue: number;
}

// Banking Models
export interface Bank {
  name: string;
  code: string;
  currency: "NGN";
}

export interface BankResolution {
  accountName: string;
  accountNumber: string;
  bankName: string;
  isValid: boolean;
}

export interface ExchangeRate {
  asset: string;
  chain: string;
  rate: number; // NGN per token
  timestamp: Date;
  validUntil: Date;
}

// API Configuration Interfaces
export interface CrossmintConfig {
  apiKey: string;
  baseUrl: string;
  webhookSecret: string;
}

export interface DexPayConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  sandboxUrl: string;
}

// Request/Response Interfaces
export interface TransferRequest {
  walletAddress: string;
  token: string; // format: {chain}:{symbol}
  recipient: string;
  amount: string;
  idempotencyKey: string;
}

export interface TransferResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface QuoteRequest {
  tokenAmount?: number;
  fiatAmount?: number;
  asset: SupportedAsset;
  chain: string;
  type: "SELL";
  bankCode: string;
  accountName: string;
  accountNumber: string;
}

export interface Quote {
  id: string;
  rate: number;
  amount: number;
  fees: number;
  total: number;
  expiresAt: Date;
}

export interface QuoteResult {
  success: boolean;
  orderId?: string;
  error?: string;
  expired?: boolean;
  requiresRegeneration?: boolean;
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  status?: TransactionStatus;
  error?: string;
  receipt?: TransactionReceipt;
}

export interface TransactionReceipt {
  transactionId: string;
  userId: string;
  asset: SupportedAsset;
  chain: SupportedChain;
  amount: number;
  fiatAmount: number;
  exchangeRate: number;
  fees: {
    chainpaye: number;
    dexpay: number;
    total: number;
  };
  bankDetails: {
    bankName: string;
    accountName: string;
    accountNumber: string;
  };
  timestamps: {
    initiated: Date;
    completed: Date;
  };
  references: {
    crossmintTxId?: string;
    dexpayQuoteId?: string;
    dexpayOrderId?: string;
  };
}

// Validation Interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// Service Interfaces
export interface IWorkflowController {
  initiateOffRamp(userId: string): Promise<WorkflowState>;
  processStep(workflowId: string, stepData: any): Promise<StepResult>;
  handleStepFailure(workflowId: string, error: Error): Promise<void>;
  getWorkflowState(workflowId: string): Promise<WorkflowState>;
}

export interface IValidationService {
  validateAssetChain(asset: string, chain: string): ValidationResult;
  validateBankDetails(
    bankCode: string,
    accountNumber: string,
  ): ValidationResult;
  validateSufficientBalance(
    walletBalance: number,
    requiredAmount: number,
  ): ValidationResult;
  validateTransactionLimits(amount: number, userId: string): ValidationResult;
}

export interface ICrossmintService {
  getUserWallets(userId: string): Promise<WalletInfo[]>;
  getWalletBalances(userId: string, chainType: string): Promise<Balance[]>;
  createWallet(userId: string, chainType: string): Promise<WalletInfo>;
  transferTokens(transferRequest: TransferRequest): Promise<TransferResult>;
}

export interface IDexPayService {
  getSupportedBanks(): Promise<Bank[]>;
  resolveBank(bankCode: string, accountNumber: string): Promise<BankResolution>;
  getCurrentRates(
    asset: string,
    chain: string,
    amount?: number,
  ): Promise<ExchangeRate>;
  createQuote(quoteRequest: QuoteRequest): Promise<Quote>;
  finalizeQuote(quoteId: string): Promise<QuoteResult>;
}

export interface IAuthenticationService {
  validatePin(userId: string, pin: string): Promise<boolean>;
  lockAccount(userId: string, reason: string): Promise<void>;
  isAccountLocked(userId: string): Promise<boolean>;
}

export interface INotificationService {
  sendReceipt(userId: string, transaction: OffRampTransaction): Promise<void>;
  sendStatusUpdate(userId: string, message: string): Promise<void>;
  sendErrorNotification(userId: string, error: string): Promise<void>;
  sendCompletionNotification?(
    userId: string,
    transaction: OffRampTransaction,
  ): Promise<void>;
}

export interface IFinancialService {
  calculateChainpayeFee(amount: number): number;
  calculateDexpayFee(nairaRate: number): number;
  calculateTotalFees(amount: number, nairaRate: number): number;
  convertToUsd(amountNgn: number, nairaRate: number): number;
  validateCalculationAccuracy(calculation: any): boolean;
}

export interface ITransactionManager {
  processTransaction(
    transaction: OffRampTransaction,
  ): Promise<TransactionResult>;
  executeCryptoTransfer(
    transferRequest: TransferRequest,
  ): Promise<TransferResult>;
  createDexpayQuote(quoteRequest: QuoteRequest): Promise<Quote>;
  finalizeTransaction(transactionId: string): Promise<TransactionResult>;
  getTransactionStatus(transactionId: string): Promise<TransactionStatus>;
}

export interface IWalletManager {
  getUserWallets(userId: string): Promise<WalletInfo[]>;
  getWalletBalances(userId: string, chainType: string): Promise<Balance[]>;
  createWallet(userId: string, chainType: string): Promise<WalletInfo>;
  ensureWalletExists(userId: string, chainType: string): Promise<WalletInfo>;
  validateWalletBalance(
    walletAddress: string,
    requiredAmount: number,
  ): Promise<boolean>;
}

export interface IBankingManager {
  getSupportedBanks(): Promise<Bank[]>;
  resolveBank(bankCode: string, accountNumber: string): Promise<BankResolution>;
  getCurrentRates(
    asset: string,
    chain: string,
    amount?: number,
  ): Promise<ExchangeRate>;
  validateBankDetails(
    bankCode: string,
    accountNumber: string,
  ): Promise<ValidationResult>;
}

export interface IErrorHandler {
  handleApiError(error: Error, context: string): string;
  handleValidationError(validationResult: ValidationResult): string;
  handleTransactionError(error: Error, transactionId: string): string;
  logError(error: Error, context: string, metadata?: any): void;
  translateErrorToUserMessage(error: Error): string;
}
