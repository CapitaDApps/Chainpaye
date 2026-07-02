/**
 * Test script: PCX initiate ramp payment
 * Run: node scripts/test-pcx-ramp.js [zar|rwf|kes-bank|kes-momo]
 * Requires PCXPAY_API_KEY, PCXPAY_ORG_ID, PCXPAY_USER_ID in .env
 */

// Load .env
try { require("dotenv").config(); } catch { /* dotenv optional */ }

const https = require("https");

const PCXPAY_BASE_URL = "https://prod-api.pcxpay.com";
const PCXPAY_API_KEY  = process.env.PCXPAY_API_KEY;
const PCXPAY_ORG_ID   = process.env.PCXPAY_ORG_ID;
const PCXPAY_USER_ID  = process.env.PCXPAY_USER_ID;

if (!PCXPAY_API_KEY || !PCXPAY_ORG_ID || !PCXPAY_USER_ID) {
  console.error("❌ Missing required env vars: PCXPAY_API_KEY, PCXPAY_ORG_ID, PCXPAY_USER_ID");
  process.exit(1);
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(PCXPAY_BASE_URL + path);
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": PCXPAY_API_KEY,
        Authorization: "None",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getRate(toCurrency) {
  const path = `/v1/organizations/admin/exchange-rate?fromCurrency=USD&toCurrency=${toCurrency}&orgId=${PCXPAY_ORG_ID}`;
  console.log(`\n📊 Fetching rate USD → ${toCurrency}...`);
  const res = await request("GET", path);
  if (res.status !== 200) {
    console.error("Rate fetch failed:", JSON.stringify(res.body, null, 2));
    throw new Error("Rate fetch failed");
  }
  const d = res.body.data;
  console.log(`   Rate: 1 USD = ${d.rate} ${toCurrency}, org_rate_id: ${d.org_rate_id}`);
  return { rate: Number(d.rate), orgRateId: d.org_rate_id };
}

async function initiateRamp(label, payload) {
  console.log(`\n🚀 [${label}] Initiating ramp payment...`);
  console.log("Payload:", JSON.stringify(payload, null, 2));
  const res = await request("POST", "/v1/payments-init/ramp", payload);
  if (res.status === 200 || res.status === 201) {
    console.log(`\n✅ [${label}] Success (${res.status}):`);
    console.log(JSON.stringify(res.body, null, 2));
  } else {
    console.error(`\n❌ [${label}] Failed (${res.status}):`);
    console.error(JSON.stringify(res.body, null, 2));
  }
}

async function testZar() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST: ZAR — Bank Transfer");
  console.log("=".repeat(60));
  const { rate, orgRateId } = await getRate("ZAR");
  await initiateRamp("ZAR", {
    org_id: PCXPAY_ORG_ID, user_id: PCXPAY_USER_ID,
    direction: "off_ramp", fiat_currency: "ZAR", fiat_amount: 1000,
    crypto_currency: "USDC", crypto_network: "BASE",
    client_rate: rate, org_rate_id: orgRateId, country: "ZA",
    payment_method: "bank_transfer",
    payer_details: { email: "test@chainpaye.com", name: "Test User", phone: "+27000000000" },
    beneficiary_id: "12345", beneficiary_name: "Test Beneficiary",
    destination: { accountNumber: "1234567890", bankCode: "051001", bankName: "Standard Bank" },
    metadata: { partner_transaction_id: `test-zar-${Date.now()}` },
  });
}

async function testRwf() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST: RWF — Mobile Money");
  console.log("=".repeat(60));
  const { rate, orgRateId } = await getRate("RWF");
  await initiateRamp("RWF", {
    org_id: PCXPAY_ORG_ID, user_id: PCXPAY_USER_ID,
    direction: "off_ramp", fiat_currency: "RWF", fiat_amount: 5000,
    crypto_currency: "USDC", crypto_network: "BASE",
    client_rate: rate, org_rate_id: orgRateId, country: "RW",
    payment_method: "mobile_money",
    payer_details: { email: "test@chainpaye.com", name: "Test User", phone: "+250700000000" },
    beneficiary_id: "12345", beneficiary_name: "Test Beneficiary",
    mobile_money_details: { provider: "MTN_Rwanda", phone_number: "+250781234567" },
    destination: { accountNumber: "+250781234567", bankCode: "MTN", bankName: "MTN_Rwanda" },
    metadata: { partner_transaction_id: `test-rwf-${Date.now()}` },
  });
}

async function testKesBank() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST: KES — Bank Transfer");
  console.log("=".repeat(60));
  const { rate, orgRateId } = await getRate("KES");
  await initiateRamp("KES-BANK", {
    org_id: PCXPAY_ORG_ID, user_id: PCXPAY_USER_ID,
    direction: "off_ramp", fiat_currency: "KES", fiat_amount: 500,
    crypto_currency: "USDC", crypto_network: "BASE",
    client_rate: rate, org_rate_id: orgRateId, country: "KE",
    payment_method: "bank_transfer",
    payer_details: { email: "test@chainpaye.com", name: "Test User", phone: "+254700000000" },
    beneficiary_id: "12345", beneficiary_name: "Test Beneficiary",
    destination: { accountNumber: "1234567890", bankCode: "410506", bankName: "Access Bank" },
    metadata: { partner_transaction_id: `test-kes-bank-${Date.now()}` },
  });
}

async function testKesMomo() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST: KES — Mobile Money (M-PESA)");
  console.log("=".repeat(60));
  const { rate, orgRateId } = await getRate("KES");
  await initiateRamp("KES-MOMO", {
    org_id: PCXPAY_ORG_ID, user_id: PCXPAY_USER_ID,
    direction: "off_ramp", fiat_currency: "KES", fiat_amount: 500,
    crypto_currency: "USDC", crypto_network: "BASE",
    client_rate: rate, org_rate_id: orgRateId, country: "KE",
    payment_method: "mobile_money",
    payer_details: { email: "test@chainpaye.com", name: "Test User", phone: "+254700000000" },
    beneficiary_id: "12345", beneficiary_name: "Test Beneficiary",
    mobile_money_details: { provider: "M PESA", phone_number: "+254712345678" },
    destination: { accountNumber: "+254712345678", bankCode: "M PESA", bankName: "M PESA" },
    metadata: { partner_transaction_id: `test-kes-momo-${Date.now()}` },
  });
}

async function main() {
  const arg = process.argv[2];
  try {
    if (!arg || arg === "zar")      await testZar();
    if (!arg || arg === "rwf")      await testRwf();
    if (!arg || arg === "kes-bank") await testKesBank();
    if (!arg || arg === "kes-momo") await testKesMomo();
  } catch (e) {
    console.error("Fatal:", e.message);
  }
  console.log("\n" + "=".repeat(60));
  console.log("Done.");
}

main();
