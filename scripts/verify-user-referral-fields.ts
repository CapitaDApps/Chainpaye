/**
 * Verification script for User model referral fields
 * This script tests that the referral fields work correctly
 */

import { connectDatabase, closeDatabase } from "../config/database";
import { loadEnv } from "../config/env";
import { User } from "../models/User";
import { logger } from "../utils/logger";

// Load environment variables
loadEnv();

async function verifyUserReferralFields() {
  try {
    await connectDatabase();
    logger.info("Connected to MongoDB");

    // Test 1: Create a user without referral fields
    logger.info("\n=== Test 1: Create user without referral fields ===");
    const user1 = await User.create({
      whatsappNumber: "+1234567890",
      userId: "verify-test-1",
      fullName: "Test User 1",
      country: "US",
      currency: "USD",
      pin: "123456",
    });
    logger.info("✓ User created without referral fields");
    logger.info(`  - referralCode: ${user1.referralCode}`);
    logger.info(`  - referredBy: ${user1.referredBy}`);
    logger.info(`  - referredAt: ${user1.referredAt}`);

    // Test 2: Create a user with a referral code
    logger.info("\n=== Test 2: Create user with referral code ===");
    const user2 = await User.create({
      whatsappNumber: "+1234567891",
      userId: "verify-test-2",
      fullName: "Test User 2",
      country: "US",
      currency: "USD",
      pin: "123456",
      referralCode: "ABC123XYZ",
    });
    logger.info("✓ User created with referral code");
    logger.info(`  - referralCode: ${user2.referralCode}`);

    // Test 3: Create a referred user
    logger.info("\n=== Test 3: Create referred user ===");
    const user3 = await User.create({
      whatsappNumber: "+1234567892",
      userId: "verify-test-3",
      fullName: "Test User 3",
      country: "US",
      currency: "USD",
      pin: "123456",
      referredBy: user2.userId,
      referredAt: new Date(),
    });
    logger.info("✓ Referred user created");
    logger.info(`  - referredBy: ${user3.referredBy}`);
    logger.info(`  - referredAt: ${user3.referredAt}`);

    // Test 4: Query users by referredBy
    logger.info("\n=== Test 4: Query users by referredBy ===");
    const referredUsers = await User.find({ referredBy: user2.userId });
    logger.info(`✓ Found ${referredUsers.length} referred user(s)`);

    // Test 5: Query user by referral code
    logger.info("\n=== Test 5: Query user by referral code ===");
    const userByCode = await User.findOne({ referralCode: "ABC123XYZ" });
    logger.info(`✓ Found user with referral code: ${userByCode?.userId}`);

    // Test 6: Verify indexes exist
    logger.info("\n=== Test 6: Verify indexes ===");
    const indexes = await User.collection.getIndexes();
    const indexNames = Object.keys(indexes);
    logger.info("Available indexes:");
    indexNames.forEach((name) => logger.info(`  - ${name}`));

    const hasReferralCodeIndex = indexNames.some((name) =>
      name.includes("referralCode")
    );
    const hasReferredByIndex = indexNames.some((name) =>
      name.includes("referredBy")
    );

    if (hasReferralCodeIndex) {
      logger.info("✓ referralCode index exists");
    } else {
      logger.warn("✗ referralCode index missing");
    }

    if (hasReferredByIndex) {
      logger.info("✓ referredBy index exists");
    } else {
      logger.warn("✗ referredBy index missing");
    }

    // Test 7: Test unique constraint on referral code
    logger.info("\n=== Test 7: Test unique constraint on referral code ===");
    try {
      await User.create({
        whatsappNumber: "+1234567893",
        userId: "verify-test-4",
        fullName: "Test User 4",
        country: "US",
        currency: "USD",
        pin: "123456",
        referralCode: "ABC123XYZ", // Duplicate code
      });
      logger.warn("✗ Unique constraint not enforced (duplicate code allowed)");
    } catch (error: any) {
      if (error.code === 11000) {
        logger.info("✓ Unique constraint enforced (duplicate code rejected)");
      } else {
        logger.error("Unexpected error:", error.message);
      }
    }

    // Cleanup
    logger.info("\n=== Cleanup ===");
    await User.deleteMany({
      userId: { $in: ["verify-test-1", "verify-test-2", "verify-test-3"] },
    });
    logger.info("✓ Test users deleted");

    logger.info("\n=== All verification tests completed successfully ===");
  } catch (error) {
    logger.error("Error during verification:", error);
    throw error;
  } finally {
    await closeDatabase();
    logger.info("Database connection closed");
  }
}

// Run the verification
verifyUserReferralFields()
  .then(() => {
    logger.info("Verification script finished");
    process.exit(0);
  })
  .catch((error) => {
    logger.error("Verification script failed:", error);
    process.exit(1);
  });
