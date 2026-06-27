import mongoose from "mongoose";
import { OfframpTransaction, OfframpStatus } from "./OfframpTransaction";
import { TransactionService } from "../services/TransactionService";

// Mock the mongoose model
jest.mock("./OfframpTransaction", () => {
  const mockDoc = {
    referenceId: "OFFRAMP-user123-1234567890",
    crossmintTxId: "crossmint-tx-abc",
    userId: new mongoose.Types.ObjectId(),
    asset: "USDC",
    chain: "base",
    cryptoAmount: 99.25,
    fees: 0.75,
    ngnAmount: 150000,
    exchangeRate: 1500,
    accountNumber: "0123456789",
    accountName: "Test User",
    bankName: "Access Bank",
    bankCode: "000014",
    status: "processing",
  };

  const OfframpTransaction = {
    create: jest.fn().mockResolvedValue(mockDoc),
    findOneAndUpdate: jest.fn().mockResolvedValue({ ...mockDoc, status: "completed", dexPayQuoteId: "dexpay-quote-xyz", completedAt: new Date() }),
  };

  return { OfframpTransaction, OfframpStatus: { PROCESSING: "processing", COMPLETED: "completed", FAILED: "failed" } };
});

const userId = new mongoose.Types.ObjectId();

const basePayload = {
  refId: "OFFRAMP-user123-1234567890",
  crossmintTxId: "crossmint-tx-abc",
  userId,
  asset: "USDC",
  chain: "base",          // raw chain name — no enum constraint
  cryptoAmount: 99.25,
  fees: 0.75,
  ngnAmount: 150000,
  exchangeRate: 1500,
  accountNumber: "0123456789",
  accountName: "Test User",
  bankName: "Access Bank",
  bankCode: "000014",
};

describe("OfframpTransaction — createOfframpTransaction", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a record with status PROCESSING", async () => {
    const result = await TransactionService.createOfframpTransaction(basePayload);

    expect(OfframpTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: basePayload.refId,
        crossmintTxId: basePayload.crossmintTxId,
        userId: basePayload.userId,
        asset: "USDC",
        chain: "base",
        status: OfframpStatus.PROCESSING,
      })
    );
    expect(result.status).toBe("processing");
  });

  it("stores raw chain name without transformation (no enum failure)", async () => {
    // Previously this would fail because "solana" → "USDCSOLANA" wasn't in the enum
    const solanaPayload = { ...basePayload, chain: "solana", asset: "USDT" };
    await TransactionService.createOfframpTransaction(solanaPayload);

    expect(OfframpTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ chain: "solana", asset: "USDT" })
    );
  });

  it("stores raw chain name for bsc without transformation", async () => {
    const bscPayload = { ...basePayload, chain: "bsc", asset: "USDT" };
    await TransactionService.createOfframpTransaction(bscPayload);

    expect(OfframpTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ chain: "bsc" })
    );
  });

  it("includes bank details as flat fields", async () => {
    await TransactionService.createOfframpTransaction(basePayload);

    expect(OfframpTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountNumber: "0123456789",
        accountName: "Test User",
        bankName: "Access Bank",
        bankCode: "000014",
      })
    );
  });
});

describe("OfframpTransaction — completeOfframpTransaction", () => {
  beforeEach(() => jest.clearAllMocks());

  it("updates status to COMPLETED and sets dexPayQuoteId", async () => {
    const result = await TransactionService.completeOfframpTransaction(
      "OFFRAMP-user123-1234567890",
      "dexpay-quote-xyz"
    );

    expect(OfframpTransaction.findOneAndUpdate).toHaveBeenCalledWith(
      { referenceId: "OFFRAMP-user123-1234567890" },
      expect.objectContaining({
        status: OfframpStatus.COMPLETED,
        dexPayQuoteId: "dexpay-quote-xyz",
        completedAt: expect.any(Date),
      }),
      { new: true }
    );
    expect(result?.status).toBe("completed");
    expect(result?.dexPayQuoteId).toBe("dexpay-quote-xyz");
  });
});

describe("OfframpTransaction — failOfframpTransaction", () => {
  beforeEach(() => {
    (OfframpTransaction.findOneAndUpdate as jest.Mock).mockResolvedValue({
      referenceId: "OFFRAMP-user123-1234567890",
      status: "failed",
      failureReason: "DexPay quote failed",
    });
  });

  it("updates status to FAILED with a reason", async () => {
    const result = await TransactionService.failOfframpTransaction(
      "OFFRAMP-user123-1234567890",
      "DexPay quote failed"
    );

    expect(OfframpTransaction.findOneAndUpdate).toHaveBeenCalledWith(
      { referenceId: "OFFRAMP-user123-1234567890" },
      { status: OfframpStatus.FAILED, failureReason: "DexPay quote failed" },
      { new: true }
    );
    expect(result?.status).toBe("failed");
  });
});
