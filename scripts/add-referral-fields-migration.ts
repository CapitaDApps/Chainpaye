/**
 * Migration script to add referral fields to existing User documents
 * This script ensures all existing users have the new referral fields initialized
 */

import mongoose from "mongoose";
import { connectDatabase, closeDatabase } from "../config/database";
import { loadEnv } from "../config/env";
import { logger } from "../utils/logger";

// Load environment variables
loadEnv();

async function addReferralFieldsMigration() {
  try {
    await connectDatabase();
    logger.info("Connected to MongoDB");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }

    const usersCollection = db.collection("users");

    // Check existing indexes
    const existingIndexes = await usersCollection.indexInformation();
    logger.info("Existing indexes:", Object.keys(existingIndexes));

    // Create indexes for referral fields if they don't exist
    if (!existingIndexes.referralCode_1) {
      await usersCollection.createIndex(
        { referralCode: 1 },
        { unique: true, sparse: true }
      );
      logger.info("Created index on referralCode field");
    } else {
      logger.info("Index on referralCode already exists");
    }

    if (!existingIndexes.referredBy_1) {
      await usersCollection.createIndex({ referredBy: 1 });
      logger.info("Created index on referredBy field");
    } else {
      logger.info("Index on referredBy already exists");
    }

    // Count users that need migration
    const usersWithoutReferralFields = await usersCollection.countDocuments({
      referralCode: { $exists: false },
    });

    logger.info(
      `Found ${usersWithoutReferralFields} users without referral fields`
    );

    if (usersWithoutReferralFields > 0) {
      // Update existing users to ensure referral fields exist (set to null if not present)
      const result = await usersCollection.updateMany(
        { referralCode: { $exists: false } },
        {
          $set: {
            referralCode: null,
            referredBy: null,
            referredAt: null,
          },
        }
      );

      logger.info(
        `Migration completed: Updated ${result.modifiedCount} user documents`
      );
    } else {
      logger.info("No users need migration");
    }

    // Verify the migration
    const totalUsers = await usersCollection.countDocuments({});
    const usersWithReferralFields = await usersCollection.countDocuments({
      referralCode: { $exists: true },
    });

    logger.info(`Total users: ${totalUsers}`);
    logger.info(`Users with referral fields: ${usersWithReferralFields}`);

    // List all indexes for verification
    const finalIndexes = await usersCollection.indexInformation();
    logger.info("Final indexes:", Object.keys(finalIndexes));

    logger.info("Migration completed successfully");
  } catch (error) {
    logger.error("Error during migration:", error);
    throw error;
  } finally {
    await closeDatabase();
    logger.info("Database connection closed");
  }
}

// Run the migration
addReferralFieldsMigration()
  .then(() => {
    logger.info("Migration script finished");
    process.exit(0);
  })
  .catch((error) => {
    logger.error("Migration script failed:", error);
    process.exit(1);
  });
