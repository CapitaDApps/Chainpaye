#!/usr/bin/env tsx
/**
 * Diagnostic + fix script for Crossmint smart wallet signer issues
 *
 * 1. GET wallet  → print full config including what signers are registered
 * 2. GET signers → list all delegated signers on the wallet
 * 3. If CGz55... is NOT registered, register it as a delegated signer
 * 4. Verify the registration succeeded
 *
 * Run:  npx tsx scripts/inspect-and-register-signer.ts
 */

import dotenv from "dotenv";
import axios, { AxiosError } from "axios";

dotenv.config();

const WALLET  = "ANXiMA4vasir9qr5xAvvt7z56E2ua1patzdtN1NCXWMo";
const API_KEY = process.env.CROSSMINT_API_KEY!;
const BASE    = process.env.CROSSMINT_BASE_URL || "https://crossmint.com/api/2025-06-09";
const ADMIN_SOLANA_ADDRESS = process.env.CROSSMINT_ADMIN_SOLANA_ADDRESS!;
const ADMIN_SOLANA_PRIVKEY = process.env.CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY!;

const headers = { "X-API-KEY": API_KEY, "Content-Type": "application/json" };

function printSection(title: string) {
  console.log(`\n${"─".repeat(55)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(55));
}

// ─────────────────────────────────────────────────────────
// Step 1 – Inspect wallet
// ─────────────────────────────────────────────────────────
async function inspectWallet() {
  printSection("1. GET wallet");
  const r = await axios.get(`${BASE}/wallets/${WALLET}`, { headers });
  console.log(JSON.stringify(r.data, null, 2));
  return r.data;
}

// ─────────────────────────────────────────────────────────
// Step 2 – List delegated signers
// ─────────────────────────────────────────────────────────
async function listSigners(): Promise<any[]> {
  printSection("2. GET signers");
  try {
    const r = await axios.get(`${BASE}/wallets/${WALLET}/signers`, { headers });
    console.log(JSON.stringify(r.data, null, 2));
    return Array.isArray(r.data) ? r.data : r.data?.signers ?? [];
  } catch (e: any) {
    console.log("Response:", e.response?.status, JSON.stringify(e.response?.data));
    return [];
  }
}

// ─────────────────────────────────────────────────────────
// Step 3 – Register delegated signer
// Crossmint docs: POST /wallets/{locator}/signers
// Body: { signer: "solana-keypair:<address>" }
// The wallet's ADMIN signer must co-sign this via approvals
// ─────────────────────────────────────────────────────────
async function registerSigner(signerLocator: string) {
  printSection(`3. Register delegated signer: ${signerLocator}`);

  let registerResp: any;
  try {
    const r = await axios.post(
      `${BASE}/wallets/${WALLET}/signers`,
      { signer: signerLocator },
      { headers },
    );
    registerResp = r.data;
    console.log("Register response:", JSON.stringify(registerResp, null, 2));
  } catch (e: any) {
    const data = e.response?.data;
    console.log("Register error:", e.response?.status, JSON.stringify(data));
    // 409 = already registered — treat as success
    if (e.response?.status === 409) {
      console.log("ℹ️  Signer already registered.");
      return;
    }
    throw e;
  }

  // If the registration itself needs approval (status === "awaiting-approval"),
  // sign and submit it
  if (registerResp?.status === "awaiting-approval") {
    printSection("3a. Approve signer registration");
    await approveTransaction(registerResp.id ?? registerResp.transactionId, registerResp);
  }
}

// ─────────────────────────────────────────────────────────
// Sign + submit approval for a pending Crossmint transaction
// ─────────────────────────────────────────────────────────
async function approveTransaction(txId: string, txData: any) {
  const pending: any[] = txData.approvals?.pending ?? [];

  if (pending.length === 0) {
    console.log("No pending approvals found in response — nothing to sign.");
    console.log("Full txData:", JSON.stringify(txData, null, 2));
    return;
  }

  for (const p of pending) {
    const message: string = p.message;
    if (!message) { console.warn("Approval entry has no message:", p); continue; }

    console.log(`  Signing message (${message.length} chars) with ${ADMIN_SOLANA_ADDRESS}...`);
    const signature = await signSolana(message);
    console.log(`  Signature: ${signature.slice(0, 32)}...`);

    const approvalPayload = {
      approvals: [{ signer: `solana-keypair:${ADMIN_SOLANA_ADDRESS}`, signature }],
    };

    const ar = await axios.post(
      `${BASE}/wallets/${WALLET}/transactions/${txId}/approvals`,
      approvalPayload,
      { headers },
    );
    console.log("  Approval result:", JSON.stringify(ar.data, null, 2));
  }
}

// ─────────────────────────────────────────────────────────
// Solana signing (mirrors CrossmintService.signSolanaMessage)
// ─────────────────────────────────────────────────────────
async function signSolana(messageBase64: string): Promise<string> {
  const { Keypair } = await import("@solana/web3.js");
  const nacl        = await import("tweetnacl");
  const bs58        = await import("bs58");

  const keypair = Keypair.fromSecretKey(bs58.default.decode(ADMIN_SOLANA_PRIVKEY));
  const msgBytes = Buffer.from(messageBase64, "base64");
  const sig = nacl.default.sign.detached(msgBytes, keypair.secretKey);
  return Buffer.from(sig).toString("base64");
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────
async function main() {
  console.log("🔍 Crossmint Wallet Signer Inspector + Registrar");
  console.log(`   Wallet  : ${WALLET}`);
  console.log(`   Admin   : ${ADMIN_SOLANA_ADDRESS}`);
  console.log(`   API base: ${BASE}`);

  if (!API_KEY)              throw new Error("Missing CROSSMINT_API_KEY");
  if (!ADMIN_SOLANA_ADDRESS) throw new Error("Missing CROSSMINT_ADMIN_SOLANA_ADDRESS");
  if (!ADMIN_SOLANA_PRIVKEY) throw new Error("Missing CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY");

  // Verify key matches address before any API calls
  const { Keypair } = await import("@solana/web3.js");
  const bs58        = await import("bs58");
  const kp          = Keypair.fromSecretKey(bs58.default.decode(ADMIN_SOLANA_PRIVKEY));
  const derived     = kp.publicKey.toBase58();
  if (derived !== ADMIN_SOLANA_ADDRESS) {
    throw new Error(`Key mismatch!\n  Key derives to : ${derived}\n  Env says       : ${ADMIN_SOLANA_ADDRESS}`);
  }
  console.log(`\n✅ Signing key verified: ${derived}`);

  // 1. Inspect wallet
  const walletData = await inspectWallet();

  // 2. List current signers
  const signers = await listSigners();

  const signerLocator = `solana-keypair:${ADMIN_SOLANA_ADDRESS}`;
  const alreadyRegistered = signers.some(
    (s: any) => (s.signer ?? s.locator ?? "") === signerLocator ||
                (s.address ?? "") === ADMIN_SOLANA_ADDRESS,
  );

  printSection("Summary");
  console.log("  Wallet admin signer type :", walletData?.config?.adminSigner?.type ?? "unknown");
  console.log("  Registered signers       :", signers.length);
  console.log("  Target signer            :", signerLocator);
  console.log("  Already registered?      :", alreadyRegistered ? "YES ✅" : "NO ❌");

  if (!alreadyRegistered) {
    console.log("\n🔧 Registering signer...");
    await registerSigner(signerLocator);
    console.log("\n✅ Signer registration complete. Re-run the transfer script.");
  } else {
    console.log("\n✅ Signer is registered. The transfer should work.");
    console.log("   If still failing, run the transfer script again.");
  }
}

main().catch((e: any) => {
  const detail = e.response?.data ?? e.message;
  console.error("\n❌ Script failed:");
  console.error(typeof detail === "object" ? JSON.stringify(detail, null, 2) : detail);
  process.exit(1);
});
