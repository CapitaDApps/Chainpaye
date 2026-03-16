/**
 * Admin Withdrawal Routes
 * 
 * API routes for admin management of referral earnings withdrawals.
 */

import { Router } from "express";
import {
  getAllWithdrawals,
  completeWithdrawal,
  failWithdrawal,
  getWithdrawalStats,
} from "../controllers/adminWithdrawalController";

const router = Router();

/**
 * GET /api/admin/referral-withdrawals
 * Get all withdrawal requests with optional filtering
 * Query params: limit, offset, status
 */
router.get("/", getAllWithdrawals);

/**
 * GET /api/admin/referral-withdrawals/stats
 * Get withdrawal statistics for dashboard
 */
router.get("/stats", getWithdrawalStats);

/**
 * PUT /api/admin/referral-withdrawals/:id/complete
 * Mark a withdrawal as completed
 * Body: { transactionHash: string, adminNotes?: string }
 */
router.put("/:id/complete", completeWithdrawal);

/**
 * PUT /api/admin/referral-withdrawals/:id/fail
 * Mark a withdrawal as failed
 * Body: { reason: string }
 */
router.put("/:id/fail", failWithdrawal);

export default router;