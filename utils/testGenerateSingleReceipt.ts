/**
 * Quick test to generate a single offramp receipt
 */

import { generateOfframpReceipt, prepareOfframpReceiptData } from "./generateOfframpReceipt";
import fs from "fs-extra";
import path from "path";

async function generateTestReceipt() {
  console.log("🧪 Generating test offramp receipt...\n");

  try {
    // Prepare test data
    const receiptData = prepareOfframpReceiptData(
      150000, // NGN amount
      100.75, // Crypto spent in USD
      0.75, // Fees in USD
      "GTBank", // Bank name
      "John Doe", // Account name
      "0123456789", // Account number
      new Date(), // Transaction date
      "quote_test_abc123", // Transaction reference
      "Successful" // Status
    );

    console.log("📋 Receipt Data:");
    console.log(JSON.stringify(receiptData, null, 2));
    console.log("\n");

    // Generate receipt
    console.log("🎨 Generating receipt image...");
    const base64Receipt = await generateOfframpReceipt(receiptData);

    // Save to file
    const outputDir = path.join(process.cwd(), "output");
    await fs.ensureDir(outputDir);

    const base64Data = base64Receipt.replace(/^data:image\/png;base64,/, "");
    const outputPath = path.join(outputDir, "test_offramp_receipt.png");
    
    await fs.writeFile(outputPath, base64Data, "base64");

    console.log("✅ Receipt generated successfully!");
    console.log(`📁 Saved to: ${outputPath}`);
    console.log("\n");

  } catch (error) {
    console.error("❌ Error generating receipt:", error);
    throw error;
  }
}

// Run the test
generateTestReceipt()
  .then(() => {
    console.log("✨ Test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Test failed:", error);
    process.exit(1);
  });
