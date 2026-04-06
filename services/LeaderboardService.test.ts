/**
 * LeaderboardService Property-Based Tests
 * 
 * Tests universal properties of the leaderboard service using fast-check.
 * Validates: Properties 27-28
 */

import * as fc from "fast-check";
import { LeaderboardService } from "./LeaderboardService";
import { User } from "../models/User";
import { PointsBalance } from "../models/PointsBalance";
import { ReferralRelationship } from "../models/ReferralRelationship";
import mongoose from "mongoose";

describe("LeaderboardService Property-Based Tests", () => {
  let leaderboardService: LeaderboardService;
  let mongoConnected = false;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/referral-test";
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
      mongoConnected = true;
    } catch (error) {
      console.warn("MongoDB not available, skipping LeaderboardService tests");
      mongoConnected = false;
    }
  }, 10000);

  afterAll(async () => {
    if (mongoConnected) {
      await mongoose.connection.close();
    }
  }, 10000);

  beforeEach(async () => {
    if (!mongoConnected) {
      return; // Skip if MongoDB not available
    }
    
    leaderboardService = new LeaderboardService();
    
    // Clear all collections
    await User.deleteMany({});
    await PointsBalance.deleteMany({});
    await ReferralRelationship.deleteMany({});
    
    // Clear cache
    leaderboardService.clearCache();
  });

  /**
   * Property 27: Leaderboard sorting correctness
   * For any leaderboard with N entries, each entry at position i should have
   * totalEarned >= totalEarned of entry at position i+1 (descending order)
   * 
   * **Validates: Requirements 7.1**
   */
  test("Property 27: leaderboard should be sorted by totalEarned in descending order", async () => {
    if (!mongoConnected) {
      console.warn("Skipping test: MongoDB not available");
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: fc.string({ minLength: 5, maxLength: 20 }),
            totalEarned: fc.float({ min: 0, max: 100000, noNaN: true }),
          }),
          { minLength: 2, maxLength: 20 }
        ),
        async (users) => {
          // Ensure unique user IDs
          const uniqueUsers = Array.from(
            new Map(users.map(u => [u.userId, u])).values()
          );

          if (uniqueUsers.length < 2) return; // Skip if not enough unique users

          // Setup: Create users and point balances
          for (const user of uniqueUsers) {
            await User.create({
              userId: user.userId,
              phoneNumber: `+${Math.random().toString().slice(2, 12)}`,
              kycStatus: "approved",
              referralCode: `CODE${user.userId}`,
            });

            await PointsBalance.create({
              userId: user.userId,
              currentBalance: user.totalEarned,
              totalEarned: user.totalEarned,
              lastUpdated: new Date(),
            });
          }

          // Execute
          const leaderboard = await leaderboardService.getLeaderboard(uniqueUsers.length);

          // Verify sorting: each entry should have totalEarned >= next entry
          for (let i = 0; i < leaderboard.length - 1; i++) {
            expect(leaderboard[i].totalEarned).toBeGreaterThanOrEqual(
              leaderboard[i + 1].totalEarned
            );
          }

          // Verify ranks are sequential
          for (let i = 0; i < leaderboard.length; i++) {
            expect(leaderboard[i].rank).toBe(i + 1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 28: Leaderboard entry completeness
   * For any entry in the leaderboard, it should include userId, totalEarned, and totalReferred fields
   * 
   * **Validates: Requirements 7.2, 7.3**
   */
  test("Property 28: each leaderboard entry should include all required fields", async () => {
    if (!mongoConnected) {
      console.warn("Skipping test: MongoDB not available");
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: fc.string({ minLength: 5, maxLength: 20 }),
            totalEarned: fc.float({ min: 0, max: 100000, noNaN: true }),
            referredCount: fc.integer({ min: 0, max: 50 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (users) => {
          // Ensure unique user IDs
          const uniqueUsers = Array.from(
            new Map(users.map(u => [u.userId, u])).values()
          );

          // Setup: Create users, point balances, and referral relationships
          for (const user of uniqueUsers) {
            await User.create({
              userId: user.userId,
              phoneNumber: `+${Math.random().toString().slice(2, 12)}`,
              kycStatus: "approved",
              referralCode: `CODE${user.userId}`,
            });

            await PointsBalance.create({
              userId: user.userId,
              currentBalance: user.totalEarned,
              totalEarned: user.totalEarned,
              lastUpdated: new Date(),
            });

            // Create referral relationships
            for (let i = 0; i < user.referredCount; i++) {
              await ReferralRelationship.create({
                referrerId: user.userId,
                referredUserId: `referred-${user.userId}-${i}`,
                referralCode: `CODE${user.userId}`,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              });
            }
          }

          // Execute
          const leaderboard = await leaderboardService.getLeaderboard(uniqueUsers.length);

          // Verify each entry has all required fields
          for (const entry of leaderboard) {
            expect(entry).toHaveProperty("userId");
            expect(entry).toHaveProperty("username");
            expect(entry).toHaveProperty("totalEarned");
            expect(entry).toHaveProperty("totalReferred");
            expect(entry).toHaveProperty("rank");

            // Verify types
            expect(typeof entry.userId).toBe("string");
            expect(typeof entry.username).toBe("string");
            expect(typeof entry.totalEarned).toBe("number");
            expect(typeof entry.totalReferred).toBe("number");
            expect(typeof entry.rank).toBe("number");

            // Verify non-negative values
            expect(entry.totalEarned).toBeGreaterThanOrEqual(0);
            expect(entry.totalReferred).toBeGreaterThanOrEqual(0);
            expect(entry.rank).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
