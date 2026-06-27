/**
 * Test Solana keypair to verify private key matches public address
 * Run with: npx ts-node scripts/test-solana-keypair.ts
 */

import dotenv from 'dotenv';
dotenv.config();

async function testSolanaKeypair() {
  console.log("\n========================================");
  console.log("🔐 SOLANA KEYPAIR VERIFICATION");
  console.log("========================================\n");

  const publicAddress = process.env.CROSSMINT_ADMIN_SOLANA_ADDRESS;
  const privateKey = process.env.CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY;

  if (!publicAddress) {
    console.error("❌ CROSSMINT_ADMIN_SOLANA_ADDRESS not set in .env");
    process.exit(1);
  }

  if (!privateKey) {
    console.error("❌ CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  console.log("📍 Public Address (from .env):");
  console.log(`   ${publicAddress}\n`);

  try {
    // Import Solana dependencies
    const { Keypair } = await import('@solana/web3.js');
    const bs58 = await import('bs58');

    // Create keypair from private key
    console.log("🔑 Decoding private key...");
    const keypair = Keypair.fromSecretKey(bs58.default.decode(privateKey));
    
    const derivedPublicKey = keypair.publicKey.toBase58();
    console.log("✅ Private key decoded successfully\n");

    console.log("📍 Derived Public Address (from private key):");
    console.log(`   ${derivedPublicKey}\n`);

    // Compare addresses
    if (derivedPublicKey === publicAddress) {
      console.log("✅ SUCCESS: Private key matches public address!");
      console.log("   The keypair is valid and can be used for signing.\n");
      
      // Test signing
      console.log("🧪 Testing message signing...");
      const nacl = await import('tweetnacl');
      const testMessage = Buffer.from("test message", "utf-8");
      const signature = nacl.default.sign.detached(testMessage, keypair.secretKey);
      console.log("✅ Message signing successful");
      console.log(`   Signature length: ${signature.length} bytes\n`);
      
      console.log("========================================");
      console.log("✅ KEYPAIR VERIFICATION PASSED");
      console.log("========================================\n");
      process.exit(0);
    } else {
      console.log("❌ ERROR: Private key does NOT match public address!");
      console.log("\n🔍 Comparison:");
      console.log(`   Expected: ${publicAddress}`);
      console.log(`   Got:      ${derivedPublicKey}`);
      console.log("\n💡 Solution:");
      console.log("   1. Verify you copied the correct private key");
      console.log("   2. Ensure the private key corresponds to the public address");
      console.log("   3. Generate a new keypair if needed\n");
      
      console.log("========================================");
      console.log("❌ KEYPAIR VERIFICATION FAILED");
      console.log("========================================\n");
      process.exit(1);
    }
  } catch (error: any) {
    console.error("❌ ERROR:", error.message);
    console.error("\n💡 Common issues:");
    console.error("   - Private key is not in base58 format");
    console.error("   - Private key is corrupted or incomplete");
    console.error("   - Missing @solana/web3.js or bs58 packages");
    console.error("\n📦 Install required packages:");
    console.error("   npm install @solana/web3.js bs58 tweetnacl\n");
    
    console.log("========================================");
    console.log("❌ KEYPAIR VERIFICATION FAILED");
    console.log("========================================\n");
    process.exit(1);
  }
}

testSolanaKeypair();
