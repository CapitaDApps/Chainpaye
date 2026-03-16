/**
 * Admin Withdrawal Controller
 * 
 * REST API endpoints for admin management of referral earnings withdrawals.
 * Allows admins to view, complete, and manage withdrawal requests.
 */

import { Request, Response } from "express";
import { WithdrawalService } from "../services/WithdrawalService";
import { PointsRepository } from "../repositories/PointsRepository";
import { whatsappBusinessService } from "../services";
import { logger } from "../utils/logger";

/**
 * Get all withdrawal requests for admin dashboard
 * 
 * GET /api/admin/referral-withdrawals
 * Query params: limit, offset, status
 */
export async function getAllWithdrawals(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

    let withdrawals;
    if (status === 'pending') {
      withdrawals = await withdrawalService.getPendingWithdrawals();
    } else {
      withdrawals = await withdrawalService.getAllWithdrawals(limit, offset);
    }

    // Filter by status if specified
    if (status && status !== 'pending') {
      withdrawals = withdrawals.filter(w => w.status === status);
    }

    const response = {
      success: true,
      data: withdrawals.map(w => ({
        id: w.id,
        userId: w.userId,
        amount: w.amount,
        evmAddress: w.evmAddress,
        chain: w.chain,
        token: w.token,
        status: w.status,
        requestedAt: w.requestedAt,
        completedAt: w.completedAt,
        transactionHash: w.transactionHash,
        failureReason: w.failureReason,
        adminNotes: w.adminNotes,
      })),
      pagination: {
        limit,
        offset,
        total: withdrawals.length,
      },
    };

    res.json(response);
  } catch (error: any) {
    logger.error("Error fetching withdrawals for admin:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch withdrawal requests",
    });
  }
}
/**
 * Complete a withdrawal request (mark as completed)
 * 
 * PUT /api/admin/referral-withdrawals/:id/complete
 * Body: { transactionHash: string, adminNotes?: string }
 */
export async function completeWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { transactionHash, adminNotes } = req.body;

    if (!transactionHash) {
      return res.status(400).json({
        success: false,
        error: "Transaction hash is required",
      });
    }

    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

    const withdrawal = await withdrawalService.completeWithdrawal(
      id,
      transactionHash,
      adminNotes
    );

    // Send notification to user
    const notificationMessage = `
✅ *Withdrawal Completed*

💰 *Amount:* $${withdrawal.amount.toFixed(2)} USDT
🔗 *Chain:* Base
📍 *Address:* ${withdrawal.evmAddress.substring(0, 6)}...${withdrawal.evmAddress.substring(-4)}
🔗 *Transaction:* ${transactionHash.substring(0, 10)}...
📅 *Completed:* ${withdrawal.completedAt?.toISOString().split('T')[0]}

Your USDT has been sent to your wallet! 🎉

Type *referral history* to view all your withdrawals.
    `.trim();

    // Get user's phone number (assuming userId is phone number)
    const userPhone = withdrawal.userId;
    await whatsappBusinessService.sendNormalMessage(notificationMessage, userPhone);

    logger.info("Withdrawal completed by admin:", {
      withdrawalId: id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      transactionHash,
    });

    res.json({
      success: true,
      message: "Withdrawal completed successfully",
      data: {
        id: withdrawal.id,
        status: withdrawal.status,
        completedAt: withdrawal.completedAt,
        transactionHash: withdrawal.transactionHash,
      },
    });

  } catch (error: any) {
    logger.error("Error completing withdrawal:", {
      withdrawalId: req.params.id,
      error: error.message,
    });

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Fail a withdrawal request
 * 
 * PUT /api/admin/referral-withdrawals/:id/fail
 * Body: { reason: string }
 */
export async function failWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: "Failure reason is required",
      });
    }

    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

    const withdrawal = await withdrawalService.failWithdrawal(id, reason);

    // Send notification to user
    const notificationMessage = `
❌ *Withdrawal Failed*

💰 *Amount:* $${withdrawal.amount.toFixed(2)} USDT
📅 *Requested:* ${withdrawal.requestedAt.toISOString().split('T')[0]}
❌ *Reason:* ${reason}

Your referral earnings balance has been restored. You can try withdrawing again.

Type *referral* to access your dashboard.
    `.trim();

    // Get user's phone number (assuming userId is phone number)
    const userPhone = withdrawal.userId;
    await whatsappBusinessService.sendNormalMessage(notificationMessage, userPhone);

    logger.info("Withdrawal failed by admin:", {
      withdrawalId: id,
      userId: withdrawal.userId,
      reason,
    });

    res.json({
      success: true,
      message: "Withdrawal marked as failed",
      data: {
        id: withdrawal.id,
        status: withdrawal.status,
        failureReason: withdrawal.failureReason,
      },
    });

  } catch (error: any) {
    logger.error("Error failing withdrawal:", {
      withdrawalId: req.params.id,
      error: error.message,
    });

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get withdrawal statistics for admin dashboard
 * 
 * GET /api/admin/referral-withdrawals/stats
 */
export async function getWithdrawalStats(req: Request, res: Response) {
  try {
    const pointsRepository = new PointsRepository();
    const withdrawalService = new WithdrawalService(pointsRepository);

    const [allWithdrawals, pendingWithdrawals] = await Promise.all([
      withdrawalService.getAllWithdrawals(),
      withdrawalService.getPendingWithdrawals(),
    ]);

    const completedWithdrawals = allWithdrawals.filter(w => w.status === 'completed');
    const failedWithdrawals = allWithdrawals.filter(w => w.status === 'failed');

    const totalAmount = completedWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    const pendingAmount = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);

    const stats = {
      total: allWithdrawals.length,
      pending: pendingWithdrawals.length,
      completed: completedWithdrawals.length,
      failed: failedWithdrawals.length,
      totalAmount: totalAmount.toFixed(2),
      pendingAmount: pendingAmount.toFixed(2),
      averageAmount: completedWithdrawals.length > 0 
        ? (totalAmount / completedWithdrawals.length).toFixed(2) 
        : "0.00",
    };

    res.json({
      success: true,
      data: stats,
    });

  } catch (error: any) {
    logger.error("Error fetching withdrawal stats:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch withdrawal statistics",
    });
  }
}