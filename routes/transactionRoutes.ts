import { Router } from "express";
import {
  getUserTransactionHistory,
  getAdminTransactionHistory,
  getTransactionDetails,
} from "../controllers/transactionController";

const router: Router = Router();

/**
 * @route GET /api/transactions/user/:userId
 * @desc Get transaction history for a specific user
 * @access Public (should be protected in production)
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 20, max: 100)
 * @query status - Filter by transaction status (pending, processing, completed, failed, cancelled)
 * @query type - Filter by transaction type (payment, transfer, deposit, withdrawal, etc.)
 */
router.get("/user/:userId", getUserTransactionHistory);

/**
 * @route GET /api/transactions/admin
 * @desc Get all transaction history for admin with filters
 * @access Admin only (should be protected in production)
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 20, max: 100)
 * @query status - Filter by transaction status
 * @query type - Filter by transaction type
 * @query userId - Filter by specific user ID
 * @query startDate - Filter transactions from this date
 * @query endDate - Filter transactions until this date
 */
router.get("/admin", getAdminTransactionHistory);

/**
 * @route GET /api/transactions/:referenceId
 * @desc Get transaction details by reference ID
 * @access Public (should be protected in production)
 */
router.get("/:referenceId", getTransactionDetails);

export default router;