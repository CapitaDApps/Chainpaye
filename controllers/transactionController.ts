import { Request, Response } from "express";
import { Types } from "mongoose";
import { TransactionService } from "../services/TransactionService";
import { TransactionStatus, TransactionType } from "../models/Transaction";
import { logger } from "../utils/logger";

/**
 * Get transaction history for a specific user
 */
export const getUserTransactionHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      status, 
      type 
    } = req.query;

    // Validate userId
    if (!userId || Array.isArray(userId) || !Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: "Valid userId is required"
      });
    }

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    // Validate status filter
    let statusFilter: TransactionStatus | undefined;
    if (status && !Array.isArray(status) && Object.values(TransactionStatus).includes(status as TransactionStatus)) {
      statusFilter = status as TransactionStatus;
    }

    // Validate type filter
    let typeFilter: TransactionType | undefined;
    if (type && !Array.isArray(type) && Object.values(TransactionType).includes(type as TransactionType)) {
      typeFilter = type as TransactionType;
    }

    const result = await TransactionService.getTransactionHistory({
      userId: new Types.ObjectId(userId),
      page: pageNum,
      limit: limitNum,
      ...(statusFilter && { status: statusFilter }),
      ...(typeFilter && { type: typeFilter }),
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error("Error fetching user transaction history:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch transaction history"
    });
  }
};
/**
 * Get all transaction history for admin with filters and pagination
 */
export const getAdminTransactionHistory = async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      type,
      userId,
      startDate,
      endDate
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    // Validate status filter
    let statusFilter: TransactionStatus | undefined;
    if (status && !Array.isArray(status) && Object.values(TransactionStatus).includes(status as TransactionStatus)) {
      statusFilter = status as TransactionStatus;
    }

    // Validate type filter
    let typeFilter: TransactionType | undefined;
    if (type && !Array.isArray(type) && Object.values(TransactionType).includes(type as TransactionType)) {
      typeFilter = type as TransactionType;
    }

    // Validate userId filter
    let userIdFilter: Types.ObjectId | undefined;
    if (userId && !Array.isArray(userId) && Types.ObjectId.isValid(userId as string)) {
      userIdFilter = new Types.ObjectId(userId as string);
    }

    const result = await TransactionService.getTransactionHistory({
      ...(userIdFilter && { userId: userIdFilter }),
      page: pageNum,
      limit: limitNum,
      ...(statusFilter && { status: statusFilter }),
      ...(typeFilter && { type: typeFilter }),
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error("Error fetching admin transaction history:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch transaction history"
    });
  }
};

/**
 * Get transaction details by reference ID
 */
export const getTransactionDetails = async (req: Request, res: Response) => {
  try {
    const { referenceId } = req.params;

    if (!referenceId || Array.isArray(referenceId)) {
      return res.status(400).json({
        success: false,
        error: "Reference ID is required"
      });
    }

    const transaction = await TransactionService.getTransactionByReference(referenceId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found"
      });
    }

    res.json({
      success: true,
      data: transaction
    });

  } catch (error: any) {
    logger.error("Error fetching transaction details:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch transaction details"
    });
  }
};