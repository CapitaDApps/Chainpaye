/**
 * WithdrawalService Unit Tests
 * 
 * Tests for withdrawal request validation, creation, approval, and processing.
 * Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6
 */

import { WithdrawalService, WithdrawalValidation, BankTransferService } from "./WithdrawalService";
import { PointsRepository } from "../repositories/PointsRepository";
import { WithdrawalRequest, WithdrawalStatus } from "../models/WithdrawalRequest";
import mongoose from "mongoose";

// Mock dependencies
jest.mock("../repositories/PointsRepository");
jest.mock("../models/WithdrawalRequest");

describe("WithdrawalService", () => {
  let withdrawalService: WithdrawalService;
  let mockPointsRepository: jest.Mocked<PointsRepository>;
  let mockBankTransferService: jest.Mocked<BankTransferService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockPointsRepository = new PointsRepository() as jest.Mocked<PointsRepository>;
    mockBankTransferService = {
      initiateTransfer: jest.fn(),
    };

    withdrawalService = new WithdrawalService(
      mockPointsRepository,
      mockBankTransferService
    );
  });

  describe("canWithdraw", () => {
    it("should reject withdrawal below minimum amount ($100)", async () => {
      // Arrange
      const userId = "user123";
      const amount = 50;
      mockPointsRepository.getBalance = jest.fn().mockResolvedValue(200);

      // Act
      const result = await withdrawalService.canWithdraw(userId, amount);

      // Assert
      expect(result.canWithdraw).toBe(false);
      expect(result.reason).toContain("Minimum withdrawal amount is $100");
      expect(result.reason).toContain("$50");
    });

    it("should reject withdrawal with insufficient balance", async () => {
      // Arrange
      const userId = "user123";
      const amount = 150;
      mockPointsRepository.getBalance = jest.fn().mockResolvedValue(100);

      // Act
      const result = await withdrawalService.canWithdraw(userId, amount);

      // Assert
      expect(result.canWithdraw).toBe(false);
      expect(result.reason).toContain("Insufficient balance");
      expect(result.reason).toContain("$100");
    });

    it("should reject withdrawal within 7 days of previous withdrawal", async () => {
      // Arrange
      const userId = "user123";
      const amount = 100;
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3); // 3 days ago

      mockPointsRepository.getBalance = jest.fn().mockResolvedValue(200);
      
      const mockWithdrawal = {
        userId,
        requestedAt: recentDate,
      };

      (WithdrawalRequest.findOne as jest.Mock) = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockWithdrawal),
      });

      // Act
      const result = await withdrawalService.canWithdraw(userId, amount);

      // Assert
      expect(result.canWithdraw).toBe(false);
      expect(result.reason).toContain("once per week");
    });

    it("should allow withdrawal with sufficient balance and no recent withdrawals", async () => {
      // Arrange
      const userId = "user123";
      const amount = 150;
      mockPointsRepository.getBalance = jest.fn().mockResolvedValue(200);

      (WithdrawalRequest.findOne as jest.Mock) = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(null),
      });

      // Act
      const result = await withdrawalService.canWithdraw(userId, amount);

      // Assert
      expect(result.canWithdraw).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should allow withdrawal exactly at minimum amount ($100)", async () => {
      // Arrange
      const userId = "user123";
      const amount = 100;
      mockPointsRepository.getBalance = jest.fn().mockResolvedValue(100);

      (WithdrawalRequest.findOne as jest.Mock) = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(null),
      });

      // Act
      const result = await withdrawalService.canWithdraw(userId, amount);

      // Assert
      expect(result.canWithdraw).toBe(true);
    });

    it("should allow withdrawal exactly 7 days after previous withdrawal", async () => {
      // Arrange
      const userId = "user123";
      const amount = 100;
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 8); // 8 days ago (outside 7-day window)

      mockPointsRepository.getBalance = jest.fn().mockResolvedValue(200);

      // Mock to return null (no recent withdrawal found)
      (WithdrawalRequest.findOne as jest.Mock) = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(null),
      });

      // Act
      const result = await withdrawalService.canWithdraw(userId, amount);

      // Assert
      expect(result.canWithdraw).toBe(true);
    });
  });

  describe("requestWithdrawal", () => {
    it("should create a pending withdrawal request for valid request", async () => {
      // Arrange
      const userId = "user123";
      const amount = 150;
      mockPointsRepository.getBalance = jest.fn().mockResolvedValue(200);

      (WithdrawalRequest.findOne as jest.Mock) = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(null),
      });

      const mockSave = jest.fn().mockResolvedValue(undefined);
      const mockWithdrawalRequest = {
        userId,
        amount,
        status: WithdrawalStatus.PENDING,
        requestedAt: expect.any(Date),
        save: mockSave,
      };

      (WithdrawalRequest as any).mockImplementation(() => mockWithdrawalRequest);

      // Act
      const result = await withdrawalService.requestWithdrawal(userId, amount);

      // Assert
      expect(result.userId).toBe(userId);
      expect(result.amount).toBe(amount);
      expect(result.status).toBe(WithdrawalStatus.PENDING);
      expect(mockSave).toHaveBeenCalled();
    });

    it("should throw error for invalid withdrawal request", async () => {
      // Arrange
      const userId = "user123";
      const amount = 50; // Below minimum
      mockPointsRepository.getBalance = jest.fn().mockResolvedValue(200);

      // Act & Assert
      await expect(withdrawalService.requestWithdrawal(userId, amount)).rejects.toThrow(
        "Minimum withdrawal amount is $100"
      );
    });

    it("should throw error for insufficient balance", async () => {
      // Arrange
      const userId = "user123";
      const amount = 150;
      mockPointsRepository.getBalance = jest.fn().mockResolvedValue(100);

      // Act & Assert
      await expect(withdrawalService.requestWithdrawal(userId, amount)).rejects.toThrow(
        "Insufficient balance"
      );
    });
  });

  describe("approveWithdrawal", () => {
    it("should approve withdrawal after 24-hour delay", async () => {
      // Arrange
      const withdrawalId = "withdrawal123";
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25); // 25 hours ago

      const mockSave = jest.fn().mockResolvedValue(undefined);
      const mockWithdrawal = {
        _id: withdrawalId,
        userId: "user123",
        amount: 150,
        status: WithdrawalStatus.PENDING,
        requestedAt: oldDate,
        save: mockSave,
      };

      (WithdrawalRequest.findById as jest.Mock) = jest.fn().mockResolvedValue(mockWithdrawal);

      // Act
      const result = await withdrawalService.approveWithdrawal(withdrawalId);

      // Assert
      expect(result.status).toBe(WithdrawalStatus.APPROVED);
      expect(result.approvedAt).toBeDefined();
      expect(mockSave).toHaveBeenCalled();
    });

    it("should throw error if withdrawal not found", async () => {
      // Arrange
      const withdrawalId = "nonexistent";
      (WithdrawalRequest.findById as jest.Mock) = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(withdrawalService.approveWithdrawal(withdrawalId)).rejects.toThrow(
        "Withdrawal request not found"
      );
    });

    it("should throw error if withdrawal not in pending status", async () => {
      // Arrange
      const withdrawalId = "withdrawal123";
      const mockWithdrawal = {
        _id: withdrawalId,
        status: WithdrawalStatus.COMPLETED,
      };

      (WithdrawalRequest.findById as jest.Mock) = jest.fn().mockResolvedValue(mockWithdrawal);

      // Act & Assert
      await expect(withdrawalService.approveWithdrawal(withdrawalId)).rejects.toThrow(
        "Cannot approve withdrawal with status: completed"
      );
    });

    it("should throw error if 24 hours have not passed", async () => {
      // Arrange
      const withdrawalId = "withdrawal123";
      const recentDate = new Date();
      recentDate.setHours(recentDate.getHours() - 12); // Only 12 hours ago

      const mockWithdrawal = {
        _id: withdrawalId,
        status: WithdrawalStatus.PENDING,
        requestedAt: recentDate,
      };

      (WithdrawalRequest.findById as jest.Mock) = jest.fn().mockResolvedValue(mockWithdrawal);

      // Act & Assert
      await expect(withdrawalService.approveWithdrawal(withdrawalId)).rejects.toThrow(
        "24-hour delay period"
      );
    });
  });

  describe("processWithdrawal", () => {
    let mockSession: any;

    beforeEach(() => {
      mockSession = {
        withTransaction: jest.fn((callback) => callback()),
        endSession: jest.fn(),
      };
      (mongoose.startSession as jest.Mock) = jest.fn().mockResolvedValue(mockSession);
    });

    it("should process approved withdrawal successfully", async () => {
      // Arrange
      const withdrawalId = "withdrawal123";
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const mockWithdrawal = {
        _id: withdrawalId,
        userId: "user123",
        amount: 150,
        status: WithdrawalStatus.APPROVED,
        save: mockSave,
      };

      (WithdrawalRequest.findById as jest.Mock) = jest.fn().mockResolvedValue(mockWithdrawal);
      mockPointsRepository.debitPoints = jest.fn().mockResolvedValue(undefined);
      mockBankTransferService.initiateTransfer = jest.fn().mockResolvedValue("TRANSFER_123");

      // Act
      const result = await withdrawalService.processWithdrawal(withdrawalId);

      // Assert
      expect(mockPointsRepository.debitPoints).toHaveBeenCalledWith(
        "user123",
        150,
        withdrawalId
      );
      expect(mockBankTransferService.initiateTransfer).toHaveBeenCalledWith("user123", 150);
      expect(result.status).toBe(WithdrawalStatus.COMPLETED);
      expect(result.completedAt).toBeDefined();
      expect(result.bankTransferId).toBe("TRANSFER_123");
      expect(mockSave).toHaveBeenCalled();
    });

    it("should throw error if withdrawal not found", async () => {
      // Arrange
      const withdrawalId = "nonexistent";
      (WithdrawalRequest.findById as jest.Mock) = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(withdrawalService.processWithdrawal(withdrawalId)).rejects.toThrow(
        "Withdrawal request not found"
      );
    });

    it("should throw error if withdrawal not in approved status", async () => {
      // Arrange
      const withdrawalId = "withdrawal123";
      const mockWithdrawal = {
        _id: withdrawalId,
        status: WithdrawalStatus.PENDING,
      };

      (WithdrawalRequest.findById as jest.Mock) = jest.fn().mockResolvedValue(mockWithdrawal);

      // Act & Assert
      await expect(withdrawalService.processWithdrawal(withdrawalId)).rejects.toThrow(
        "Cannot process withdrawal with status: pending"
      );
    });

    it("should rollback and mark as failed if bank transfer fails", async () => {
      // Arrange
      const withdrawalId = "withdrawal123";
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const mockWithdrawal = {
        _id: withdrawalId,
        userId: "user123",
        amount: 150,
        status: WithdrawalStatus.APPROVED,
        save: mockSave,
      };

      (WithdrawalRequest.findById as jest.Mock) = jest.fn().mockResolvedValue(mockWithdrawal);
      mockPointsRepository.debitPoints = jest.fn().mockResolvedValue(undefined);
      mockBankTransferService.initiateTransfer = jest
        .fn()
        .mockRejectedValue(new Error("Bank transfer failed"));

      // Act & Assert
      await expect(withdrawalService.processWithdrawal(withdrawalId)).rejects.toThrow(
        "Withdrawal processing failed"
      );

      expect(mockWithdrawal.status).toBe(WithdrawalStatus.FAILED);
      expect(mockWithdrawal.failureReason).toContain("Bank transfer failed");
      expect(mockSave).toHaveBeenCalled();
    });

    it("should rollback and mark as failed if debit points fails", async () => {
      // Arrange
      const withdrawalId = "withdrawal123";
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const mockWithdrawal = {
        _id: withdrawalId,
        userId: "user123",
        amount: 150,
        status: WithdrawalStatus.APPROVED,
        save: mockSave,
      };

      (WithdrawalRequest.findById as jest.Mock) = jest.fn().mockResolvedValue(mockWithdrawal);
      mockPointsRepository.debitPoints = jest
        .fn()
        .mockRejectedValue(new Error("Insufficient balance"));

      // Act & Assert
      await expect(withdrawalService.processWithdrawal(withdrawalId)).rejects.toThrow(
        "Withdrawal processing failed"
      );

      expect(mockWithdrawal.status).toBe(WithdrawalStatus.FAILED);
      expect(mockWithdrawal.failureReason).toContain("Insufficient balance");
    });

    it("should use mock transfer ID when bank service not provided", async () => {
      // Arrange
      const withdrawalId = "withdrawal123";
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const mockWithdrawal = {
        _id: withdrawalId,
        userId: "user123",
        amount: 150,
        status: WithdrawalStatus.APPROVED,
        save: mockSave,
      };

      (WithdrawalRequest.findById as jest.Mock) = jest.fn().mockResolvedValue(mockWithdrawal);
      mockPointsRepository.debitPoints = jest.fn().mockResolvedValue(undefined);

      // Create service without bank transfer service
      const serviceWithoutBank = new WithdrawalService(mockPointsRepository);

      // Act
      const result = await serviceWithoutBank.processWithdrawal(withdrawalId);

      // Assert
      expect(result.status).toBe(WithdrawalStatus.COMPLETED);
      expect(result.bankTransferId).toMatch(/^MOCK_TRANSFER_/);
    });
  });

  describe("getWithdrawalHistory", () => {
    it("should return withdrawal history for user", async () => {
      // Arrange
      const userId = "user123";
      const mockWithdrawals = [
        { userId, amount: 150, status: WithdrawalStatus.COMPLETED },
        { userId, amount: 200, status: WithdrawalStatus.PENDING },
      ];

      (WithdrawalRequest.find as jest.Mock) = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockWithdrawals),
      });

      // Act
      const result = await withdrawalService.getWithdrawalHistory(userId);

      // Assert
      expect(result).toEqual(mockWithdrawals);
      expect(WithdrawalRequest.find).toHaveBeenCalledWith({ userId });
    });
  });

  describe("getPendingWithdrawalsForApproval", () => {
    it("should return pending withdrawals older than 24 hours", async () => {
      // Arrange
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 25);

      const mockWithdrawals = [
        { userId: "user1", amount: 150, status: WithdrawalStatus.PENDING, requestedAt: oldDate },
      ];

      (WithdrawalRequest.find as jest.Mock) = jest.fn().mockResolvedValue(mockWithdrawals);

      // Act
      const result = await withdrawalService.getPendingWithdrawalsForApproval();

      // Assert
      expect(result).toEqual(mockWithdrawals);
      expect(WithdrawalRequest.find).toHaveBeenCalledWith({
        status: WithdrawalStatus.PENDING,
        requestedAt: { $lte: expect.any(Date) },
      });
    });
  });
});
