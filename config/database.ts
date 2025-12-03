/**
 * Database configuration for MongoDB connection using Mongoose
 * This file handles the connection to the MongoDB database
 */

import mongoose from "mongoose";
import { logger } from "../utils/logger";

/**
 * Connect to MongoDB database
 * @returns Promise that resolves when connection is established
 */
export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri =
      process.env.MONGO_DB_URI || "mongodb://localhost:27017/chainpaye";

    await mongoose.connect(mongoUri);

    logger.info("Connected to MongoDB successfully");
  } catch (error) {
    logger.error("Error connecting to MongoDB:", error);
    throw error;
  }
};

/**
 * Handle MongoDB connection events
 */
mongoose.connection.on("error", (error) => {
  logger.error("MongoDB connection error:", error);
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  logger.info("MongoDB reconnected");
});

/**
 * Gracefully close MongoDB connection
 * @returns Promise that resolves when connection is closed
 */
export const closeDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logger.info("MongoDB connection closed");
  } catch (error) {
    logger.error("Error closing MongoDB connection:", error);
    throw error;
  }
};
