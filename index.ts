/**
 * Main entry point for the ChainPaye WhatsApp bot
 * This file initializes the bot, connects to MongoDB,
 * and sets up the core bot functionality
 */

import { connectDatabase } from "./config/database";
import "./config/init";
import { logger } from "./utils/logger";
import { app } from "./webhooks";

logger.info("Environment variables loaded");

/**
 * Main bot initialization function
 */
const { PORT = "3000" } = process.env;

async function initializeBot() {
  try {
    // Connect to MongoDB
    await connectDatabase();
    logger.info("Database connected successfully");

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

// process.on("unhandledRejection", (reason, promise) => {
//   logger.error("Unhandled Rejection at:", promise, "reason:", reason);
//   process.exit(1);
// });

// Start the bot
initializeBot().then(() => {
  // Initialize WhatsApp bot
  logger.info("Initializing ChainPaye WhatsApp bot...");

  // TODO: Set up webhook listeners
  // TODO: Initialize message handlers

  app.listen(PORT, (error) => {
    if (error) return console.error("Error starting server", error);
    console.log("Server online...");
  });
});
