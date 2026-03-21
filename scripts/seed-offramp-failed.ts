import { loadEnv } from "../config/env";
loadEnv();

import path from "path";
import { connectDatabase, closeDatabase } from "../config/database";
import { User } from "../models/User";
import { OfframpTransaction } from "../models/OfframpTransaction";

async function main() {
  await connectDatabase();

  const users = await User.find({}).limit(2).lean();
  const userA = users[0]!;
  const userB = users[1];

  const seedData: any[] = require(path.resolve(__dirname, "offramp-failed-data.json"));

  const docs = seedData.map((record, i) => ({
    ...record,
    userId: (userB && i % 2 !== 0 ? userB : userA)._id,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  }));

  await OfframpTransaction.insertMany(docs, { ordered: false });
  console.log(`✅ Inserted ${docs.length} failed offramp transactions`);

  await closeDatabase();
}

main().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
