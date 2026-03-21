import { loadEnv } from "../config/env";
loadEnv();

import path from "path";
import { connectDatabase, closeDatabase } from "../config/database";
import { User } from "../models/User";
import { OfframpTransaction } from "../models/OfframpTransaction";

const PHONES = [
  "+2349039221043",
  "+2347059187782",
  "+2349018958943",
  "+2347031130727",
];

async function main() {
  await connectDatabase();

  // Fetch real users by phone number
  const users = await User.find({ whatsappNumber: { $in: PHONES } }).lean();
  if (users.length < 1) {
    console.error("❌ No matching users found for the specified phone numbers.");
    await closeDatabase();
    process.exit(1);
  }

  // Build phone → ObjectId map
  const phoneToId = new Map(users.map((u) => [u.whatsappNumber, u._id]));
  console.log(`✅ Found ${users.length} users:`);
  users.forEach((u) => console.log(`   ${u.whatsappNumber} → ${u._id} (${u.fullName})`));

  // Warn about any missing phones
  PHONES.forEach((p) => {
    if (!phoneToId.has(p)) console.warn(`   ⚠️  No user found for ${p} — will skip those records`);
  });

  // Load pre-generated seed data
  const seedData: any[] = require(path.resolve(__dirname, "offramp-seed-data.json"));

  // Assign userId from the phone field, skip records whose phone isn't in DB
  const docs = seedData
    .filter((r) => phoneToId.has(r.phone))
    .map((record) => {
      const doc: any = { ...record };
      doc.userId = phoneToId.get(record.phone);
      delete doc.phone;
      doc.createdAt = new Date(record.createdAt);
      doc.updatedAt = new Date(record.updatedAt);
      if (record.completedAt) doc.completedAt = new Date(record.completedAt);
      return doc;
    });

  if (docs.length === 0) {
    console.error("❌ No records to insert after phone matching.");
    await closeDatabase();
    process.exit(1);
  }

  // Clear existing offramp data before re-seeding
  await OfframpTransaction.deleteMany({});
  console.log("🗑  Cleared existing offramp transactions");

  await OfframpTransaction.insertMany(docs, { ordered: false });

  const completed = docs.filter((d) => d.status === "completed");
  const failed    = docs.filter((d) => d.status === "failed");
  const totalCrypto = completed.reduce((s, d) => s + d.cryptoAmount, 0);
  const totalNgn    = completed.reduce((s, d) => s + d.ngnAmount, 0);

  console.log(`\n✅ Inserted ${docs.length} offramp transactions`);
  console.log(`   Completed: ${completed.length}  |  Failed: ${failed.length}`);
  console.log(`   Total crypto (completed): $${totalCrypto.toFixed(4)}`);
  console.log(`   Total NGN   (completed): ₦${totalNgn.toLocaleString()}`);
  console.log(`   Fee per tx: $0.30 (fixed)`);

  await closeDatabase();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
