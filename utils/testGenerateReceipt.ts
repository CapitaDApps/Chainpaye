/**
 * Test script for generateReceipt function
 * Generates sample receipts for different transaction types and saves them to output folder
 * Run independently: npm run test:receipt or ts-node utils/testGenerateReceipt.ts
 */

import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { generateReceipt } from "./generateReceipt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output directory for test receipts
const OUTPUT_DIR = path.join(__dirname, "../output/test-receipts");

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
  console.log(`  Saved: ${filename}`);
}

/**
 * Test 1: DEBIT Transfer Receipt
 */
async function testDebitTransferReceipt(): Promise<void> {
  console.log("\n[TEST 1] DEBIT Transfer Receipt");

  const receiptData = {
    isConversion: false as const,
    transactionDirection: "DEBIT" as const,
    transactionType: "Transfer",
    status: "Successful" as const,
    mainAmount: "₦50,000.00",
    senderName: "John Doe",
    sourceInstitution: "CHAINPAYE WALLET",
    beneficiary: "Jane Smith | +2348012345678",
    beneficiaryInstitution: "CHAINPAYE WALLET",
    transactionDate: "Wednesday, December 31, 2025, 02:30 PM",
    transactionReference: "TXN1735630200ABC123",
    fees: "₦50.00",
    totalAmount: "₦50,050.00",
    description: "Payment for services",
    transactionHash: "0x8f2d3e4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e",
  };

  const base64Receipt = await generateReceipt(receiptData);
  await saveBase64Image(base64Receipt, "01_debit_transfer.png");
}

/**
 * Test 2: CREDIT Transfer Receipt
 */
async function testCreditTransferReceipt(): Promise<void> {
  console.log("\n[TEST 2] CREDIT Transfer Receipt");

  const receiptData = {
    isConversion: false as const,
    transactionDirection: "CREDIT" as const,
    transactionType: "Transfer",
    status: "Successful" as const,
    mainAmount: "₦50,000.00",
    senderName: "John Doe",
    sourceInstitution: "CHAINPAYE WALLET",
    beneficiary: "Jane Smith | +2348098765432",
    beneficiaryInstitution: "CHAINPAYE WALLET",
    transactionDate: "Wednesday, December 31, 2025, 02:30 PM",
    transactionReference: "TXN1735630200XYZ789",
  };

  const base64Receipt = await generateReceipt(receiptData);
  await saveBase64Image(base64Receipt, "02_credit_transfer.png");
}

/**
 * Test 3: Withdrawal Receipt
 */
async function testWithdrawalReceipt(): Promise<void> {
  console.log("\n[TEST 3] Withdrawal Receipt");

  const receiptData = {
    isConversion: false as const,
    transactionDirection: "DEBIT" as const,
    transactionType: "Withdrawal",
    status: "Successful" as const,
    mainAmount: "$500.00",
    senderName: "Alice Johnson",
    sourceInstitution: "CHAINPAYE USD WALLET",
    beneficiary: "Alice Johnson | 1234567890",
    beneficiaryInstitution: "Wells Fargo Bank",
    transactionDate: "Wednesday, December 31, 2025, 03:15 PM",
    transactionReference: "TXN1735632900WDR001",
    fees: "$5.00",
    totalAmount: "$505.00",
    description: "Bank withdrawal to savings account",
  };

  const base64Receipt = await generateReceipt(receiptData);
  await saveBase64Image(base64Receipt, "03_withdrawal.png");
}

/**
 * Test 4: Deposit Receipt
 */
async function testDepositReceipt(): Promise<void> {
  console.log("\n[TEST 4] Deposit Receipt");

  const receiptData = {
    isConversion: false as const,
    transactionDirection: "CREDIT" as const,
    transactionType: "Deposit",
    status: "Successful" as const,
    mainAmount: "₦100,000.00",
    senderName: "DEPOSIT / BANK TRANSFER",
    sourceInstitution: "External Bank",
    beneficiary: "Bob Williams | +2348055555555",
    beneficiaryInstitution: "CHAINPAYE WALLET",
    transactionDate: "Wednesday, December 31, 2025, 04:00 PM",
    transactionReference: "TXN1735635600DEP456",
  };

  const base64Receipt = await generateReceipt(receiptData);
  await saveBase64Image(base64Receipt, "04_deposit.png");
}

/**
 * Test 5: Direct Deposit (Blockchain) Receipt
 */
async function testDirectDepositReceipt(): Promise<void> {
  console.log("\n[TEST 5] Direct Deposit (Blockchain) Receipt");

  const receiptData = {
    isConversion: false as const,
    transactionDirection: "CREDIT" as const,
    transactionType: "Direct Deposit",
    status: "Successful" as const,
    mainAmount: "$250.00",
    senderName: "DIRECT TRANSFER",
    sourceInstitution: "Blockchain",
    beneficiary: "Charlie Brown | +2348077777777",
    beneficiaryInstitution: "CHAINPAYE WALLET",
    transactionDate: "Wednesday, December 31, 2025, 04:45 PM",
    transactionReference: "TXN1735638300DIR789",
    transactionHash: "0x1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t",
  };

  const base64Receipt = await generateReceipt(receiptData);
  await saveBase64Image(base64Receipt, "05_direct_deposit.png");
}

/**
 * Test 6: Currency Conversion Receipt (USD to NGN)
 */
async function testConversionReceipt(): Promise<void> {
  console.log("\n[TEST 6] Currency Conversion Receipt (USD to NGN)");

  const receiptData = {
    isConversion: true as const,
    transactionDirection: "CONVERSION" as const,
    transactionType: "Currency Swap",
    status: "Successful" as const,
    amountFrom: "$100.00 USD",
    amountTo: "₦155,000.00 NGN",
    exchangeRate: "1 USD @ 1550 NGN",
    sourceInstitution: "USD Wallet",
    beneficiaryInstitution: "NGN Wallet",
    transactionDate: "Wednesday, December 31, 2025, 05:30 PM",
    transactionReference: "TXN1735641000CNV001",
    fees: "₦500.00",
    description: "Currency conversion for local payment",
  };

  const base64Receipt = await generateReceipt(receiptData);
  await saveBase64Image(base64Receipt, "06_conversion_usd_to_ngn.png");
}

/**
 * Test 7: Failed Transaction Receipt
 */
async function testFailedTransactionReceipt(): Promise<void> {
  console.log("\n[TEST 7] Failed Transaction Receipt");

  const receiptData = {
    isConversion: false as const,
    transactionDirection: "DEBIT" as const,
    transactionType: "Transfer",
    status: "Failed" as const,
    mainAmount: "₦75,000.00",
    senderName: "David Miller",
    sourceInstitution: "CHAINPAYE WALLET",
    beneficiary: "Emma Davis | +2348099999999",
    beneficiaryInstitution: "CHAINPAYE WALLET",
    transactionDate: "Wednesday, December 31, 2025, 06:00 PM",
    transactionReference: "TXN1735642800FAIL01",
    failureReason:
      "Insufficient funds. Please top up your wallet and try again.",
  };

  const base64Receipt = await generateReceipt(receiptData);
  await saveBase64Image(base64Receipt, "07_failed_transaction.png");
}

/**
 * Test 8: Pending Transaction Receipt
 */
async function testPendingTransactionReceipt(): Promise<void> {
  console.log("\n[TEST 8] Pending Transaction Receipt");

  const receiptData = {
    isConversion: false as const,
    transactionDirection: "DEBIT" as const,
    transactionType: "Withdrawal",
    status: "Pending" as const,
    mainAmount: "$1,000.00",
    senderName: "Frank Wilson",
    sourceInstitution: "CHAINPAYE USD WALLET",
    beneficiary: "Frank Wilson | 9876543210",
    beneficiaryInstitution: "Bank of America",
    transactionDate: "Wednesday, December 31, 2025, 06:30 PM",
    transactionReference: "TXN1735644600PEND01",
    description: "Pending bank withdrawal - awaiting confirmation",
  };

  const base64Receipt = await generateReceipt(receiptData);
  await saveBase64Image(base64Receipt, "08_pending_transaction.png");
}

/**
 * Test 9: Large Amount Transfer
 */
async function testLargeAmountTransfer(): Promise<void> {
  console.log("\n[TEST 9] Large Amount Transfer Receipt");

  const receiptData = {
    isConversion: false as const,
    transactionDirection: "CREDIT" as const,
    transactionType: "Transfer",
    status: "Successful" as const,
    mainAmount: "₦5,000,000.00",
    senderName: "Ifeanyi Okonkwo",
    sourceInstitution: "CHAINPAYE WALLET",
    beneficiary: "Chinedu Okafor | +2348055551234",
    beneficiaryInstitution: "CHAINPAYE WALLET",
    transactionDate: "Wednesday, December 31, 2025, 07:00 PM",
    transactionReference: "TXN1735647600LARGE1",
    fees: "₦1,000.00",
    totalAmount: "₦5,001,000.00",
    description: "Business payment - contract settlement",
    transactionHash: "0x9999aaaabbbbccccddddeeeeffff0000111122223333",
  };

  const base64Receipt = await generateReceipt(receiptData);
  await saveBase64Image(base64Receipt, "09_large_amount_transfer.png");
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log("===========================================");
  console.log("  GENERATE RECEIPT TEST SUITE");
  console.log("===========================================");

  await ensureOutputDir();

  const tests = [
    testDebitTransferReceipt,
    testCreditTransferReceipt,
    testWithdrawalReceipt,
    testDepositReceipt,
    testDirectDepositReceipt,
    testConversionReceipt,
    testFailedTransactionReceipt,
    testPendingTransactionReceipt,
    testLargeAmountTransfer,
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

  console.log("\n===========================================");
  console.log("  TEST SUMMARY");
  console.log("===========================================");
  console.log(`Total tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nReceipts saved to: ${OUTPUT_DIR}`);
  console.log("===========================================");
}

// Run tests
runAllTests().catch((error) => {
  console.error("Fatal error running tests:", error);
  process.exit(1);
});
