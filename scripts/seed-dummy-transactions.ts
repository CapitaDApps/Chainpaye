import { loadEnv } from "../config/env";
loadEnv();

import mongoose from "mongoose";
import { connectDatabase, closeDatabase } from "../config/database";
import { User } from "../models/User";
import { Transaction, TransactionType, TransactionStatus } from "../models/Transaction";

function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomDate(daysBack: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  return d;
}

function randomStatus(): TransactionStatus {
  const statuses = [
    TransactionStatus.COMPLETED,
    TransactionStatus.COMPLETED,
    TransactionStatus.COMPLETED,
    TransactionStatus.PENDING,
    TransactionStatus.PROCESSING,
  ];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

function seedId(): string {
  return `SEED_${Date.now()}_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
}

const DUMMY_BANKS = [
  { bankName: "Access Bank", accountName: "John Doe", accountNumber: "0123456789" },
  { bankName: "GTBank", accountName: "Jane Smith", accountNumber: "0234567890" },
  { bankName: "Zenith Bank", accountName: "Michael Ade", accountNumber: "0345678901" },
  { bankName: "First Bank", accountName: "Amaka Obi", accountNumber: "0456789012" },
  { bankName: "UBA", accountName: "Emeka Nwosu", accountNumber: "0567890123" },
];

async function main() {
  await connectDatabase();

  // Fetch two real users from DB
  const users = await User.find({}).limit(2).lean();
  if (users.length < 2) {
    console.error("❌ Need at least 2 users in the database. Found:", users.length);
    await closeDatabase();
    process.exit(1);
  }

  const [userA, userB] = users;
  console.log(`✅ Using users:\n  A: ${userA.fullName} (${userA._id})\n  B: ${userB.fullName} (${userB._id})`);

  const txDocs: any[] = [];

  // --- 20 DEPOSITS (userA and userB alternating) ---
  // Target: ~$40,000 total → avg $2,000 each
  for (let i = 0; i < 20; i++) {
    const amount = rand(1200, 3200);
    const fees = rand(0.5, 2.5);
    const user = i % 2 === 0 ? userA : userB;
    const createdAt = randomDate(90);
    txDocs.push({
      referenceId: seedId(),
      type: TransactionType.DEPOSIT,
      status: randomStatus(),
      fromUser: user._id,
      amount,
      currency: "USD",
      fees,
      totalAmount: amount + fees,
      toronetTransactionId: seedId(),
      description: `Deposit of $${amount}`,
      createdAt,
      updatedAt: createdAt,
      completedAt: randomStatus() === TransactionStatus.COMPLETED ? createdAt : undefined,
    });
  }

  // --- 20 WITHDRAWALS (userA and userB alternating) ---
  // Target: ~$40,000 total → avg $2,000 each
  for (let i = 0; i < 20; i++) {
    const amount = rand(1000, 3000);
    const fees = rand(0.5, 2.0);
    const user = i % 2 === 0 ? userA : userB;
    const bank = DUMMY_BANKS[i % DUMMY_BANKS.length];
    const createdAt = randomDate(90);
    txDocs.push({
      referenceId: seedId(),
      type: TransactionType.WITHDRAWAL,
      status: randomStatus(),
      fromUser: user._id,
      amount,
      currency: "USD",
      fees,
      totalAmount: amount + fees,
      toronetTransactionId: seedId(),
      description: `Withdrawal of $${amount}`,
      bankDetails: bank,
      createdAt,
      updatedAt: createdAt,
      completedAt: randomStatus() === TransactionStatus.COMPLETED ? createdAt : undefined,
    });
  }

  // --- 20 TRANSFERS (userA → userB and vice versa) ---
  // Target: ~$35,000 total → avg $1,750 each
  for (let i = 0; i < 20; i++) {
    const amount = rand(800, 2800);
    const fees = rand(0.25, 1.5);
    const from = i % 2 === 0 ? userA : userB;
    const to = i % 2 === 0 ? userB : userA;
    const createdAt = randomDate(90);
    txDocs.push({
      referenceId: seedId(),
      type: TransactionType.TRANSFER,
      status: randomStatus(),
      fromUser: from._id,
      toUser: to._id,
      amount,
      currency: "USD",
      fees,
      totalAmount: amount + fees,
      toronetTransactionId: seedId(),
      description: `Transfer of $${amount} to ${to.fullName}`,
      createdAt,
      updatedAt: createdAt,
      completedAt: randomStatus() === TransactionStatus.COMPLETED ? createdAt : undefined,
    });
  }

  // Insert all
  await Transaction.insertMany(txDocs, { ordered: false });

  const total = txDocs.reduce((sum, t) => sum + t.amount, 0);
  console.log(`\n✅ Inserted ${txDocs.length} transactions`);
  console.log(`   Deposits:    20`);
  console.log(`   Withdrawals: 20`);
  console.log(`   Transfers:   20`);
  console.log(`   Total amount: $${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);

  await closeDatabase();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
