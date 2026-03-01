/**
 * DashboardService Property-Based Tests
 * 
 * Tests universal properties of the dashboard service using fast-check.
 * Validates: Properties 23-26
 */

import * as fc from "fast-check";
import { DashboardService } from "./DashboardService";
import { User } from "../models/User";
import { ReferralRelationship } from "../models/ReferralRelationship";
import { PointsBalance } from "../models/PointsBalance";
import { EarningsTransaction } from "../models/EarningsTransaction";
import mongoose from "mongoose";

describe("DashboardService Property-Based Tests", () => {
  let dashboardService: DashboardService;
  let mongoConnected = false;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/referral-test";
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
      mongoConnected = true;
    } catch (error) {
      console.warn("MongoDB not available, skipping DashboardService tests");
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
    
    dashboardService = new DashboardService();
    
    // Clear all collections
    await User.deleteMany({});
    await ReferralRelationship.deleteMany({});
    await PointsBalance.deleteMany({});
    await EarningsTransaction.deleteMany({});
    
    // Clear cache
    dashboardService.clearAllCache();
  });

  /**
   * Property 23: Dashboard completeness
   * For any user requesting their dashboard, the response should include all required fields
   * 
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8**
   */
  test("Property 23: dashboard should include all required fields", async () => {
    if (!mongoConnected) {
      console.warn("Skipping test: MongoDB not available");
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }), // userId
        fc.string({ minLength: 6, maxLength: 12 }), // referralCode
        async (userId, referralCode) => {
          // Setup: Create user with referral code
          await User.create({
            userId,
            phoneNumber: `+1234567890`,
            kycStatus: "approved",
            referralCode,
          });

          // Execute
          const dashboard = await dashboardService.getDashboard(userId);

          // Verify all required fields are present
          expect(dashboard).toHaveProperty("referralCode");
          expect(dashboard).toHaveProperty("referralLink");
          expect(dashboard).toHaveProperty("totalReferred");
          expect(dashboard).toHaveProperty("currentBalance");
          expect(dashboard).toHaveProperty("totalEarned");
          expect(dashboard).toHaveProperty("totalVolume");
          expect(dashboard).toHaveProperty("totalFees");
          expect(dashboard).toHaveProperty("totalEarnings");

          // Verify types
          expect(typeof dashboard.referralCode).toBe("string");
          expect(typeof dashboard.referralLink).toBe("string");
          expect(typeof dashboard.totalReferred).toBe("number");
          expect(typeof dashboard.currentBalance).toBe("number");
          expect(typeof dashboard.totalEarned).toBe("number");
          expect(typeof dashboard.totalVolume).toBe("number");
          expect(typeof dashboard.totalFees).toBe("number");
          expect(typeof dashboard.totalEarnings).toBe("number");

          // Verify referral code matches
          expect(dashboard.referralCode).toBe(referralCode);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 24: Referral count accuracy
   * For any user, the totalReferred count should equal the number of users with referral relationships
   * 
   * **Validates: Requirements 6.3**
   */
  test("Property 24: totalReferred should equal actual referral relationship count", async () => {
    if (!mongoConnected) {
      console.warn("Skipping test: MongoDB not available");
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }), // referrerId
        fc.string({ minLength: 6, maxLength: 12 }), // referralCode
        fc.array(fc.string({ minLength: 5, maxLength: 20 }), { minLength: 0, maxLength: 10 }), // referredUserIds
        async (referrerId, referralCode, referredUserIds) => {
          // Ensure unique user IDs
          const uniqueReferredIds = [...new Set(referredUserIds)].filter(id => id !== referrerId);

          // Setup: Create referrer
          await User.create({
            userId: referrerId,
            phoneNumber: `+1234567890`,
            kycStatus: "approved",
            referralCode,
          });

          // Create referral relationships
          for (const referredUserId of uniqueReferredIds) {
            await ReferralRelationship.create({
              referrerId,
              referredUserId,
              referralCode,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });
          }

          // Execute
          const dashboard = await dashboardService.getDashboard(referrerId);

          // Verify
          expect(dashboard.totalReferred).toBe(uniqueReferredIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 25: Volume aggregation accuracy
   * For any user, totalVolume should equal sum of all transaction amounts from earnings
   * 
   * **Validates: Requirements 6.6**
   */
  test("Property 25: totalVolume should equal sum of all transaction amounts", async () => {
    if (!mongoConnected) {
      console.warn("Skipping test: MongoDB not available");
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }), // userId
        fc.string({ minLength: 6, maxLength: 12 }), // referralCode
        fc.array(
          fc.record({
            transactionAmount: fc.float({ min: 1, max: 10000, noNaN: true }),
            referredUserId: fc.string({ minLength: 5, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        async (userId, referralCode, transactions) => {
          // Setup: Create user
          await User.create({
            userId,
            phoneNumber: `+1234567890`,
            kycStatus: "approved",
            referralCode,
          });

          // Create earnings transactions
          let expectedVolume = 0;
          for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            const feeAmount = tx.transactionAmount * 0.015;
            const earningsAmount = feeAmount * 0.25;
            
            await EarningsTransaction.create({
              userId,
              referredUserId: tx.referredUserId,
              offrampTransactionId: `tx-${i}`,
              amount: earningsAmount,
              feeAmount,
              transactionAmount: tx.transactionAmount,
              timestamp: new Date(),
            });

            expectedVolume += tx.transactionAmount;
          }

          // Execute
          const dashboard = await dashboardService.getDashboard(userId);

          // Verify (with floating point tolerance)
          expect(dashboard.totalVolume).toBeCloseTo(expectedVolume, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 26: Fee aggregation accuracy
   * For any user, totalFees should equal sum of all fee amounts from earnings
   * 
   * **Validates: Requirements 6.7**
   */
  test("Property 26: totalFees should equal sum of all fee amounts", async () => {
    if (!mongoConnected) {
      console.warn("Skipping test: MongoDB not available");
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }), // userId
        fc.string({ minLength: 6, maxLength: 12 }), // referralCode
        fc.array(
          fc.record({
            transactionAmount: fc.float({ min: 1, max: 10000, noNaN: true }),
            referredUserId: fc.string({ minLength: 5, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        async (userId, referralCode, transactions) => {
          // Setup: Create user
          await User.create({
            userId,
            phoneNumber: `+1234567890`,
            kycStatus: "approved",
            referralCode,
          });

          // Create earnings transactions
          let expectedFees = 0;
          for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            const feeAmount = tx.transactionAmount * 0.015;
            const earningsAmount = feeAmount * 0.25;
            
            await EarningsTransaction.create({
              userId,
              referredUserId: tx.referredUserId,
              offrampTransactionId: `tx-${i}`,
              amount: earningsAmount,
              feeAmount,
              transactionAmount: tx.transactionAmount,
              timestamp: new Date(),
            });

            expectedFees += feeAmount;
          }

          // Execute
          const dashboard = await dashboardService.getDashboard(userId);

          // Verify (with floating point tolerance)
          expect(dashboard.totalFees).toBeCloseTo(expectedFees, 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
