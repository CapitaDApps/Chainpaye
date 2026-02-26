/**
 * Test script to send a receipt for an existing transaction
 * Usage: tsx scripts/test-receipt-for-transaction.ts <transactionId> <phoneNumber>
 * Example: tsx scripts/test-receipt-for-transaction.ts 65f1234567890abcdef12345 +2348012345678
 */

import { sendTransactionReceipt } from "../utils/sendReceipt";
import { connectDatabase } from "../config/database";
import { Transaction } from "../models/Transaction";

async function testReceiptForTransaction() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: tsx scripts/test-receipt-for-transaction.ts <transactionId> <phoneNumber>");
    console.error("Example: tsx scripts/test-receipt-for-transaction.ts 65f1234567890abcdef12345 +2348012345678");
    process.exit(1);
  }

  const transactionId = args[0]!;
  const phoneNumber = args[1]!;

  console.log("=== Testing Receipt Generation for Existing Transaction ===\n");
  console.log(`Transaction ID: ${transactionId}`);
  console.log(`Phone Number: ${phoneNumber}`);
  console.log("");

  try {
    // Connect to database
    console.log("Connecting to database...");
    await connectDatabase();
    console.log("✅ Database connected\n");

    // Verify transaction exists
    console.log("Checking if transaction exists...");
    const transaction = await Transaction.findById(transactionId);
    
    if (!transaction) {
      console.error(`❌ Transaction not found: ${transactionId}`);
      process.exit(1);
    }

    console.log("✅ Transaction found:");
    console.log(`   Type: ${transaction.type}`);
    console.log(`   Status: ${transaction.status}`);
    console.log(`   Amount: ${transaction.amount} ${transaction.currency || 'N/A'}`);
    console.log(`   Reference: ${transaction.referenceId || 'N/A'}`);
    console.log("");

    // Send receipt
    console.log("Sending receipt...\n");
    await sendTransactionReceipt(transactionId, phoneNumber);

    // Wait a bit for async processing
    console.log("\nWaiting for receipt to be processed (10 seconds)...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    console.log("\n✅ Receipt sending initiated!");
    console.log("Check the logs for detailed status:");
    console.log("  grep '[Receipt]' logs/combined.log");
    console.log("\nCheck WhatsApp to verify receipt was received.");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

testReceiptForTransaction();
