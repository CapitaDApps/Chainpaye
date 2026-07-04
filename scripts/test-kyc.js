/**
 * KYC Test Script — Nigeria (BVN + NIN)
 * Tests both the raw Dojah API responses AND the full name/DOB matching logic.
 * Run: node scripts/test-kyc.js
 */

try { require("dotenv").config(); } catch { /* optional */ }

const https = require("https");

const BASE_URL   = process.env.DOJAH_BASE_URL   || "https://api.dojah.io";
const APP_ID     = process.env.DOJAH_APP_ID      || "";
const AUTH_KEY   = process.env.DOJAH_AUTHORIZATION || "";

// ─── Test user ────────────────────────────────────────────────────────────────
const USER = {
  firstName:  "Joseph",
  lastName:   "Paul",
  middleName: "Kaka",
  dob:        "1996-07-03",
  bvn:        "22290356195",
  nin:        "23723164655",
};

// ─── HTTPS helper ─────────────────────────────────────────────────────────────
function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        "AppId": APP_ID,
        "Authorization": AUTH_KEY,
        "Content-Type": "application/json",
      },
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
    req.end();
  });
}

// ─── Similarity (Dice coefficient bigrams) ────────────────────────────────────
function buildBigrams(str) {
  const s = (str || "").toLowerCase().replace(/\s+/g, "");
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}
function similarity(a, b) {
  if (!a || !b) return 0;
  const ba = buildBigrams(a), bb = buildBigrams(b);
  let inter = 0;
  for (const bg of ba) if (bb.has(bg)) inter++;
  return (2 * inter) / (ba.size + bb.size);
}
function namesMatch(userFirst, userLast, entityFirst, entityLast) {
  const threshold = 0.6;
  const fwd  = similarity(userFirst, entityFirst) >= threshold && similarity(userLast, entityLast) >= threshold;
  const swap = similarity(userFirst, entityLast)  >= threshold && similarity(userLast, entityFirst) >= threshold;
  return { match: fwd || swap, scores: {
    "first→first": similarity(userFirst, entityFirst).toFixed(2),
    "last→last":   similarity(userLast,  entityLast).toFixed(2),
    "first→last":  similarity(userFirst, entityLast).toFixed(2),
    "last→first":  similarity(userLast,  entityFirst).toFixed(2),
  }};
}
function normaliseDob(raw) {
  if (!raw) return "";
  const cleaned = (raw + "").trim().replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  const p = cleaned.split("-");
  if (p.length === 3 && (p[0]||"").length <= 2)
    return `${p[2]}-${(p[1]||"").padStart(2,"0")}-${(p[0]||"").padStart(2,"0")}`;
  return cleaned;
}

// ─── Print helper ─────────────────────────────────────────────────────────────
function section(title) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}
function result(label, ok, detail) {
  const icon = ok ? "✅" : "❌";
  console.log(`${icon}  ${label}${detail ? ": " + detail : ""}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
async function testBVN() {
  section("TEST 1: BVN Verification");
  console.log(`   BVN:   ${USER.bvn}`);
  console.log(`   Name:  ${USER.firstName} ${USER.lastName}`);
  console.log(`   DOB:   ${USER.dob}`);

  const path = `/api/v1/kyc/bvn?bvn=${USER.bvn}&first_name=${USER.firstName}&last_name=${USER.lastName}&dob=${USER.dob}`;
  const res = await get(path);

  console.log("\n  Raw API response:");
  console.log(JSON.stringify(res.body, null, 4));

  const entity = res.body?.entity;
  if (!entity?.bvn) {
    result("API lookup", false, `Status ${res.status}: ${res.body?.error || res.body?.message || "no entity"}`);
    return;
  }
  result("API lookup", true, "BVN found");
  result("First name match", entity.first_name?.status === true, `Dojah flag=${entity.first_name?.status}`);
  result("Last name match",  entity.last_name?.status  === true, `Dojah flag=${entity.last_name?.status}`);
  result("DOB match",        entity.date_of_birth?.status === true, `Dojah flag=${entity.date_of_birth?.status}`);
}

async function testNIN() {
  section("TEST 2: NIN Verification");
  console.log(`   NIN:   ${USER.nin}`);
  console.log(`   Name:  ${USER.firstName} ${USER.lastName}`);
  console.log(`   DOB:   ${USER.dob}`);

  const path = `/api/v1/kyc/nin?nin=${USER.nin}`;
  const res = await get(path);

  console.log("\n  Raw API response:");
  console.log(JSON.stringify(res.body, null, 4));

  const entity = res.body?.entity;
  if (!entity?.first_name) {
    result("API lookup", false, `Status ${res.status}: ${res.body?.error || res.body?.message || "no entity"}`);
    return;
  }
  result("API lookup", true, "NIN found");

  // DOB check
  const entityDob  = normaliseDob(entity.date_of_birth);
  const userDob    = normaliseDob(USER.dob);
  const dobOk      = entityDob === userDob;
  result("DOB match", dobOk, `user=${userDob}, entity=${entityDob}`);

  // Name similarity check
  const nameCheck = namesMatch(USER.firstName, USER.lastName, entity.first_name, entity.last_name);
  result("Name match (≥60% similarity)", nameCheck.match, JSON.stringify(nameCheck.scores));

  // Try with middle name as last name
  const nameCheck2 = namesMatch(USER.firstName, USER.lastName, entity.first_name, entity.middle_name);
  if (!nameCheck.match && nameCheck2.match) {
    result("Name match (last vs middle name)", nameCheck2.match, JSON.stringify(nameCheck2.scores));
  }
}

async function testNINSwapped() {
  section("TEST 3: NIN with first/last name swapped (Joseph=last, Paul=first)");
  const path = `/api/v1/kyc/nin?nin=${USER.nin}`;
  const res = await get(path);
  const entity = res.body?.entity;
  if (!entity?.first_name) { console.log("  (skipped — NIN not found)"); return; }

  const nameCheck = namesMatch(USER.lastName, USER.firstName, entity.first_name, entity.last_name);
  result("Swapped name match", nameCheck.match, JSON.stringify(nameCheck.scores));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!APP_ID || !AUTH_KEY) {
    console.error("❌ Missing DOJAH_APP_ID or DOJAH_AUTHORIZATION in env");
    process.exit(1);
  }
  console.log(`\nDojah base URL: ${BASE_URL}`);
  console.log(`AppId: ${APP_ID}`);

  await testBVN();
  await testNIN();
  await testNINSwapped();

  console.log("\n" + "=".repeat(60));
  console.log("  Done.");
  console.log("=".repeat(60) + "\n");
}

main().catch(console.error);
