"use strict";
/**
 * WithdrawalRequest schema for ChainPaye referral system
 * This schema maintains an audit trail of all referral earnings withdrawal requests
 * Updated for crypto withdrawals (USDT on Base chain)
 * Validates: Requirements 5.3, 9.5
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WithdrawalRequest = exports.WithdrawalMethod = exports.WithdrawalStatus = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/**
 * Withdrawal request status enum
 */
var WithdrawalStatus;
(function (WithdrawalStatus) {
    WithdrawalStatus["PENDING"] = "pending";
    WithdrawalStatus["COMPLETED"] = "completed";
    WithdrawalStatus["FAILED"] = "failed";
})(WithdrawalStatus || (exports.WithdrawalStatus = WithdrawalStatus = {}));
/**
 * Withdrawal method enum
 */
var WithdrawalMethod;
(function (WithdrawalMethod) {
    WithdrawalMethod["CRYPTO"] = "crypto";
})(WithdrawalMethod || (exports.WithdrawalMethod = WithdrawalMethod = {}));
/**
 * WithdrawalRequest schema definition
 */
const WithdrawalRequestSchema = new mongoose_1.Schema({
    userId: {
        type: String,
        required: true,
        trim: true,
        description: "The user requesting the withdrawal",
    },
    amount: {
        type: Number,
        required: true,
        min: 20, // Minimum withdrawal amount is $20
        description: "Amount to withdraw in USD (points)",
    },
    method: {
        type: String,
        required: true,
        enum: Object.values(WithdrawalMethod),
        default: WithdrawalMethod.CRYPTO,
        description: "Withdrawal method (crypto only for referral earnings)",
    },
    evmAddress: {
        type: String,
        required: true,
        trim: true,
        description: "User's EVM wallet address for receiving USDT",
    },
    chain: {
        type: String,
        required: true,
        trim: true,
        default: "base",
        description: "Blockchain network (Base)",
    },
    token: {
        type: String,
        required: true,
        trim: true,
        default: "USDT",
        description: "Token to receive (USDT)",
    },
    status: {
        type: String,
        required: true,
        enum: Object.values(WithdrawalStatus),
        default: WithdrawalStatus.PENDING,
        description: "Current status of the withdrawal request",
    },
    requestedAt: {
        type: Date,
        required: true,
        default: Date.now,
        description: "When the withdrawal was requested",
    },
    completedAt: {
        type: Date,
        description: "When the withdrawal was completed and funds sent",
    },
    failureReason: {
        type: String,
        trim: true,
        description: "Reason for withdrawal failure if status is 'failed'",
    },
    transactionHash: {
        type: String,
        trim: true,
        description: "Blockchain transaction hash for completed withdrawals",
    },
    adminNotes: {
        type: String,
        trim: true,
        description: "Admin notes for internal tracking",
    },
}, {
    timestamps: false, // We manage timestamps manually
});
/**
 * Indexes for efficient queries
 */
WithdrawalRequestSchema.index({ userId: 1 }); // Query user's withdrawal history
WithdrawalRequestSchema.index({ status: 1 }); // Find pending withdrawals
WithdrawalRequestSchema.index({ requestedAt: -1 }); // Check withdrawal frequency (descending)
exports.WithdrawalRequest = mongoose_1.default.model("WithdrawalRequest", WithdrawalRequestSchema);
