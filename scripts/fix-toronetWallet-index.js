/**
 * Script to fix the duplicate key error on toronetWallet field
 * This script drops the problematic index from the users collection
 */

const { connectDatabase, closeDatabase } = require("../config/database");

async function fixToronetWalletIndex() {
  try {
    await connectDatabase();

    console.log("Connected to MongoDB");

    // Get the users collection
    const db = require("mongoose").connection.db;
    const usersCollection = db.collection("users");

    // Check if the index exists
    const indexes = await usersCollection.indexInformation();
    const toronetWalletIndex = indexes.find(
      (index) => index.key && index.key.toronetWallet === 1
    );

    if (toronetWalletIndex) {
      console.log("Found toronetWallet index:", toronetWalletIndex);

      // Drop the problematic index
      await usersCollection.dropIndex("toronetWallet_1");
      console.log("Successfully dropped toronetWallet_1 index");
    } else {
      console.log("No toronetWallet index found");
    }

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
