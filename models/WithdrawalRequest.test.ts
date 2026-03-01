/**
 * Basic validation tests for WithdrawalRequest model
 * This ensures the model schema is correctly defined
 */

import { WithdrawalRequest, WithdrawalStatus } from "./WithdrawalRequest";

describe("WithdrawalRequest Model", () => {
  describe("Model Instantiation", () => {
    it("should instantiate with required fields", () => {
      const testData = {
        userId: "test-user-123",
        amount: 150,
        status: WithdrawalStatus.PENDING,
        requestedAt: new Date(),
      };

      const withdrawal = new WithdrawalRequest(testData);

      expect(withdrawal.userId).toBe(testData.userId);
      expect(withdrawal.amount).toBe(testData.amount);
      expect(withdrawal.status).toBe(testData.status);
      expect(withdrawal.requestedAt).toBeInstanceOf(Date);
    });

    it("should have optional fields undefined initially", () => {
      const testData = {
        userId: "test-user-123",
        amount: 150,
        status: WithdrawalStatus.PENDING,
        requestedAt: new Date(),
      };

      const withdrawal = new WithdrawalRequest(testData);

      expect(withdrawal.approvedAt).toBeUndefined();
      expect(withdrawal.completedAt).toBeUndefined();
      expect(withdrawal.failureReason).toBeUndefined();
      expect(withdrawal.bankTransferId).toBeUndefined();
    });
  });

  describe("Validation", () => {
    it("should fail validation for amount below minimum", async () => {
      const testData = {
        userId: "test-user-123",
        amount: 50, // Below minimum of 100
        status: WithdrawalStatus.PENDING,
        requestedAt: new Date(),
      };

      const withdrawal = new WithdrawalRequest(testData);

      await expect(withdrawal.validate()).rejects.toThrow();
    });

    it("should pass validation for amount at minimum", async () => {
      const testData = {
        userId: "test-user-123",
        amount: 100,
        status: WithdrawalStatus.PENDING,
        requestedAt: new Date(),
      };

      const withdrawal = new WithdrawalRequest(testData);

      await expect(withdrawal.validate()).resolves.not.toThrow();
    });

    it("should accept all valid status enum values", () => {
      const statuses = [
        WithdrawalStatus.PENDING,
        WithdrawalStatus.APPROVED,
        WithdrawalStatus.COMPLETED,
        WithdrawalStatus.FAILED,
      ];

      statuses.forEach((status) => {
        const withdrawal = new WithdrawalRequest({
          userId: "test-user-123",
          amount: 150,
          status,
          requestedAt: new Date(),
        });

        expect(withdrawal.status).toBe(status);
      });
    });
  });

  describe("Schema Indexes", () => {
    it("should have correct indexes defined", () => {
      const indexes = WithdrawalRequest.schema.indexes();

      const hasUserIdIndex = indexes.some((idx: any) => idx[0].userId === 1);
      const hasStatusIndex = indexes.some((idx: any) => idx[0].status === 1);
      const hasRequestedAtIndex = indexes.some((idx: any) => idx[0].requestedAt === -1);

      expect(hasUserIdIndex).toBe(true);
      expect(hasStatusIndex).toBe(true);
      expect(hasRequestedAtIndex).toBe(true);
    });
  });
});
