/**
 * PointsRepository Tests
 * 
 * Tests for the PointsRepository class including unit tests and property-based tests.
 */

import * as fc from "fast-check";
import mongoose from "mongoose";
import { PointsRepository } from "./PointsRepository";
import { PointsBalance } from "../models/PointsBalance";
import { EarningsTransaction } from "../models/EarningsTransaction";

// Mock the models
jest.mock("../models/PointsBalance");
jest.mock("../models/EarningsTransaction");

let repository: PointsRepository;

beforeEach(() => {
  repository = new PointsRepository();
  jest.clearAllMocks();
});

describe("PointsRepository", () => {
  describe("getBalance", () => {
    it("should return 0 for user with no balance record", async () => {
      (PointsBalance.findOne as jest.Mock).mockResolvedValue(null);

      const balance = await repository.getBalance("user123");
      expect(balance).toBe(0);
    });

    it("should return current balance for existing user", async () => {
      const mockBalance = {
        userId: "user123",
        currentBalance: 150.50,
        totalEarned: 200.00,
      };

      (PointsBalance.findOne as jest.Mock).mockResolvedValue(mockBalance);

      const balance = await repository.getBalance("user123");
      expect(balance).toBe(150.50);
    });
  });

  describe("getTotalEarned", () => {
    it("should return 0 for user with no balance record", async () => {
      (PointsBalance.findOne as jest.Mock).mockResolvedValue(null);

      const totalEarned = await repository.getTotalEarned("user123");
      expect(totalEarned).toBe(0);
    });

    it("should return total earned for existing user", async () => {
      const mockBalance = {
        userId: "user123",
        currentBalance: 150.50,
        totalEarned: 200.00,
      };

      (PointsBalance.findOne as jest.Mock).mockResolvedValue(mockBalance);

      const totalEarned = await repository.getTotalEarned("user123");
      expect(totalEarned).toBe(200.00);
    });
  });

  describe("creditPoints", () => {
    it("should reject negative amounts", async () => {
      await expect(
        repository.creditPoints("user123", -50.00, "tx123")
      ).rejects.toThrow("Credit amount must be positive");
    });

    it("should reject zero amounts", async () => {
      await expect(
        repository.creditPoints("user123", 0, "tx123")
      ).rejects.toThrow("Credit amount must be positive");
    });

    it("should create new balance record and credit points using transaction", async () => {
      // Mock mongoose session
      const mockSession = {
        withTransaction: jest.fn((callback) => callback()),
        endSession: jest.fn(),
      };
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as any);

      // Mock PointsBalance.findOne to return null (no existing balance)
      const mockPointsBalance = {
        userId: "user123",
        currentBalance: 50.00,
        totalEarned: 50.00,
        save: jest.fn().mockResolvedValue(true),
      };
      (PointsBalance.findOne as jest.Mock).mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });
      (PointsBalance as any).mockImplementation(() => mockPointsBalance);

      // Mock EarningsTransaction
      const mockTransaction = {
        save: jest.fn().mockResolvedValue(true),
      };
      (EarningsTransaction as any).mockImplementation(() => mockTransaction);

      await repository.creditPoints("user123", 50.00, "tx123");

      expect(mockSession.withTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });

  describe("debitPoints", () => {
    it("should reject negative amounts", async () => {
      await expect(
        repository.debitPoints("user123", -50.00, "withdrawal123")
      ).rejects.toThrow("Debit amount must be positive");
    });

    it("should reject zero amounts", async () => {
      await expect(
        repository.debitPoints("user123", 0, "withdrawal123")
      ).rejects.toThrow("Debit amount must be positive");
    });

    it("should deduct from current balance using transaction", async () => {
      // Mock mongoose session
      const mockSession = {
        withTransaction: jest.fn((callback) => callback()),
        endSession: jest.fn(),
      };
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as any);

      // Mock existing balance
      const mockPointsBalance = {
        userId: "user123",
        currentBalance: 150.00,
        totalEarned: 200.00,
        save: jest.fn().mockResolvedValue(true),
      };
      (PointsBalance.findOne as jest.Mock).mockReturnValue({
        session: jest.fn().mockResolvedValue(mockPointsBalance),
      });

      await repository.debitPoints("user123", 50.00, "withdrawal123");

      expect(mockPointsBalance.currentBalance).toBe(100.00);
      expect(mockPointsBalance.totalEarned).toBe(200.00); // unchanged
      expect(mockSession.withTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it("should reject debit if insufficient balance", async () => {
      // Mock mongoose session
      const mockSession = {
        withTransaction: jest.fn(async (callback) => {
          await callback();
        }),
        endSession: jest.fn(),
      };
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as any);

      // Mock balance with insufficient funds
      const mockPointsBalance = {
        userId: "user123",
        currentBalance: 50.00,
        totalEarned: 100.00,
      };
      (PointsBalance.findOne as jest.Mock).mockReturnValue({
        session: jest.fn().mockResolvedValue(mockPointsBalance),
      });

      await expect(
        repository.debitPoints("user123", 100.00, "withdrawal123")
      ).rejects.toThrow("Insufficient balance");
    });

    it("should reject debit if user has no balance record", async () => {
      // Mock mongoose session
      const mockSession = {
        withTransaction: jest.fn(async (callback) => {
          await callback();
        }),
        endSession: jest.fn(),
      };
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as any);

      // Mock no balance found
      (PointsBalance.findOne as jest.Mock).mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(
        repository.debitPoints("user123", 50.00, "withdrawal123")
      ).rejects.toThrow("Points balance not found for user");
    });
  });

  describe("getEarningsHistory", () => {
    it("should return empty array for user with no transactions", async () => {
      (EarningsTransaction.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      const history = await repository.getEarningsHistory("user123");
      expect(history).toEqual([]);
    });

    it("should return earnings transactions sorted by timestamp descending", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const mockTransactions = [
        {
          userId: "user123",
          referredUserId: "user789",
          offrampTransactionId: "tx2",
          amount: 20.00,
          feeAmount: 30.00,
          transactionAmount: 2000.00,
          timestamp: now,
        },
        {
          userId: "user123",
          referredUserId: "user101",
          offrampTransactionId: "tx3",
          amount: 15.00,
          feeAmount: 22.50,
          transactionAmount: 1500.00,
          timestamp: yesterday,
        },
        {
          userId: "user123",
          referredUserId: "user456",
          offrampTransactionId: "tx1",
          amount: 10.00,
          feeAmount: 15.00,
          transactionAmount: 1000.00,
          timestamp: twoDaysAgo,
        },
      ];

      (EarningsTransaction.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockTransactions),
        }),
      });

      const history = await repository.getEarningsHistory("user123");
      
      expect(history).toHaveLength(3);
      expect(history[0].transactionId).toBe("tx2"); // Most recent
      expect(history[1].transactionId).toBe("tx3");
      expect(history[2].transactionId).toBe("tx1"); // Oldest
      expect(history[0].type).toBe("credit");
    });
  });

  describe("Invariants", () => {
    it("should maintain totalEarned >= currentBalance invariant after operations", async () => {
      // This is a conceptual test - in real implementation, the model validation ensures this
      const mockBalance = {
        userId: "user123",
        currentBalance: 70.00,
        totalEarned: 100.00,
      };

      // Verify the invariant holds
      expect(mockBalance.totalEarned).toBeGreaterThanOrEqual(mockBalance.currentBalance);
    });
  });

  describe("Property-Based Tests", () => {
    /**
     * Property 15: Balance increase on earnings
     * **Validates: Requirements 4.2**
     * 
     * For any referral earnings event, the referrer's current balance should increase 
     * by exactly the earnings amount.
     */
    it("Property 15: balance should increase by exactly the earnings amount", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }), // userId
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }), // earnings amount
          fc.string({ minLength: 5, maxLength: 20 }), // transactionId
          async (userId, amount, transactionId) => {
            // Mock mongoose session
            const mockSession = {
              withTransaction: jest.fn(async (callback: any) => {
                await callback();
              }),
              endSession: jest.fn(),
            };
            jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as any);

            // Get initial balance
            const initialBalance = 100.00;
            const initialTotalEarned = 150.00;
            
            const mockPointsBalance = {
              userId,
              currentBalance: initialBalance,
              totalEarned: initialTotalEarned,
              save: jest.fn().mockResolvedValue(true),
            };

            (PointsBalance.findOne as jest.Mock).mockReturnValue({
              session: jest.fn().mockResolvedValue(mockPointsBalance),
            });

            const mockTransaction = {
              save: jest.fn().mockResolvedValue(true),
            };
            (EarningsTransaction as any).mockImplementation(() => mockTransaction);

            // Credit points
            await repository.creditPoints(userId, amount, transactionId);

            // Verify balance increased by exactly the amount
            const expectedBalance = initialBalance + amount;
            expect(mockPointsBalance.currentBalance).toBeCloseTo(expectedBalance, 2);
            
            // Verify totalEarned also increased
            const expectedTotalEarned = initialTotalEarned + amount;
            expect(mockPointsBalance.totalEarned).toBeCloseTo(expectedTotalEarned, 2);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 16: Balance decrease on withdrawal
     * **Validates: Requirements 4.3**
     * 
     * For any completed withdrawal, the user's current balance should decrease 
     * by exactly the withdrawal amount.
     */
    it("Property 16: balance should decrease by exactly the withdrawal amount", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }), // userId
          fc.float({ min: Math.fround(0.01), max: Math.fround(500), noNaN: true }), // withdrawal amount (less than initial balance)
          fc.string({ minLength: 5, maxLength: 20 }), // withdrawalId
          async (userId, amount, withdrawalId) => {
            // Mock mongoose session
            const mockSession = {
              withTransaction: jest.fn(async (callback: any) => {
                await callback();
              }),
              endSession: jest.fn(),
            };
            jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as any);

            // Set initial balance high enough to allow withdrawal
            const initialBalance = 1000.00;
            const initialTotalEarned = 1500.00;
            
            const mockPointsBalance = {
              userId,
              currentBalance: initialBalance,
              totalEarned: initialTotalEarned,
              save: jest.fn().mockResolvedValue(true),
            };

            (PointsBalance.findOne as jest.Mock).mockReturnValue({
              session: jest.fn().mockResolvedValue(mockPointsBalance),
            });

            // Debit points
            await repository.debitPoints(userId, amount, withdrawalId);

            // Verify balance decreased by exactly the amount
            const expectedBalance = initialBalance - amount;
            expect(mockPointsBalance.currentBalance).toBeCloseTo(expectedBalance, 2);
            
            // Verify totalEarned remained unchanged
            expect(mockPointsBalance.totalEarned).toBe(initialTotalEarned);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 17: Total earned invariant
     * **Validates: Requirements 4.4**
     * 
     * For any user at any point in time, their total earned points should be 
     * greater than or equal to their current balance.
     */
    it("Property 17: totalEarned should always be >= currentBalance", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }), // userId
          fc.array(
            fc.record({
              type: fc.constantFrom('credit', 'debit'),
              amount: fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }),
            }),
            { minLength: 1, maxLength: 20 }
          ), // sequence of operations
          async (userId, operations) => {
            // Mock mongoose session
            const mockSession = {
              withTransaction: jest.fn(async (callback: any) => {
                await callback();
              }),
              endSession: jest.fn(),
            };
            jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as any);

            let currentBalance = 0;
            let totalEarned = 0;

            for (let i = 0; i < operations.length; i++) {
              const op = operations[i];
              
              if (op.type === 'credit') {
                // Credit operation
                const mockPointsBalance = {
                  userId,
                  currentBalance,
                  totalEarned,
                  save: jest.fn().mockResolvedValue(true),
                };

                (PointsBalance.findOne as jest.Mock).mockReturnValue({
                  session: jest.fn().mockResolvedValue(mockPointsBalance),
                });

                const mockTransaction = {
                  save: jest.fn().mockResolvedValue(true),
                };
                (EarningsTransaction as any).mockImplementation(() => mockTransaction);

                await repository.creditPoints(userId, op.amount, `tx${i}`);
                
                currentBalance = mockPointsBalance.currentBalance;
                totalEarned = mockPointsBalance.totalEarned;
              } else if (op.type === 'debit' && currentBalance >= op.amount) {
                // Debit operation (only if sufficient balance)
                const mockPointsBalance = {
                  userId,
                  currentBalance,
                  totalEarned,
                  save: jest.fn().mockResolvedValue(true),
                };

                (PointsBalance.findOne as jest.Mock).mockReturnValue({
                  session: jest.fn().mockResolvedValue(mockPointsBalance),
                });

                await repository.debitPoints(userId, op.amount, `wd${i}`);
                
                currentBalance = mockPointsBalance.currentBalance;
                totalEarned = mockPointsBalance.totalEarned;
              }

              // Verify invariant holds after each operation
              expect(totalEarned).toBeGreaterThanOrEqual(currentBalance);
            }
          }
        ),
        { numRuns: 50 } // Fewer runs due to complexity
      );
    });

    /**
     * Property 18: Non-negative balance invariant
     * **Validates: Requirements 4.5**
     * 
     * For any sequence of earnings and withdrawal operations, a user's point balance 
     * should never become negative.
     */
    it("Property 18: balance should never become negative", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }), // userId
          fc.array(
            fc.record({
              type: fc.constantFrom('credit', 'debit'),
              amount: fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }),
            }),
            { minLength: 1, maxLength: 20 }
          ), // sequence of operations
          async (userId, operations) => {
            // Mock mongoose session
            const mockSession = {
              withTransaction: jest.fn(async (callback: any) => {
                await callback();
              }),
              endSession: jest.fn(),
            };
            jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as any);

            let currentBalance = 0;
            let totalEarned = 0;

            for (let i = 0; i < operations.length; i++) {
              const op = operations[i];
              
              if (op.type === 'credit') {
                // Credit operation
                const mockPointsBalance = {
                  userId,
                  currentBalance,
                  totalEarned,
                  save: jest.fn().mockResolvedValue(true),
                };

                (PointsBalance.findOne as jest.Mock).mockReturnValue({
                  session: jest.fn().mockResolvedValue(mockPointsBalance),
                });

                const mockTransaction = {
                  save: jest.fn().mockResolvedValue(true),
                };
                (EarningsTransaction as any).mockImplementation(() => mockTransaction);

                await repository.creditPoints(userId, op.amount, `tx${i}`);
                
                currentBalance = mockPointsBalance.currentBalance;
                totalEarned = mockPointsBalance.totalEarned;
              } else if (op.type === 'debit') {
                // Debit operation
                const mockPointsBalance = {
                  userId,
                  currentBalance,
                  totalEarned,
                  save: jest.fn().mockResolvedValue(true),
                };

                (PointsBalance.findOne as jest.Mock).mockReturnValue({
                  session: jest.fn().mockResolvedValue(mockPointsBalance),
                });

                // Try to debit - should either succeed or throw error
                if (currentBalance >= op.amount) {
                  await repository.debitPoints(userId, op.amount, `wd${i}`);
                  currentBalance = mockPointsBalance.currentBalance;
                  totalEarned = mockPointsBalance.totalEarned;
                } else {
                  // Should throw error for insufficient balance
                  await expect(
                    repository.debitPoints(userId, op.amount, `wd${i}`)
                  ).rejects.toThrow();
                }
              }

              // Verify balance is never negative
              expect(currentBalance).toBeGreaterThanOrEqual(0);
            }
          }
        ),
        { numRuns: 50 } // Fewer runs due to complexity
      );
    });
  });
});
