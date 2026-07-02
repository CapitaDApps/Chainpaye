/**
 * Test script: Live Rates
 * Tests both DexPay (NGN) and PCX (other countries) rate fetching.
 * Run: node scripts/test-rates.js
 * Requires PCXPAY_API_KEY, PCXPAY_ORG_ID, DEXPAY_API_KEY, DEXPAY_API_SECRET in .env
 */

// Load .env
try { require("dotenv").config(); } catch { /* dotenv optional */ }

const https = require("https");

const PCXPAY_BASE_URL = "https://prod-api.pcxpay.com";
const PCXPAY_API_KEY  = process.env.PCXPAY_API_KEY;
const PCXPAY_ORG_ID   = process.env.PCXPAY_ORG_ID;

if (!PCXPAY_API_KEY || !PCXPAY_ORG_ID) {
  console.error("❌ Missing required env vars: PCXPAY_API_KEY, PCXPAY_ORG_ID");
  process.exit(1);
}

// ─── Generic HTTPS helper ─────────────────────────────────────────────────────
function request(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: { ...headers, ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    };
    const req = https.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
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

// ─── DexPay rate (NGN per token) ─────────────────────────────────────────────
async function getDexPayRate(asset, chain) {
  const apiKey    = process.env.DEXPAY_API_KEY    || "";
  const apiSecret = process.env.DEXPAY_API_SECRET || "";
  const baseUrl   = process.env.DEXPAY_BASE_URL   || "https://b2b.dexpay.io";

  const url = `${baseUrl}/rate/${asset.toUpperCase()}?fiatAmount=10000&chain=${chain}`;
  const headers = {
    "Content-Type": "application/json",
    "X-API-KEY": apiKey,
    "X-API-SECRET": apiSecret,
  };

  const res = await request("GET", url, headers, null);
  if (res.status !== 200) throw new Error(`DexPay error ${res.status}: ${JSON.stringify(res.body)}`);
  const quoteData = res.body.data;
  const rate = quoteData?.sell || quoteData?.rate || quoteData?.data?.rate;
  if (!rate || Number(rate) === 0) throw new Error(`No valid rate in response for ${asset}`);
  return Number(rate);
}

// ─── PCX rate (local currency per 1 USD) ─────────────────────────────────────
async function getPcxRate(toCurrency) {
  const url = `${PCXPAY_BASE_URL}/v1/organizations/admin/exchange-rate?fromCurrency=USD&toCurrency=${toCurrency}&orgId=${PCXPAY_ORG_ID}`;
  const headers = { "Content-Type": "application/json", "x-api-key": PCXPAY_API_KEY, Authorization: "None" };
  const res = await request("GET", url, headers, null);
  if (res.status !== 200) throw new Error(`PCX error ${res.status}: ${JSON.stringify(res.body)}`);
  const d = res.body.data;
  return { rate: Number(d.rate), orgRateId: d.org_rate_id };
}

// ─── Format number with commas ────────────────────────────────────────────────
function fmt(n, decimals = 2) {
  return Number(n).toLocaleString("en", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n📊 Fetching live exchange rates...\n");

  const results = [];
  const errors  = [];

  // DexPay: USDC → NGN
  try {
    const rate = await getDexPayRate("USDC", "BASE");
    results.push({ flag: "🇳🇬", label: "1 USDC", rate: `NGN ${fmt(rate)}` });
    console.log(`✅ USDC/NGN: ${fmt(rate)}`);
  } catch (e) {
    errors.push("USDC/NGN");
    console.error(`❌ USDC/NGN: ${e.message}`);
  }

  // DexPay: USDT → NGN
  try {
    const rate = await getDexPayRate("USDT", "BASE");
    results.push({ flag: "🇳🇬", label: "1 USDT", rate: `NGN ${fmt(rate)}` });
    console.log(`✅ USDT/NGN: ${fmt(rate)}`);
  } catch (e) {
    errors.push("USDT/NGN");
    console.error(`❌ USDT/NGN: ${e.message}`);
  }

  // PCX: 1 USD → each country currency
  const pcxList = [
    { currency: "KES", flag: "🇰🇪" },
    { currency: "ZAR", flag: "🇿🇦" },
    { currency: "RWF", flag: "🇷🇼" },
    { currency: "UGX", flag: "🇺🇬" },
    { currency: "TZS", flag: "🇹🇿" },
    { currency: "MWK", flag: "🇲🇼" },
  ];

  await Promise.allSettled(
    pcxList.map(async ({ currency, flag }) => {
      try {
        const { rate, orgRateId } = await getPcxRate(currency);
        results.push({ flag, label: "1 USD", rate: `${currency} ${fmt(rate)}` });
        console.log(`✅ USD/${currency}: ${fmt(rate)}  (org_rate_id: ${orgRateId})`);
      } catch (e) {
        errors.push(`USD/${currency}`);
        console.error(`❌ USD/${currency}: ${e.message}`);
      }
    })
  );

  // ── Format final message ────────────────────────────────────────────────────
  const ngnResults   = results.filter((r) => r.rate.startsWith("NGN"));
  const otherResults = results.filter((r) => !r.rate.startsWith("NGN"))
    .sort((a, b) => a.rate.split(" ")[0].localeCompare(b.rate.split(" ")[0]));

  let message = `\n📊 *Live Exchange Rates*\n`;
  message    += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (ngnResults.length) {
    message += `🇳🇬 *Nigeria (NGN)*\n`;
    for (const r of ngnResults) message += `  ${r.label} = ${r.rate}\n`;
    message += `\n`;
  }

  if (otherResults.length) {
    message += `🌍 *Other Countries (1 USD)*\n`;
    for (const r of otherResults) message += `  ${r.flag} ${r.label} = ${r.rate}\n`;
    message += `\n`;
  }

  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `⏱️ Rates are live and may change.\n`;
  message += `💡 Type *offramp* to start a withdrawal.`;

  if (errors.length) message += `\n\n⚠️ Unavailable: ${errors.join(", ")}`;

  console.log("\n" + "=".repeat(50));
  console.log("FINAL MESSAGE PREVIEW:");
  console.log("=".repeat(50));
  console.log(message);
  console.log("=".repeat(50) + "\n");
}

main().catch(console.error);
