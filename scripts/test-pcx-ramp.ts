/**
 * Test script for PCX initiate ramp payment endpoint.
 * Tests both bank_transfer and mobile_money payment methods.
 *
 * Run with:
 *   npx ts-node scripts/test-pcx-ramp.ts
 */

import axios from "axios";
import { loadEnv } from "../config/env";

loadEnv(false);

const PCXPAY_BASE_URL = "https://prod-api.pcxpay.com";
const PCXPAY_API_KEY  = process.env.PCXPAY_API_KEY  || "";
const PCXPAY_ORG_ID   = process.env.PCXPAY_ORG_ID   || "";
const PCXPAY_USER_ID  = process.env.PCXPAY_USER_ID  || "";

const headers = {
  "Content-Type": "application/json",
  "x-api-key": PCXPAY_API_KEY,
  Authorization: "None",
};

// ─── Step 1: Fetch live rate ──────────────────────────────────────────────────
async function getRate(toCurrency: string): Promise<{ rate: number; orgRateId: string }> {
  const url = `${PCXPAY_BASE_URL}/v1/organizations/admin/exchange-rate?fromCurrency=USD&toCurrency=${toCurrency}&orgId=${PCXPAY_ORG_ID}`;
  console.log(`\n📊 Fetching rate USD → ${toCurrency}...`);
  const res = await axios.get(url, { headers });
  console.log("Rate response:", JSON.stringify(res.data, null, 2));
  const data = res.data?.data;
  return { rate: Number(data.rate), orgRateId: data.org_rate_id };
}

// ─── Step 2: Initiate ramp payment ───────────────────────────────────────────
async function initiateRamp(payload: Record<string, unknown>): Promise<void> {
  console.log("\n🚀 Initiating ramp payment...");
  console.log("Payload:", JSON.stringify(payload, null, 2));
  try {
    const res = await axios.post(
      `${PCXPAY_BASE_URL}/v1/payments-init/ramp`,
      payload,
      { headers },
    );
    console.log("\n✅ Success:");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("\n❌ Error:");
    console.error("Status:", err.response?.status);
    console.error("Body:", JSON.stringify(err.response?.data, null, 2));
  }
}

// ─── Test 1: ZAR Bank Transfer ───────────────────────────────────────────────
async function testZarBankTransfer(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: ZAR — Bank Transfer");
  console.log("=".repeat(60));

  const { rate, orgRateId } = await getRate("ZAR");
  const fiatAmount = 1000; // ZAR 1,000

  await initiateRamp({
    org_id:           PCXPAY_ORG_ID,
    user_id:          PCXPAY_USER_ID,
    direction:        "off_ramp",
    fiat_currency:    "ZAR",
    fiat_amount:      fiatAmount,
    crypto_currency:  "USDC",
    crypto_network:   "BASE",
    client_rate:      rate,
    org_rate_id:      orgRateId,
    country:          "ZA",
    payment_method:   "bank_transfer",
    payer_details: {
      email: "test@chainpaye.com",
      name:  "Test User",
      phone: "+27000000000",
    },
    beneficiary_id:   "12345",
    beneficiary_name: "Test Beneficiary",
    destination: {
      accountNumber: "1234567890",
      bankCode:      "051001",   // Standard Bank ZA
      bankName:      "Standard Bank",
    },
    metadata: { partner_transaction_id: `test-zar-${Date.now()}` },
  });
}

// ─── Test 2: RWF Mobile Money ─────────────────────────────────────────────────
async function testRwfMobileMoney(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: RWF — Mobile Money");
  console.log("=".repeat(60));

  const { rate, orgRateId } = await getRate("RWF");
  const fiatAmount = 5000; // RWF 5,000

  await initiateRamp({
    org_id:           PCXPAY_ORG_ID,
    user_id:          PCXPAY_USER_ID,
    direction:        "off_ramp",
    fiat_currency:    "RWF",
    fiat_amount:      fiatAmount,
    crypto_currency:  "USDC",
    crypto_network:   "BASE",
    client_rate:      rate,
    org_rate_id:      orgRateId,
    country:          "RW",
    payment_method:   "mobile_money",
    payer_details: {
      email: "test@chainpaye.com",
      name:  "Test User",
      phone: "+250000000000",
    },
    beneficiary_id:   "12345",
    beneficiary_name: "Test Beneficiary",
    mobile_money_details: {
      provider:     "MTN_Rwanda",
      phone_number: "+250781234567",
    },
    destination: {
      accountNumber: "+250781234567",
      bankCode:      "MTN",
      bankName:      "MTN_Rwanda",
    },
    metadata: { partner_transaction_id: `test-rwf-${Date.now()}` },
  });
}

// ─── Test 3: KES Bank Transfer ────────────────────────────────────────────────
async function testKesBankTransfer(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: KES — Bank Transfer");
  console.log("=".repeat(60));

  const { rate, orgRateId } = await getRate("KES");
  const fiatAmount = 500; // KES 500

  await initiateRamp({
    org_id:           PCXPAY_ORG_ID,
    user_id:          PCXPAY_USER_ID,
    direction:        "off_ramp",
    fiat_currency:    "KES",
    fiat_amount:      fiatAmount,
    crypto_currency:  "USDC",
    crypto_network:   "BASE",
    client_rate:      rate,
    org_rate_id:      orgRateId,
    country:          "KE",
    payment_method:   "bank_transfer",
    payer_details: {
      email: "test@chainpaye.com",
      name:  "Test User",
      phone: "+254000000000",
    },
    beneficiary_id:   "12345",
    beneficiary_name: "Test Beneficiary",
    destination: {
      accountNumber: "1234567890",
      bankCode:      "410506",   // Access Bank KE
      bankName:      "Access Bank",
    },
    metadata: { partner_transaction_id: `test-kes-bank-${Date.now()}` },
  });
}

// ─── Test 4: KES Mobile Money ─────────────────────────────────────────────────
async function testKesMobileMoney(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: KES — Mobile Money (M-PESA)");
  console.log("=".repeat(60));

  const { rate, orgRateId } = await getRate("KES");
  const fiatAmount = 500;

  await initiateRamp({
    org_id:           PCXPAY_ORG_ID,
    user_id:          PCXPAY_USER_ID,
    direction:        "off_ramp",
    fiat_currency:    "KES",
    fiat_amount:      fiatAmount,
    crypto_currency:  "USDC",
    crypto_network:   "BASE",
    client_rate:      rate,
    org_rate_id:      orgRateId,
    country:          "KE",
    payment_method:   "mobile_money",
    payer_details: {
      email: "test@chainpaye.com",
      name:  "Test User",
      phone: "+254000000000",
    },
    beneficiary_id:   "12345",
    beneficiary_name: "Test Beneficiary",
    mobile_money_details: {
      provider:     "M PESA",
      phone_number: "+254712345678",
    },
    destination: {
      accountNumber: "+254712345678",
      bankCode:      "M PESA",
      bankName:      "M PESA",
    },
    metadata: { partner_transaction_id: `test-kes-momo-${Date.now()}` },
  });
}

// ─── Run all tests ────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const testArg = process.argv[2]; // optional: "zar" | "rwf" | "kes-bank" | "kes-momo"

  try {
    if (!testArg || testArg === "zar")      await testZarBankTransfer();
    if (!testArg || testArg === "rwf")      await testRwfMobileMoney();
    if (!testArg || testArg === "kes-bank") await testKesBankTransfer();
    if (!testArg || testArg === "kes-momo") await testKesMobileMoney();
  } catch (err: any) {
    console.error("Unhandled error:", err.message);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Done.");
}

main();
