/**
 * Deposit Notification Controller
 * Handles webhook notifications from Crossmint when deposits are detected
 */

import { Request, Response } from "express";
import { handleDepositNotification } from "../../commands/handlers/offrampHandler";
import { userService } from "../../services";
import { logger } from "../../utils/logger";

export interface CrossmintDepositWebhook {
  type: "wallet.deposit";
  data: {
    walletId: string;
    owner: string; // userId:user-123
    address: string;
    chainType: string;
    transaction: {
      hash: string;
      amount: string;
      token: string;
      from: string;
      to: string;
      blockNumber?: number;
      timestamp: string;
    };
  };
}

/**
 * Handle Crossmint deposit webhook
 */
export async function handleCrossmintDepositWebhook(req: Request, res: Response): Promise<void> {
  try {
    const webhook: CrossmintDepositWebhook = req.body;
    
    logger.info("Received Crossmint deposit webhook:", webhook);

    // Validate webhook structure
    if (webhook.type !== "wallet.deposit" || !webhook.data) {
      logger.warn("Invalid webhook type or missing data");
      res.status(400).json({ error: "Invalid webhook format" });
      return;
    }

    const { data } = webhook;
    
    // Extract user ID from owner field (format: userId:user-123)
    const ownerMatch = data.owner.match(/^userId:(.+)$/);
    if (!ownerMatch) {
      logger.warn("Invalid owner format:", data.owner);
      res.status(400).json({ error: "Invalid owner format" });
      return;
    }

    const userId = ownerMatch[1];
    
    if (!userId) {
      logger.warn("Empty userId extracted from owner field");
      res.status(400).json({ error: "Invalid userId" });
      return;
    }
    
    // Get user by userId to find their phone number
    const user = await userService.getUserById(userId);
    if (!user) {
      logger.warn(`User not found for userId: ${userId}`);
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Extract deposit details
    const amount = parseFloat(data.transaction.amount);
    const asset = data.transaction.token.toLowerCase();
    const chain = mapChainType(data.chainType);

    // Send deposit notification to user
    await handleDepositNotification(user.whatsappNumber, asset, amount, chain);

    logger.info(`Deposit notification sent to ${user.whatsappNumber}: ${amount} ${asset} on ${chain}`);

    res.status(200).json({ 
      success: true, 
      message: "Deposit notification sent successfully" 
    });

  } catch (error) {
    logger.error("Error handling Crossmint deposit webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Map Crossmint chain types to user-friendly names
 */
function mapChainType(chainType: string): string {
  const chainMapping: { [key: string]: string } = {
    solana: "Solana",
    bsc: "BEP20",
    arbitrum: "Arbitrum",
    base: "Base",
    hedera: "Hedera",
    apechain: "ApeChain",
    lisk: "Lisk",
  };

  return chainMapping[chainType.toLowerCase()] || chainType;
}

/**
 * Test endpoint for deposit notifications (for development/testing)
 */
export async function testDepositNotification(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, asset, amount, chain } = req.body;

    if (!phoneNumber || !asset || !amount || !chain) {
      res.status(400).json({ error: "Missing required fields: phoneNumber, asset, amount, chain" });
      return;
    }

    await handleDepositNotification(phoneNumber, asset, parseFloat(amount), chain);

    res.status(200).json({ 
      success: true, 
      message: "Test deposit notification sent successfully" 
    });

  } catch (error) {
    logger.error("Error sending test deposit notification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}