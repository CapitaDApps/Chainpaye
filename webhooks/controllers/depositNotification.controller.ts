/**
 * Deposit Notification Controller
 * Handles webhook notifications from Crossmint when deposits are detected
 */

import { Request, Response } from "express";
import { handleDepositNotification } from "../../commands/handlers/offrampHandler";
import { userService } from "../../services";
import { logger } from "../../utils/logger";

export interface CrossmintTransferWebhook {
  id: string;
  type: "wallets.transfer.in" | "wallets.transfer.out";
  timestamp: number;
  data: {
    completedAt: string;
    status: "succeeded" | "failed" | "pending";
    onChain: {
      txId: string;
      explorerLink: string;
    };
    sender: {
      address: string;
      chain: string;
      locator: string;
      owner: string; // Format: "user-123" or "userId:user-123"
    };
    recipient: {
      address: string;
      chain: string;
      locator: string;
      owner: string; // Format: "user-123" or "userId:user-123"
    };
    token: {
      amount: string;
      rawAmount: string;
      decimals: number;
      chain: string;
      contractAddress: string;
      locator: string;
      type: "fungible";
    };
  };
}

/**
 * Handle Crossmint deposit webhook
 */
export async function handleCrossmintDepositWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const webhook: CrossmintTransferWebhook = req.body;

    logger.info("Received Crossmint transfer webhook:", {
      id: webhook.id,
      type: webhook.type,
      status: webhook.data?.status,
    });

    // Validate webhook structure
    if (!webhook.type || !webhook.data) {
      logger.warn("Invalid webhook type or missing data");
      res.status(400).json({ error: "Invalid webhook format" });
      return;
    }

    // Only process incoming transfers (deposits)
    if (webhook.type !== "wallets.transfer.in") {
      logger.info(`Ignoring webhook type: ${webhook.type}`);
      res.status(200).json({ 
        success: true, 
        message: "Webhook type not processed" 
      });
      return;
    }

    // Only process successful transfers
    if (webhook.data.status !== "succeeded") {
      logger.info(`Ignoring transfer with status: ${webhook.data.status}`);
      res.status(200).json({ 
        success: true, 
        message: "Transfer not yet completed" 
      });
      return;
    }

    const { data } = webhook;

    // Extract user ID from recipient owner field
    // Format can be "user-123" or "userId:user-123"
    const recipientOwner = data.recipient.owner;
    let userId: string;

    if (recipientOwner.startsWith("userId:")) {
      userId = recipientOwner.replace("userId:", "");
    } else if (recipientOwner.startsWith("user-")) {
      userId = recipientOwner;
    } else {
      // Assume it's just the userId
      userId = recipientOwner;
    }

    if (!userId) {
      logger.warn("Empty userId extracted from recipient owner field");
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

    // Extract deposit details from token data
    const amount = parseFloat(data.token.amount);
    const rawAmount = data.token.rawAmount;
    const decimals = data.token.decimals;
    
    // Extract token symbol from contract address
    const asset = mapContractToAsset(
      data.token.contractAddress, 
      data.token.chain
    );
    
    const chain = mapChainName(data.token.chain);

    logger.info("Processing deposit:", {
      userId,
      phoneNumber: user.whatsappNumber,
      amount,
      rawAmount,
      decimals,
      asset,
      chain,
      txId: data.onChain.txId,
    });

    // Send deposit notification to user
    await handleDepositNotification(
      user.whatsappNumber, 
      asset, 
      amount, 
      chain
    );

    logger.info(
      `Deposit notification sent to ${user.whatsappNumber}: ${amount} ${asset} on ${chain}`,
    );

    res.status(200).json({
      success: true,
      message: "Deposit notification sent successfully",
      data: {
        userId,
        amount,
        asset,
        chain,
        txId: data.onChain.txId,
      }
    });
  } catch (error) {
    logger.error("Error handling Crossmint deposit webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Map contract address to asset symbol
 * This is a simplified version - you should maintain a proper mapping
 */
function mapContractToAsset(contractAddress: string, chain: string): string {
  // Common stablecoin contract addresses
  const contractMappings: { [key: string]: { [key: string]: string } } = {
    ethereum: {
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "usdc", // USDC on Ethereum
      "0xdac17f958d2ee523a2206206994597c13d831ec7": "usdt", // USDT on Ethereum
    },
    base: {
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "usdc", // USDC on Base
    },
    arbitrum: {
      "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "usdc", // USDC on Arbitrum
      "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "usdt", // USDT on Arbitrum
    },
    bsc: {
      "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "usdc", // USDC on BSC
      "0x55d398326f99059ff775485246999027b3197955": "usdt", // USDT on BSC
    },
    solana: {
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "usdc", // USDC on Solana
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "usdt", // USDT on Solana
    },
  };

  const chainMappings = contractMappings[chain.toLowerCase()];
  if (chainMappings) {
    const asset = chainMappings[contractAddress.toLowerCase()];
    if (asset) {
      return asset;
    }
  }

  // Fallback: return contract address if not found
  logger.warn(`Unknown contract address: ${contractAddress} on ${chain}`);
  return contractAddress.substring(0, 8); // Return first 8 chars as fallback
}

/**
 * Map Crossmint chain names to user-friendly names
 */
function mapChainName(chain: string): string {
  const chainMapping: { [key: string]: string } = {
    ethereum: "Ethereum",
    solana: "Solana",
    bsc: "BEP20",
    arbitrum: "Arbitrum",
    base: "Base",
    hedera: "Hedera",
    apechain: "ApeChain",
    lisk: "Lisk",
  };

  return chainMapping[chain.toLowerCase()] || chain;
}

/**
 * Test endpoint for deposit notifications (for development/testing)
 */
export async function testDepositNotification(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { phoneNumber, asset, amount, chain } = req.body;

    if (!phoneNumber || !asset || !amount || !chain) {
      res.status(400).json({
        error: "Missing required fields: phoneNumber, asset, amount, chain",
      });
      return;
    }

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
