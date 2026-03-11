/**
 * Test script for offramp receipt generation
 * 
 * Run with: npx ts-node utils/testOfframpReceipt.ts
 */

import {
  generateOfframpReceipt,
  prepareOfframpReceiptData,
} from "./generateOfframpReceipt";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testOfframpReceipt() {
  console.log("🧪 Testing Offramp Receipt Generation...\n");

  try {
    // Test data
    const testData = {
      ngnAmount: 150000,
      cryptoSpentUsd: 100.75,
      cryptoAmount: 100.75,
      cryptoSymbol: "USDC",
      bankName: "GTBank",
      accountName: "John Doe",
      accountNumber: "0123456789",
      transactionDate: new Date(),
      transactionReference: "quote_test_abc123",
      exchangeRate: 1492.54,
      status: "Successful" as const,
    };

    console.log("📋 Test Data:");
    console.log(JSON.stringify(testData, null, 2));
    console.log("\n");

    // Step 1: Prepare receipt data
    console.log("1️⃣ Preparing receipt data...");
    const receiptData = prepareOfframpReceiptData(
      testData.ngnAmount,
      testData.cryptoSpentUsd,
      testData.cryptoAmount,
      testData.cryptoSymbol,
      testData.bankName,
      testData.accountName,
      testData.accountNumber,
      testData.transactionDate,
      testData.transactionReference,
      testData.exchangeRate,
      testData.status
    );

    console.log("✅ Receipt data prepared:");
    console.log(JSON.stringify(receiptData, null, 2));
    console.log("\n");

    // Step 2: Generate receipt image
    console.log("2️⃣ Generating receipt image...");
    console.log("⏳ This may take a few seconds (Puppeteer is launching)...\n");

    const base64Receipt = await generateOfframpReceipt(receiptData);

    console.log("✅ Receipt image generated successfully!");
    console.log(`📊 Base64 length: ${base64Receipt.length} characters\n`);

    // Step 3: Save receipt to file for inspection
    console.log("3️⃣ Saving receipt to file...");

    const outputDir = path.join(__dirname, "../output");
    await fs.ensureDir(outputDir);

    const outputPath = path.join(
      outputDir,
      `offramp-receipt-test-${Date.now()}.png`
    );

    // Extract base64 data (remove data:image/png;base64, prefix)
    const base64Data = base64Receipt.replace(/^data:image\/png;base64,/, "");
    await fs.writeFile(outputPath, base64Data, "base64");

    console.log(`✅ Receipt saved to: ${outputPath}\n`);

    // Step 4: Test with different scenarios
    console.log("4️⃣ Testing different scenarios...\n");

    // Scenario 1: USDT transaction
    console.log("   📝 Scenario 1: USDT transaction");
    const usdtData = prepareOfframpReceiptData(
      250000,
      167.89,
      167.89,
      "USDT",
      "Access Bank",
      "Jane Smith",
      "9876543210",
      new Date(),
      "quote_usdt_xyz789",
      1489.23,
      "Successful"
    );
    const usdtReceipt = await generateOfframpReceipt(usdtData);
    const usdtPath = path.join(
      outputDir,
      `offramp-receipt-usdt-${Date.now()}.png`
    );
    await fs.writeFile(
      usdtPath,
      usdtReceipt.replace(/^data:image\/png;base64,/, ""),
      "base64"
    );
    console.log(`   ✅ USDT receipt saved to: ${usdtPath}\n`);

    // Scenario 2: Pending status
    console.log("   📝 Scenario 2: Pending transaction");
    const pendingData = prepareOfframpReceiptData(
      50000,
      33.45,
      33.45,
      "USDC",
      "Zenith Bank",
      "Alice Johnson",
      "1122334455",
      new Date(),
      "quote_pending_def456",
      1495.12,
      "Pending"
    );
    const pendingReceipt = await generateOfframpReceipt(pendingData);
    const pendingPath = path.join(
      outputDir,
      `offramp-receipt-pending-${Date.now()}.png`
    );
    await fs.writeFile(
      pendingPath,
      pendingReceipt.replace(/^data:image\/png;base64,/, ""),
      "base64"
    );
    console.log(`   ✅ Pending receipt saved to: ${pendingPath}\n`);

    // Scenario 3: Large amount
    console.log("   📝 Scenario 3: Large amount transaction");
    const largeData = prepareOfframpReceiptData(
      5000000,
      3345.67,
      3345.67,
      "USDC",
      "First Bank",
      "Bob Williams",
      "5566778899",
      new Date(),
      "quote_large_ghi789",
      1494.87,
      "Successful"
    );
    const largeReceipt = await generateOfframpReceipt(largeData);
    const largePath = path.join(
      outputDir,
      `offramp-receipt-large-${Date.now()}.png`
    );
    await fs.writeFile(
      largePath,
      largeReceipt.replace(/^data:image\/png;base64,/, ""),
      "base64"
    );
    console.log(`   ✅ Large amount receipt saved to: ${largePath}\n`);

    // Summary
    console.log("=" .repeat(60));
    console.log("🎉 ALL TESTS PASSED!");
    console.log("=" .repeat(60));
    console.log("\n📁 Receipt files saved in:", outputDir);
    console.log("\n✅ Receipt generation is working correctly!");
    console.log("✅ All scenarios tested successfully!");
    console.log("\n💡 Next steps:");
    console.log("   1. Open the output folder and inspect the receipt images");
    console.log("   2. Verify all fields are displayed correctly");
    console.log("   3. Check formatting and styling");
    console.log("   4. Test with real offramp transaction\n");
  } catch (error) {
    console.error("\n❌ TEST FAILED!");
    console.error("Error:", error);
    console.error("\nStack trace:", (error as Error).stack);
    process.exit(1);
  }
}

// Run the test
testOfframpReceipt()
  .then(() => {
    console.log("✅ Test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test failed with error:", error);
    process.exit(1);
  });
