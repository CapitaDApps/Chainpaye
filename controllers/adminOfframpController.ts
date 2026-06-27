import { Request, Response } from "express";
import { OfframpTransaction, OfframpStatus } from "../models/OfframpTransaction";
import { logger } from "../utils/logger";

export async function getOfframpTransactions(req: Request, res: Response) {
  try {
    const { status, asset, chain, page = "1", limit = "25" } = req.query as Record<string, string>;
    const filter: any = {};
    if (status && Object.values(OfframpStatus).includes(status as OfframpStatus)) filter.status = status;
    if (asset) filter.asset = { $regex: asset, $options: "i" };
    if (chain) filter.chain = { $regex: chain, $options: "i" };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [rows, total] = await Promise.all([
      OfframpTransaction.find(filter)
        .populate("userId", "fullName whatsappNumber")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OfframpTransaction.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error: any) {
    logger.error("Error fetching offramp transactions:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
