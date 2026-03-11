/**
 * Test script for offramp receipt generation
 * Generates sample offramp receipts and saves them to output folder
 * Run: npm run test:offramp-receipt or ts-node utils/testOfframpReceiptGeneration.ts
 */

import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import {
  generateOfframpReceipt,
  prepareOfframpReceiptData,
} from "./generateOfframpReceipt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output directory for test receipts
const OUTPUT_DIR = path.join(__dirname, "../output/test-offramp-receipts");

/**
 * Ensure output directory exists
 */
async function ensureOutputDir() {
  await fs.ensureDir(OUTPUT_DIR);
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

/**
 * Save base64 image to file
 */
async function saveBase64Image(
  base64Data: string,
  filename: string
): Promise<void> {
  // Extract the base64 string (remove data:image/png;base64, prefix)
  const parts = base64Data.split(",");
  const base64String = parts[1] || parts[0];
  const buffer = Buffer.from(base64String!, "base64");
  const filepath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(filepath, buffer);
  console.log(`  ✓ Saved: ${filename}`);
}

/**
 * Test 1: Standard USDC Offramp
 */
async function testStandardUSDCOfframp(): Promise<void> {
  console.log("\n[TEST 1] Standard USDC Offramp Receipt");

  const receiptData = prepareOfframpReceiptData(
    150000,
    100.75,
    100.75,
    "USDC",
    "GTBank",
    "John Doe",
    "0123456789",
    new Date("2026-03-11T10:30:00"),
    "quote_test_abc123",
    1492.54,
    "Successful"
  );

  const base64Receipt = await generateOfframpReceipt(receiptData);
  await saveBase64Image(base64Receipt, "01_usdc_standard.png");
}

/**
 * Test 2: USDT Offramp
 */
async function testUSDTOfframp(): Promise<void> {
  console.log("\n[TEST 2] USDT Offramp Receipt");

  const receiptData = prepareOfframpReceiptData(
    250000,
    167.89,
    167.89,
    "USDT",
    "Access Bank",
    "Jane Smith",
    "9876543210",
    new Date("2026-03-11T15:45:00"),
    "quote_usdt_xyz789",
    1489.23,
    "Successful"
  );

  const base64Receipt = await generateOfframpReceipt(receiptData);
  await saveBase64Image(base64Receipt, "02_usdt_standard.png");
}

/**
 * Test 3: Large Amount Offramp (₦5M)
 */
async function testLargeAmountOfframp(): Promise<void> {
  console.log("\n[TEST 3] Large Amount Offramp Receipt (₦5M)");

  const receiptData = prepareOfframpReceiptData(
    5000000,
    3345.67,
    3345.67,
    "USDC",
    "First Bank",
    "Bob Williams",
    "5566778899",
    new Date("2026-03-11T20:00:00"),
    "quote_large_ghi789",
    1494.87,
    "Successful"
  );

  const base64Receipt = await generateOfframpReceipt(receiptData);
  await saveBase64Image(base64Receipt, "03_large_amount.png");
}

/**
 * Test 4: Small Amount Offramp
 */
async function testSmallAmountOfframp(): Promise<void> {
  console.log("\n[TEST 4] Small Amount Offramp Receipt");

  const receiptData = prepareOfframpReceiptData(
    50000,
    33.45,
    33.45,
    "USDC",
    "Zenith Bank",
    "Alice Johnson",
    "1122334455",
    new Date("2026-03-11T08:15:00"),
    "quote_small_def456",
    1495.12,
    "Successful"
  );

  const base64Receipt = await generateOfframpReceipt(receiptData);
  await saveBase64Image(base64Receipt, "04_small_amount.png");
}

/**
 * Test 5: Pending Offramp
 */
async function testPendingOfframp(): Promise<void> {
  console.log("\n[TEST 5] Pending Offramp Receipt");

  const receiptData = prepareOfframpReceiptData(
    100000,
    67.12,
    67.12,
    "USDC",
    "UBA",
    "Charlie Brown",
    "4455667788",
    new Date("2026-03-11T12:00:00"),
    "quote_pending_jkl012",
    1490.45,
    "Pending"
  );

  const base64Receipt = await generateOfframpReceipt(receiptData);
  await saveBase64Image(base64Receipt, "05_pending_status.png");
}

/**
 * Test 6: Failed Offramp
 */
async function testFailedOfframp(): Promise<void> {
  console.log("\n[TEST 6] Failed Offramp Receipt");

  const receiptData = prepareOfframpReceiptData(
    75000,
    50.25,
    50.25,
    "USDT",
    "Kuda Bank",
    "David Miller",
    "7788990011",
    new Date("2026-03-11T14:20:00"),
    "quote_failed_mno345",
    1493.21,
    "Failed"
  );

  const base64Receipt = await generateOfframpReceipt(receiptData);
  await saveBase64Image(base64Receipt, "06_failed_status.png");
}

/**
 * Test 7: Without Exchange Rate
 */
async function testWithoutExchangeRate(): Promise<void> {
  console.log("\n[TEST 7] Offramp Without Exchange Rate");

  const receiptData = prepareOfframpReceiptData(
    200000,
    134.12,
    134.12,
    "USDC",
    "Opay",
    "Emma Davis",
    "2233445566",
    new Date("2026-03-11T16:30:00"),
    "quote_no_rate_pqr678",
    undefined, // No exchange rate
    "Successful"
  );

  const base64Receipt = await generateOfframpReceipt(receiptData);
  await saveBase64Image(base64Receipt, "07_no_exchange_rate.png");
}

/**
 * Test 8: Different Banks
 */
async function testDifferentBanks(): Promise<void> {
  console.log("\n[TEST 8] Multiple Banks Test");

  const banks = [
    { name: "Wema Bank", account: "1234567890" },
    { name: "Sterling Bank", account: "0987654321" },
    { name: "Polaris Bank", account: "5555666677" },
  ];

  for (let i = 0; i < banks.length; i++) {
    const bank = banks[i];
    const receiptData = prepareOfframpReceiptData(
      120000 + i * 10000,
      80.5 + i * 5,
      80.5 + i * 5,
      "USDC",
      bank.name,
      `Customer ${i + 1}`,
      bank.account,
      new Date("2026-03-11T18:00:00"),
      `quote_bank_${i + 1}_stu${i}90`,
      1491.78,
      "Successful"
    );

    const base64Receipt = await generateOfframpReceipt(receiptData);
    await saveBase64Image(base64Receipt, `08_${i + 1}_${bank.name.toLowerCase().replace(" ", "_")}.png`);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log("=".repeat(60));
  console.log("  OFFRAMP RECEIPT GENERATION TEST SUITE");
  console.log("=".repeat(60));

  await ensureOutputDir();

  const tests = [
    testStandardUSDCOfframp,
    testUSDTOfframp,
    testLargeAmountOfframp,
    testSmallAmountOfframp,
    testPendingOfframp,
    testFailedOfframp,
    testWithoutExchangeRate,
    testDifferentBanks,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (error) {
      console.error(`  ✗ Test failed: ${test.name}`);
      console.error(error);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("  TEST SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nReceipts saved to: ${OUTPUT_DIR}`);
  console.log("=".repeat(60));
  
  if (failed === 0) {
    console.log("\n🎉 ALL TESTS PASSED!");
    console.log("✅ Offramp receipt generation is working correctly!");
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Please check the errors above.`);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error("Fatal error running tests:", error);
  process.exit(1);
});
