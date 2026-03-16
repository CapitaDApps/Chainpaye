import { loadEnv } from "../config/env";
loadEnv();

import mongoose from "mongoose";
import { connectDatabase, closeDatabase } from "../config/database";
import { TransactionService } from "../services/TransactionService";

async function main() {
  await connectDatabase();

  const userId = new mongoose.Types.ObjectId();

  const record = await TransactionService.createOfframpTransaction({
    refId: `OFFRAMP-TEST-${Date.now()}`,
    crossmintTxId: "crossmint-test-tx-001",
    userId,
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
  });

  console.log("\n✅ Offramp transaction recorded:");
  console.log(JSON.stringify(record.toObject(), null, 2));

  await closeDatabase();
}

main().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
