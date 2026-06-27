/**
 * Diagnostic script to check Crossmint configuration
 * Run with: npx ts-node scripts/check-crossmint-config.ts
 */

import dotenv from 'dotenv';
dotenv.config();

console.log("\n========================================");
console.log("🔍 CROSSMINT CONFIGURATION CHECK");
console.log("========================================\n");

const checks = [
  {
    name: "CROSSMINT_API_KEY",
    value: process.env.CROSSMINT_API_KEY,
    required: true,
    validation: (val: string) => val.startsWith('sk_'),
    hint: "Should start with 'sk_production_' or 'sk_staging_'"
  },
  {
    name: "CROSSMINT_BASE_URL",
    value: process.env.CROSSMINT_BASE_URL,
    required: true,
    validation: (val: string) => val.includes('crossmint.com'),
    hint: "Should be https://crossmint.com/api/2025-06-09"
  },
  {
    name: "CROSSMINT_ADMIN_SOLANA_ADDRESS",
    value: process.env.CROSSMINT_ADMIN_SOLANA_ADDRESS,
    required: true,
    validation: (val: string) => val.length >= 32 && val.length <= 44 && !val.startsWith('0x'),
    hint: "Should be a valid Solana address (base58, 32-44 chars)"
  },
  {
    name: "CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY",
    value: process.env.CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY,
    required: true,
    validation: (val: string) => val.length > 40,
    hint: "Should be a base58 encoded private key"
  },
  {
    name: "MAIN_WALLET_SOLANA_ADDRESS",
    value: process.env.MAIN_WALLET_SOLANA_ADDRESS,
    required: true,
    validation: (val: string) => val.length >= 32 && val.length <= 44 && !val.startsWith('0x'),
    hint: "Should be a valid Solana address"
  },
  {
    name: "CROSSMINT_ADMIN_EVM_ADDRESS",
    value: process.env.CROSSMINT_ADMIN_EVM_ADDRESS,
    required: false,
    validation: (val: string) => val.startsWith('0x') && val.length === 42,
    hint: "Should be a valid EVM address (0x...)"
  },
  {
    name: "CROSSMINT_ADMIN_EVM_PRIVATE_KEY",
    value: process.env.CROSSMINT_ADMIN_EVM_PRIVATE_KEY,
    required: false,
    validation: (val: string) => val.startsWith('0x') && val.length === 66,
    hint: "Should be a valid EVM private key (0x...)"
  }
];

let hasErrors = false;
let hasWarnings = false;

checks.forEach(check => {
  const status = check.value ? '✅' : (check.required ? '❌' : '⚠️');
  const displayValue = check.value 
    ? (check.value.substring(0, 10) + '...' + check.value.substring(check.value.length - 4))
    : 'NOT SET';
  
  console.log(`${status} ${check.name}`);
  console.log(`   Value: ${displayValue}`);
  
  if (!check.value) {
    if (check.required) {
      console.log(`   ❌ ERROR: Required but not set`);
      console.log(`   Hint: ${check.hint}`);
      hasErrors = true;
    } else {
      console.log(`   ⚠️  WARNING: Optional but not set`);
      console.log(`   Hint: ${check.hint}`);
      hasWarnings = true;
    }
  } else if (check.validation && !check.validation(check.value)) {
    console.log(`   ❌ ERROR: Invalid format`);
    console.log(`   Hint: ${check.hint}`);
    hasErrors = true;
  } else {
    console.log(`   ✅ Valid`);
  }
  
  console.log();
});

console.log("========================================");
if (hasErrors) {
  console.log("❌ CONFIGURATION HAS ERRORS");
  console.log("Please fix the errors above before running offramp.");
  process.exit(1);
} else if (hasWarnings) {
  console.log("⚠️  CONFIGURATION HAS WARNINGS");
  console.log("Some optional features may not work.");
  process.exit(0);
} else {
  console.log("✅ CONFIGURATION IS VALID");
  console.log("All required environment variables are set correctly.");
  process.exit(0);
}
