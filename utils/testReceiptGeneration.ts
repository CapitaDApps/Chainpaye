/**
 * Test script to verify receipt generation works
 * Run with: tsx utils/testReceiptGeneration.ts
 */

import { generateReceipt } from "./generateReceipt";
import type { StandardTransactionReceipt } from "./generateReceipt";

async function testReceiptGeneration() {
  console.log("=== Testing Receipt Generation ===\n");

  // Create test data for a failed deposit
  const testData: StandardTransactionReceipt = {
    isConversion: false,
    transactionDirection: "CREDIT",
    transactionType: "Deposit",
    status: "Failed",
    mainAmount: "NGN 5,000.00",
    transactionDate: "Thursday, February 26, 2026, 10:30 AM",
    transactionReference: "TXN-TEST-123456",
    senderName: "DEPOSIT / BANK TRANSFER",
    sourceInstitution: "External Bank",
    beneficiary: "Test User | 2348012345678",
    beneficiaryInstitution: "CHAINPAYE WALLET",
    failureReason: "Insufficient funds in source account",
  };

  try {
    console.log("Test data:", JSON.stringify(testData, null, 2));
    console.log("\nGenerating receipt...\n");

    const base64Receipt = await generateReceipt(testData);

    console.log("\n✅ Receipt generated successfully!");
    console.log(`Base64 length: ${base64Receipt.length} characters`);
    console.log(
      `Image size: ~${Math.round(base64Receipt.length * 0.75)} bytes`
    );

    // Optionally save to file for inspection
    const fs = await import("fs-extra");
    const cleanBase64 = base64Receipt.replace(/^data:image\/\w+;base64,/, "");
    await fs.writeFile("test-receipt.png", cleanBase64, "base64");
    console.log("\n📁 Receipt saved to: test-receipt.png");

    return true;
  } catch (error) {
    console.error("\n❌ Receipt generation failed:");
    console.error(error);
    return false;
  }
}

// Run the test
testReceiptGeneration()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
