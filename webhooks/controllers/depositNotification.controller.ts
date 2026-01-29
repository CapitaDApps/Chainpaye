/**
 * Deposit Notification Controller
 * Handles webhook notifications from Crossmint when deposits are detected
 * Enhanced with WorkflowController integration for off-ramp workflow
 */

import { Request, Response } from "express";
import { handleDepositNotification } from "../../commands/handlers";
import { userService } from "../../services";
import { logger } from "../../utils/logger";
import { WebhookHandler } from "../../services/crypto-off-ramp/WebhookHandler";
import { WorkflowController } from "../../services/crypto-off-ramp/WorkflowController";
import { CrossmintService } from "../../services/CrossmintService";
import { ValidationService } from "../../services/crypto-off-ramp/ValidationService";

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
      status?: 'confirmed' | 'pending' | 'failed';
    };
  };
}

// Initialize services for enhanced webhook handling
const workflowController = new WorkflowController();
const crossmintService = new CrossmintService();
const validationService = new ValidationService();

const webhookHandler = new WebhookHandler(
  workflowController,
  crossmintService,
  validationService,
  {
    apiKey: process.env.CROSSMINT_API_KEY || '',
    baseUrl: process.env.CROSSMINT_BASE_URL || 'https://crossmint.com/api/2025-06-09',
    webhookSecret: process.env.CROSSMINT_WEBHOOK_SECRET || ''
  }
);

/**
 * Enhanced Crossmint deposit webhook handler with WorkflowController integration
 * This is the primary webhook endpoint that processes Crossmint deposit events
 * and updates active off-ramp workflows through the WebhookHandler service.
 * Requirements: 5.1, 5.2, 5.4
 */
export async function handleCrossmintDepositWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    logger.info("Processing Crossmint deposit webhook with WorkflowController integration");

    // Primary processing through WebhookHandler for workflow integration
    await webhookHandler.handleDepositWebhook(req, res);
    
    // If WebhookHandler successfully handled the request, it will have sent a response
    if (res.headersSent) {
      logger.info("Webhook processed successfully by WebhookHandler");
      return;
    }

    // If we reach here, WebhookHandler didn't send a response, which is unexpected
    logger.warn("WebhookHandler did not send response, falling back to legacy processing");
    await handleLegacyDepositNotification(req, res);
    
  } catch (error) {
    logger.error("Error in enhanced deposit webhook handler:", error);
    
    // If WebhookHandler failed, try legacy processing as fallback
    if (!res.headersSent) {
      logger.info("Attempting legacy deposit notification as fallback");
      try {
        await handleLegacyDepositNotification(req, res);
      } catch (fallbackError) {
        logger.error("Legacy fallback also failed:", fallbackError);
        res.status(500).json({ 
          error: "Failed to process deposit webhook",
          details: "Both primary and fallback processing failed"
        });
      }
    }
  }
}

/**
 * Legacy deposit notification handler (for backward compatibility)
 * This maintains existing WhatsApp notification functionality
 */
async function handleLegacyDepositNotification(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const webhook: CrossmintDepositWebhook = req.body;

    logger.info("Processing legacy deposit notification:", webhook);

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

    // Send deposit notification to user via WhatsApp
    await handleDepositNotification(user.whatsappNumber, asset, amount, chain);

    logger.info(
      `Legacy deposit notification sent to ${user.whatsappNumber}: ${amount} ${asset} on ${chain}`,
    );

    res.status(200).json({
      success: true,
      message: "Deposit notification sent successfully",
    });
  } catch (error) {
    logger.error("Error handling legacy deposit notification:", error);
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
 * Enhanced with WorkflowController integration testing
 */
export async function testDepositNotification(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { phoneNumber, asset, amount, chain, userId, walletAddress, testWorkflow } = req.body;

    if (!phoneNumber || !asset || !amount || !chain) {
      res.status(400).json({
        error: "Missing required fields: phoneNumber, asset, amount, chain",
      });
      return;
    }

    // Test WorkflowController integration if requested
    if (testWorkflow && userId && walletAddress) {
      logger.info("Testing WorkflowController integration for deposit notification");
      
      try {
        await webhookHandler.handleTestWebhook(req, res);
        return; // Response handled by webhook handler
      } catch (webhookError) {
        logger.error("Error testing WorkflowController integration:", webhookError);
        // Fall through to legacy test
      }
    }

    // Legacy test notification
    await handleDepositNotification(
      phoneNumber,
      asset,
      parseFloat(amount),
      chain,
    );

    res.status(200).json({
      success: true,
      message: "Test deposit notification sent successfully",
    });
  } catch (error) {
    logger.error("Error sending test deposit notification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
