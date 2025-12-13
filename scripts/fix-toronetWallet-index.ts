/**
 * Script to fix the duplicate key error on toronetWallet field
 * This script drops the problematic index from the users collection
 */

import mongoose from "mongoose";
import { connectDatabase, closeDatabase } from "../config/database";
import dotenv from "dotenv";
dotenv.config();

async function fixToronetWalletIndex() {
  try {
    await connectDatabase();

    console.log("Connected to MongoDB");

    // Get the users collection
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not established");
    }
    const usersCollection = db.collection("wallets");

    // Check if the index exists
    const indexes = await usersCollection.indexInformation();
    // const toronetWalletIndex = Object.values(indexes).find(
    //   (index: any) => index.key && index.key.toronetWallet === 1
    // );

    await usersCollection.dropIndex("toronetWalletId_1");
    console.log("Successfully dropped toronetWallet_1 index");

    // console.log({ twi: Object.values(indexes) });

    // if (toronetWalletIndex) {
    //   console.log("Found toronetWallet index:", toronetWalletIndex);

    //   // Drop the problematic index

    //   console.log("Successfully dropped toronetWallet_1 index");
    // } else {
    //   console.log("No toronetWallet index found");
    // }

    // List all remaining indexes for verification
    const remainingIndexes = await usersCollection.indexInformation();
    console.log("Remaining indexes:", Object.keys(remainingIndexes));
  } catch (error) {
    console.error("Error fixing toronetWallet index:", error);
  } finally {
    await closeDatabase();
    console.log("Database connection closed");
  }
}

// Run the fix
fixToronetWalletIndex();
