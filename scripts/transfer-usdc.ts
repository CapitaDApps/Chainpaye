/**
 * One-shot USDC transfer script using Crossmint services
 *
 * Transfers 7.08 USDC on Solana from:
 *   Fwb6cGDnrPXjtPw8sruubznzPePrYFaJ1K3WNGjkdLRb
 * To:
 *   7M8DShk8Zg2suD9FB8woNnrvvZT2Mo8mwcgmU3SwEtez
 *
 * Run with: npx ts-node scripts/transfer-usdc.ts
 */

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const FROM_WALLET = process.env.TRANSFER_FROM_WALLET || "";
const TO_WALLET   = process.env.TRANSFER_TO_WALLET   || "";
const AMOUNT      = process.env.TRANSFER_AMOUNT      || "7.08";
const TOKEN_ID    = "solana:usdc"; // chain:symbol format used by Crossmint

const API_KEY  = process.env.CROSSMINT_API_KEY!;
const BASE_URL = process.env.CROSSMINT_BASE_URL || "https://crossmint.com/api/2025-06-09";
const ADMIN_SOLANA_ADDRESS     = process.env.CROSSMINT_ADMIN_SOLANA_ADDRESS!;
const ADMIN_SOLANA_PRIVATE_KEY = process.env.CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY!;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateIdempotencyKey(): string {
  return `transfer-usdc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function signSolanaMessage(messageToSign: string): Promise<string> {
  if (!ADMIN_SOLANA_PRIVATE_KEY) {
    throw new Error(
      "CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY is not set in .env"
    );
  }

  const keypair = Keypair.fromSecretKey(bs58.decode(ADMIN_SOLANA_PRIVATE_KEY));

  // Verify the keypair matches the configured admin address
  if (keypair.publicKey.toBase58() !== ADMIN_SOLANA_ADDRESS) {
    throw new Error(
      `Private key address (${keypair.publicKey.toBase58()}) does not match ` +
      `CROSSMINT_ADMIN_SOLANA_ADDRESS (${ADMIN_SOLANA_ADDRESS})`
    );
  }

  // Crossmint sends the approval message as a base58-encoded serialized Solana transaction.
  // We must decode it to raw bytes, then sign those bytes with ed25519.
  const messageBytes = bs58.decode(messageToSign);

  console.log(`   Message bytes length: ${messageBytes.length}`);

  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  return bs58.encode(signature);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n========================================");
  console.log("💸 USDC TRANSFER SCRIPT");
  console.log("========================================");
  console.log(`From   : ${FROM_WALLET}`);
  console.log(`To     : ${TO_WALLET}`);
  console.log(`Amount : ${AMOUNT} USDC`);
  console.log(`Token  : ${TOKEN_ID}`);
  console.log("========================================\n");

  // ── Pre-flight checks ──────────────────────────────────────────────────────
  if (!FROM_WALLET) {
    console.error("❌ TRANSFER_FROM_WALLET is not set in .env");
    process.exit(1);
  }
  if (!TO_WALLET) {
    console.error("❌ TRANSFER_TO_WALLET is not set in .env");
    process.exit(1);
  }
  if (!API_KEY) {
    console.error("❌ CROSSMINT_API_KEY is not set in .env");
    process.exit(1);
  }
  if (!ADMIN_SOLANA_ADDRESS) {
    console.error("❌ CROSSMINT_ADMIN_SOLANA_ADDRESS is not set in .env");
    process.exit(1);
  }
  if (!ADMIN_SOLANA_PRIVATE_KEY) {
    console.error("❌ CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY is not set in .env");
    process.exit(1);
  }

  const idempotencyKey = generateIdempotencyKey();
  const transferEndpoint = `${BASE_URL}/wallets/${FROM_WALLET}/tokens/${TOKEN_ID}/transfers`;

  const transferPayload = {
    amount: AMOUNT,
    recipient: TO_WALLET,
    transactionType: "direct",
    idempotencyKey,
    signer: `external-wallet:${ADMIN_SOLANA_ADDRESS}`,
    metadata: {
      note: "Manual USDC transfer via transfer-usdc.ts script",
    },
  };

  console.log("📡 Sending transfer request to Crossmint...");
  console.log("Endpoint :", transferEndpoint);
  console.log("Payload  :", JSON.stringify(transferPayload, null, 2));
  console.log();

  // ── Step 1: Create the transfer transaction ────────────────────────────────
  let txData: any;
  try {
    const response = await axios.post(transferEndpoint, transferPayload, {
      headers: {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      timeout: 30_000,
    });

    txData = response.data;
    console.log("✅ Transfer request accepted by Crossmint");
    console.log("Response:", JSON.stringify(txData, null, 2));
    console.log();
  } catch (err: any) {
    console.error("❌ Transfer request failed");
    console.error("Status :", err.response?.status);
    console.error("Body   :", JSON.stringify(err.response?.data, null, 2));
    console.error("Message:", err.message);
    process.exit(1);
  }

  // ── Step 2: Auto-approve if awaiting-approval ──────────────────────────────
  if (txData.status === "awaiting-approval") {
    console.log("⏳ Transaction is awaiting approval — signing now...");

    const pendingApprovals: any[] = txData.approvals?.pending ?? [];
    if (pendingApprovals.length === 0) {
      console.error("❌ No pending approvals found in response. Cannot sign.");
      console.error("Full response:", JSON.stringify(txData, null, 2));
      process.exit(1);
    }

    const messageToSign: string = pendingApprovals[0]?.message;
    if (!messageToSign) {
      console.error("❌ Approval message is empty. Cannot sign.");
      process.exit(1);
    }

    console.log("Message to sign:", messageToSign.substring(0, 60) + "...");

    let signature: string;
    try {
      signature = await signSolanaMessage(messageToSign);
      console.log("✅ Message signed successfully");
      console.log("Signature (bs58):", signature.substring(0, 20) + "...");
      console.log();
    } catch (err: any) {
      console.error("❌ Signing failed:", err.message);
      process.exit(1);
    }

    // Submit the approval
    const approvalEndpoint = `${BASE_URL}/wallets/${FROM_WALLET}/transactions/${txData.id}/approvals`;
    const approvalPayload = {
      approvals: [
        {
          signer: `external-wallet:${ADMIN_SOLANA_ADDRESS}`,
          signature,
        },
      ],
    };

    console.log("📡 Submitting approval to Crossmint...");
    console.log("Endpoint:", approvalEndpoint);

    try {
      const approvalResponse = await axios.post(
        approvalEndpoint,
        approvalPayload,
        {
          headers: {
            "X-API-KEY": API_KEY,
            "Content-Type": "application/json",
          },
          timeout: 30_000,
        }
      );

      txData = approvalResponse.data;
      console.log("✅ Approval submitted successfully");
      console.log("Response:", JSON.stringify(txData, null, 2));
      console.log();
    } catch (err: any) {
      console.error("❌ Approval submission failed");
      console.error("Status :", err.response?.status);
      console.error("Body   :", JSON.stringify(err.response?.data, null, 2));
      console.error("Message:", err.message);
      process.exit(1);
    }
  }

  // ── Step 3: Poll for final status ──────────────────────────────────────────
  const transactionId: string = txData.id;
  const statusEndpoint = `${BASE_URL}/wallets/${FROM_WALLET}/transactions/${transactionId}`;
  const terminalStatuses = new Set(["completed", "confirmed", "success", "failed", "cancelled"]);
  const maxPolls = 20;
  const pollIntervalMs = 5_000;

  console.log(`🔄 Polling for transaction status (up to ${maxPolls} attempts, every ${pollIntervalMs / 1000}s)...`);
  console.log(`Transaction ID: ${transactionId}\n`);

  let finalStatus = txData.status;

  for (let i = 1; i <= maxPolls; i++) {
    if (terminalStatuses.has(finalStatus)) break;

    await new Promise((r) => setTimeout(r, pollIntervalMs));

    try {
      const statusResponse = await axios.get(statusEndpoint, {
        headers: { "X-API-KEY": API_KEY },
        timeout: 15_000,
      });

      finalStatus = statusResponse.data.status;
      console.log(`[Poll ${i}/${maxPolls}] Status: ${finalStatus}`);

      if (terminalStatuses.has(finalStatus)) {
        txData = statusResponse.data;
        break;
      }
    } catch (err: any) {
      console.warn(`[Poll ${i}/${maxPolls}] Status check failed: ${err.message}`);
    }
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log("\n========================================");
  if (finalStatus === "completed" || finalStatus === "confirmed" || finalStatus === "success") {
    console.log("✅ TRANSFER COMPLETE");
    console.log(`   Amount        : ${AMOUNT} USDC`);
    console.log(`   From          : ${FROM_WALLET}`);
    console.log(`   To            : ${TO_WALLET}`);
    console.log(`   Transaction ID: ${transactionId}`);
    console.log(`   Final Status  : ${finalStatus}`);
    if (txData.onChain?.txId) {
      console.log(`   On-chain TX   : ${txData.onChain.txId}`);
    }
  } else if (finalStatus === "failed" || finalStatus === "cancelled") {
    console.log(`❌ TRANSFER ${finalStatus.toUpperCase()}`);
    console.log(`   Transaction ID: ${transactionId}`);
    console.log(`   Final Status  : ${finalStatus}`);
    console.log("   Full response:", JSON.stringify(txData, null, 2));
    process.exit(1);
  } else {
    console.log("⏳ TRANSFER STILL PENDING");
    console.log(`   Transaction ID: ${transactionId}`);
    console.log(`   Last Status   : ${finalStatus}`);
    console.log("   The transaction may still complete. Check Crossmint dashboard.");
  }
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("\n💥 Unexpected error:", err.message);
  process.exit(1);
});
