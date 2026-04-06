/**
 * Referral Earnings Validation Script
 * 
 * This script validates the new 1% referral earnings calculation.
 * It can be used to:
 * 1. Test the calculation logic with sample data
 * 2. Compare old vs new earnings model
 * 3. Validate against actual transaction data
 * 4. Generate reports for analysis
 * 
 * Usage:
 *   npm run ts-node scripts/validate-referral-earnings.ts
 *   npm run ts-node scripts/validate-referral-earnings.ts --mode=compare
 *   npm run ts-node scripts/validate-referral-earnings.ts --mode=live --limit=10
 */

import { EarningsService } from "../services/EarningsService";
import { ReferralRelationship } from "../models/ReferralRelationship";
import { EarningsTransaction } from "../models/EarningsTransaction";
import { PointsBalance } from "../models/PointsBalance";
import { logger } from "../utils/logger";
import mongoose from "mongoose";

// Configuration
const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/chainpaye";
const OLD_FLAT_FEE = 0.25; // Previous flat fee model
const NEW_PERCENTAGE = 0.01; // New 1% model

interface ValidationResult {
  transactionId: string;
  userId: string;
  referrerId: string;
  sellAmountUsd: number;
  oldEarnings: number;
  newEarnings: number;
  difference: number;
  percentageDiff: number;
}

interface ValidationSummary {
  totalTransactions: number;
  totalOldEarnings: number;
  totalNewEarnings: number;
  totalDifference: number;
  averageOldEarnings: number;
  averageNewEarnings: number;
  transactionsWithHigherEarnings: number;
  transactionsWithLowerEarnings: number;
  results: ValidationResult[];
}

/**
 * Calculate earnings using old flat fee model
 */
function calculateOldEarnings(): number {
  return OLD_FLAT_FEE;
}

/**
 * Calculate earnings using new 1% model
 */
function calculateNewEarnings(sellAmountUsd: number): number {
  return sellAmountUsd * NEW_PERCENTAGE;
}

/**
 * Test with sample transaction amounts
 */
function testSampleTransactions(): void {
  console.log("\n=== Testing Sample Transactions ===\n");
  
  const sampleAmounts = [
    0.50,   // Very small
    1.00,   // Small
    5.00,   // Small-medium
    10.00,  // Medium
    25.00,  // Break-even point
    50.00,  // Medium-large
    100.00, // Large
    500.00, // Very large
    1000.00, // Extra large
    5000.00  // Huge
  ];

  console.log("Transaction | Old Model | New Model | Difference | Better For");
  console.log("------------|-----------|-----------|------------|------------");

  sampleAmounts.forEach(amount => {
    const oldEarnings = calculateOldEarnings();
    const newEarnings = calculateNewEarnings(amount);
    const diff = newEarnings - oldEarnings;
    const betterFor = diff > 0 ? "New (1%)" : diff < 0 ? "Old ($0.25)" : "Equal";
    
    console.log(
      `$${amount.toFixed(2).padEnd(8)} | ` +
      `$${oldEarnings.toFixed(4).padEnd(8)} | ` +
      `$${newEarnings.toFixed(4).padEnd(8)} | ` +
      `${diff >= 0 ? '+' : ''}${diff.toFixed(4).padEnd(9)} | ` +
      `${betterFor}`
    );
  });

  // Calculate break-even point
  const breakEven = OLD_FLAT_FEE / NEW_PERCENTAGE;
  console.log(`\n📊 Break-even point: $${breakEven.toFixed(2)}`);
  console.log(`   - Transactions < $${breakEven.toFixed(2)}: Old model better`);
  console.log(`   - Transactions > $${breakEven.toFixed(2)}: New model better`);
}

/**
 * Validate against recent earnings transactions
 */
async function validateRecentTransactions(limit: number = 50): Promise<ValidationSummary> {
  console.log(`\n=== Validating Recent ${limit} Transactions ===\n`);

  // Fetch recent earnings transactions
  const recentTransactions = await EarningsTransaction.find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  if (recentTransactions.length === 0) {
    console.log("⚠️  No earnings transactions found in database");
    return {
      totalTransactions: 0,
      totalOldEarnings: 0,
      totalNewEarnings: 0,
      totalDifference: 0,
      averageOldEarnings: 0,
      averageNewEarnings: 0,
      transactionsWithHigherEarnings: 0,
      transactionsWithLowerEarnings: 0,
      results: []
    };
  }

  const results: ValidationResult[] = [];
  let totalOldEarnings = 0;
  let totalNewEarnings = 0;
  let higherCount = 0;
  let lowerCount = 0;

  for (const txn of recentTransactions) {
    // For existing transactions, we need to estimate sellAmountUsd
    // If transactionAmount is available, use it; otherwise estimate from earnings
    let sellAmountUsd: number;
    
    if (txn.transactionAmount) {
      // Assume transactionAmount is in NGN, convert to USD (rough estimate)
      // You may need to adjust this based on your actual data structure
      sellAmountUsd = txn.transactionAmount / 1500; // Rough NGN to USD conversion
    } else {
      // Estimate from old earnings (if it was $0.25, we can't determine original amount)
      // For this case, we'll use the feeAmount as a proxy
      sellAmountUsd = txn.feeAmount / NEW_PERCENTAGE;
    }

    const oldEarnings = calculateOldEarnings();
    const newEarnings = calculateNewEarnings(sellAmountUsd);
    const difference = newEarnings - oldEarnings;
    const percentageDiff = oldEarnings > 0 ? (difference / oldEarnings) * 100 : 0;

    if (newEarnings > oldEarnings) higherCount++;
    if (newEarnings < oldEarnings) lowerCount++;

    totalOldEarnings += oldEarnings;
    totalNewEarnings += newEarnings;

    results.push({
      transactionId: txn.offrampTransactionId,
      userId: txn.referredUserId,
      referrerId: txn.userId,
      sellAmountUsd,
      oldEarnings,
      newEarnings,
      difference,
      percentageDiff
    });
  }

  const summary: ValidationSummary = {
    totalTransactions: recentTransactions.length,
    totalOldEarnings,
    totalNewEarnings,
    totalDifference: totalNewEarnings - totalOldEarnings,
    averageOldEarnings: totalOldEarnings / recentTransactions.length,
    averageNewEarnings: totalNewEarnings / recentTransactions.length,
    transactionsWithHigherEarnings: higherCount,
    transactionsWithLowerEarnings: lowerCount,
    results
  };

  return summary;
}

/**
 * Display validation summary
 */
function displaySummary(summary: ValidationSummary): void {
  console.log("\n=== Validation Summary ===\n");
  
  console.log(`Total Transactions Analyzed: ${summary.totalTransactions}`);
  console.log(`\nOld Model (Flat $0.25):`);
  console.log(`  Total Earnings: $${summary.totalOldEarnings.toFixed(2)}`);
  console.log(`  Average per Transaction: $${summary.averageOldEarnings.toFixed(4)}`);
  
  console.log(`\nNew Model (1% of Volume):`);
  console.log(`  Total Earnings: $${summary.totalNewEarnings.toFixed(2)}`);
  console.log(`  Average per Transaction: $${summary.averageNewEarnings.toFixed(4)}`);
  
  console.log(`\nDifference:`);
  const diffSymbol = summary.totalDifference >= 0 ? '+' : '';
  console.log(`  Total: ${diffSymbol}$${summary.totalDifference.toFixed(2)}`);
  console.log(`  Percentage: ${diffSymbol}${((summary.totalDifference / summary.totalOldEarnings) * 100).toFixed(2)}%`);
  
  console.log(`\nTransaction Distribution:`);
  console.log(`  Higher Earnings (New Model): ${summary.transactionsWithHigherEarnings} (${((summary.transactionsWithHigherEarnings / summary.totalTransactions) * 100).toFixed(1)}%)`);
  console.log(`  Lower Earnings (New Model): ${summary.transactionsWithLowerEarnings} (${((summary.transactionsWithLowerEarnings / summary.totalTransactions) * 100).toFixed(1)}%)`);
  console.log(`  Equal Earnings: ${summary.totalTransactions - summary.transactionsWithHigherEarnings - summary.transactionsWithLowerEarnings}`);

  // Show top 5 biggest differences
  console.log(`\n=== Top 5 Biggest Differences ===\n`);
  const sortedByDiff = [...summary.results].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  
  console.log("Volume (USD) | Old Earnings | New Earnings | Difference");
  console.log("-------------|--------------|--------------|------------");
  sortedByDiff.slice(0, 5).forEach(result => {
    const diffSymbol = result.difference >= 0 ? '+' : '';
    console.log(
      `$${result.sellAmountUsd.toFixed(2).padEnd(11)} | ` +
      `$${result.oldEarnings.toFixed(4).padEnd(11)} | ` +
      `$${result.newEarnings.toFixed(4).padEnd(11)} | ` +
      `${diffSymbol}$${result.difference.toFixed(4)}`
    );
  });
}

/**
 * Test the EarningsService directly
 */
async function testEarningsService(): Promise<void> {
  console.log("\n=== Testing EarningsService ===\n");
  
  const earningsService = new EarningsService();
  const testAmounts = [1, 10, 25, 50, 100, 500, 1000];

  console.log("Testing calculateReferrerEarnings method:\n");
  console.log("Amount (USD) | Earnings | Expected | Match");
  console.log("-------------|----------|----------|------");

  testAmounts.forEach(amount => {
    const earnings = earningsService.calculateReferrerEarnings(amount);
    const expected = amount * 0.01;
    const match = Math.abs(earnings - expected) < 0.0001 ? "✓" : "✗";
    
    console.log(
      `$${amount.toString().padEnd(11)} | ` +
      `$${earnings.toFixed(4).padEnd(7)} | ` +
      `$${expected.toFixed(4).padEnd(7)} | ` +
      `${match}`
    );
  });
}

/**
 * Validate points balances
 */
async function validatePointsBalances(): Promise<void> {
  console.log("\n=== Validating Points Balances ===\n");

  // Get all users with points balances
  const balances = await PointsBalance.find().lean();
  
  if (balances.length === 0) {
    console.log("⚠️  No points balances found in database");
    return;
  }

  console.log(`Found ${balances.length} users with points balances\n`);

  let totalBalance = 0;
  let totalEarned = 0;
  let invalidBalances = 0;

  for (const balance of balances) {
    totalBalance += balance.currentBalance;
    totalEarned += balance.totalEarned;

    // Validate invariant: totalEarned >= currentBalance
    if (balance.totalEarned < balance.currentBalance) {
      invalidBalances++;
      console.log(`⚠️  Invalid balance for user ${balance.userId}:`);
      console.log(`   Current: $${balance.currentBalance.toFixed(2)}`);
      console.log(`   Total Earned: $${balance.totalEarned.toFixed(2)}`);
    }
  }

  console.log(`Total Current Balance: $${totalBalance.toFixed(2)}`);
  console.log(`Total Earned (All Time): $${totalEarned.toFixed(2)}`);
  console.log(`Total Withdrawn: $${(totalEarned - totalBalance).toFixed(2)}`);
  
  if (invalidBalances > 0) {
    console.log(`\n⚠️  Found ${invalidBalances} invalid balances (totalEarned < currentBalance)`);
  } else {
    console.log(`\n✓ All balances are valid`);
  }
}

/**
 * Generate CSV report
 */
function generateCSVReport(summary: ValidationSummary, filename: string = "referral-validation-report.csv"): void {
  const fs = require('fs');
  const path = require('path');
  
  const csvHeader = "Transaction ID,User ID,Referrer ID,Volume (USD),Old Earnings,New Earnings,Difference,% Difference\n";
  const csvRows = summary.results.map(r => 
    `${r.transactionId},${r.userId},${r.referrerId},${r.sellAmountUsd.toFixed(2)},${r.oldEarnings.toFixed(4)},${r.newEarnings.toFixed(4)},${r.difference.toFixed(4)},${r.percentageDiff.toFixed(2)}`
  ).join('\n');
  
  const csvContent = csvHeader + csvRows;
  const filepath = path.join(process.cwd(), 'output', filename);
  
  // Ensure output directory exists
  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(filepath, csvContent);
  console.log(`\n📄 CSV report generated: ${filepath}`);
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'sample';
  const limit = parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '50');

  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║     Referral Earnings Validation Script               ║");
  console.log("║     New Model: 1% of Transaction Volume               ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  try {
    if (mode === 'sample') {
      // Test with sample data (no DB connection needed)
      testSampleTransactions();
      await testEarningsService();
      
    } else if (mode === 'compare') {
      // Compare old vs new model with sample data
      testSampleTransactions();
      
    } else if (mode === 'live') {
      // Validate against live database
      console.log(`\nConnecting to database: ${MONGO_URI}`);
      await mongoose.connect(MONGO_URI);
      console.log("✓ Connected to database\n");

      await testEarningsService();
      const summary = await validateRecentTransactions(limit);
      displaySummary(summary);
      await validatePointsBalances();
      
      // Generate CSV report
      if (summary.totalTransactions > 0) {
        generateCSVReport(summary);
      }

      await mongoose.disconnect();
      console.log("\n✓ Disconnected from database");
      
    } else {
      console.log(`\n❌ Unknown mode: ${mode}`);
      console.log("\nAvailable modes:");
      console.log("  --mode=sample   : Test with sample transaction amounts (default)");
      console.log("  --mode=compare  : Compare old vs new model");
      console.log("  --mode=live     : Validate against live database");
      console.log("\nOptions:");
      console.log("  --limit=N       : Number of recent transactions to analyze (default: 50)");
      process.exit(1);
    }

    console.log("\n✓ Validation complete\n");
    
  } catch (error) {
    console.error("\n❌ Error during validation:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export {
  calculateOldEarnings,
  calculateNewEarnings,
  testSampleTransactions,
  validateRecentTransactions,
  ValidationResult,
  ValidationSummary
};
