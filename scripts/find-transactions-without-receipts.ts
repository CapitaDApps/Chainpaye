/**
 * Find transactions that don't have receipts
 * Usage: tsx scripts/find-transactions-without-receipts.ts [hours]
 * Example: tsx scripts/find-transactions-without-receipts.ts 24
 */

import { connectDatabase } from "../config/database";
import { Transaction, TransactionStatus } from "../models/Transaction";

async function findTransactionsWithoutReceipts() {
  const args = process.argv.slice(2);
  const hours = args[0] ? parseInt(args[0]) : 24;

  console.log("=== Finding Transactions Without Receipts ===\n");
  console.log(`Looking for transactions from the last ${hours} hours\n`);

  try {
    // Connect to database
    console.log("Connecting to database...");
    await connectDatabase();
    console.log("✅ Database connected\n");

    // Find transactions without receipts
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const transactions = await Transaction.find({
      createdAt: { $gte: cutoffDate },
      status: { $in: [TransactionStatus.COMPLETED, TransactionStatus.FAILED] },
      $or: [
        { receiptImageId: { $exists: false } },
        { receiptImageId: null },
        { receiptImageId: "" },
      ],
    })
      .populate("fromUser")
      .sort({ createdAt: -1 })
      .limit(50);

    if (transactions.length === 0) {
      console.log("✅ No transactions found without receipts!");
      process.exit(0);
    }

    console.log(`Found ${transactions.length} transaction(s) without receipts:\n`);

    for (const tx of transactions) {
      const user = tx.fromUser as any;
      console.log("─".repeat(60));
      console.log(`Transaction ID: ${tx._id}`);
      console.log(`Type: ${tx.type}`);
      console.log(`Status: ${tx.status}`);
      console.log(`Amount: ${tx.amount} ${tx.currency}`);
      console.log(`Reference: ${tx.referenceId}`);
      console.log(`Created: ${tx.createdAt}`);
      
      if (user) {
        console.log(`User: ${user.firstName} ${user.lastName}`);
        console.log(`Phone: ${user.whatsappNumber}`);
        console.log(
          `\nTo send receipt: tsx scripts/test-receipt-for-transaction.ts ${tx._id} ${user.whatsappNumber}`
        );
      } else {
        console.log(`User: Not found`);
      }
      console.log("");
    }

    console.log("─".repeat(60));
    console.log(`\nTotal: ${transactions.length} transaction(s) without receipts`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

findTransactionsWithoutReceipts();
