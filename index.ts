/**
 * Main entry point for the ChainPaye WhatsApp bot
 * This file initializes the bot, connects to MongoDB,
 * and sets up the core bot functionality
 */

import { connectDatabase } from "./config/database";
import { logger } from "./utils/logger";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Main bot initialization function
 */
async function initializeBot() {
  try {
    // Connect to MongoDB
    await connectDatabase();
    logger.info("Database connected successfully");

    // Initialize WhatsApp bot
    logger.info("Initializing ChainPaye WhatsApp bot...");

    // TODO: Initialize WhatsApp Business API connection
    // TODO: Set up webhook listeners
    // TODO: Initialize message handlers

    logger.info("ChainPaye WhatsApp bot initialized successfully");

    // Keep the process running
    logger.info("Bot is running and waiting for messages...");
  } catch (error) {
    logger.error("Failed to initialize bot:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the bot
initializeBot();
