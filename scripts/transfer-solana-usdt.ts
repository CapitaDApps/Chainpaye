#!/usr/bin/env tsx

/**
 * One-shot script: transfer 9.7 USDT on Solana via Crossmint
 *
 * Source wallet : ANXiMA4vasir9qr5xAvvt7z56E2ua1patzdtN1NCXWMo
 * Destination   : 3947D9DUMD4Rj4ssjUy17qVXiKN4zCdUe2vEDpHvfdCk
 * Amount        : 9.7 USDT (capped to 6 dp before sending)
 *
 * Flow
 *   1. Validate env vars + signing key
 *   2. GET wallet to confirm it exists and read its adminSigner type
 *   3. Check USDT balance
 *   4. POST /transfers  (with sanitised amount + correct signer prefix)
 *   5. If status === "awaiting-approval" → sign the message and POST /approvals
 *   6. Print the final transaction id
 *
 * Run:  npx tsx scripts/transfer-solana-usdt.ts
 */

import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE_WALLET = "ANXiMA4vasir9qr5xAvvt7z56E2ua1patzdtN1NCXWMo";
const RECIPIENT    = "3947D9DUMD4Rj4ssjUy17qVXiKN4zCdUe2vEDpHvfdCk";
const AMOUNT_RAW   = 9.7;
const TOKEN_ID     = "solana:usdt";           // Crossmint token identifier

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Truncate to at most maxDecimals decimal places (floor, not round). */
function sanitizeAmount(amount: number, maxDecimals: number): string {
  const factor = Math.pow(10, maxDecimals);
  const truncated = Math.floor(amount * factor) / factor;
  return parseFloat(truncated.toFixed(maxDecimals)).toString();
}

/** Simple idempotency key — deterministic for this run so re-runs don't double-send. */
function makeIdempotencyKey(): string {
  // Tie to SOURCE+RECIPIENT+AMOUNT so retrying the same script in the same minute is safe
  const base = `sol-usdt-${SOURCE_WALLET.slice(-6)}-${RECIPIENT.slice(-6)}-${sanitizeAmount(AMOUNT_RAW, 6)}`;
  return `${base}-${Math.floor(Date.now() / 60_000)}`; // changes every minute
}

/**
 * Sign a base64-encoded Solana message with the admin keypair.
 * Mirrors CrossmintService.signSolanaMessage exactly.
 */
async function signSolanaMessage(
  messageBase64: string,
  privateKeyBase58: string,
  expectedAddress: string,
): Promise<string> {
  const { Keypair }  = await import("@solana/web3.js");
  const nacl         = await import("tweetnacl");
  const bs58         = await import("bs58");

  const keypair = Keypair.fromSecretKey(bs58.default.decode(privateKeyBase58));

  const pubKey = keypair.publicKey.toBase58();
  if (pubKey !== expectedAddress) {
    throw new Error(
      `Key mismatch: key derives to ${pubKey} but expected ${expectedAddress}`,
    );
  }

  const messageBytes = Buffer.from(messageBase64, "base64");
  const sig          = nacl.default.sign.detached(messageBytes, keypair.secretKey);
  return Buffer.from(sig).toString("base64");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Crossmint Solana USDT Transfer");
  console.log("═══════════════════════════════════════════════");
  console.log(`  From   : ${SOURCE_WALLET}`);
  console.log(`  To     : ${RECIPIENT}`);
  console.log(`  Amount : ${AMOUNT_RAW} USDT`);
  console.log("═══════════════════════════════════════════════\n");

  // ── 1. Env validation ────────────────────────────────────────────────────
  const API_KEY        = process.env.CROSSMINT_API_KEY;
  const BASE_URL       = process.env.CROSSMINT_BASE_URL || "https://crossmint.com/api/2025-06-09";
  const ADMIN_ADDRESS  = process.env.CROSSMINT_ADMIN_SOLANA_ADDRESS;
  const ADMIN_PRIV_KEY = process.env.CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY;

  if (!API_KEY)        throw new Error("Missing env: CROSSMINT_API_KEY");
  if (!ADMIN_ADDRESS)  throw new Error("Missing env: CROSSMINT_ADMIN_SOLANA_ADDRESS");
  if (!ADMIN_PRIV_KEY) throw new Error("Missing env: CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY");

  const headers = {
    "X-API-KEY":    API_KEY,
    "Content-Type": "application/json",
  };

  // ── 2. Validate signing key before hitting the API ───────────────────────
  console.log("🔑 Validating Solana signing key...");
  {
    const { Keypair } = await import("@solana/web3.js");
    const bs58        = await import("bs58");
    const keypair     = Keypair.fromSecretKey(bs58.default.decode(ADMIN_PRIV_KEY));
    const derivedAddr = keypair.publicKey.toBase58();

    if (derivedAddr !== ADMIN_ADDRESS) {
      throw new Error(
        `CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY derives to ${derivedAddr}\n` +
        `but CROSSMINT_ADMIN_SOLANA_ADDRESS is ${ADMIN_ADDRESS}\n` +
        `These must match.`,
      );
    }
    console.log(`   ✅ Key valid — public key: ${derivedAddr}\n`);
  }

  // ── 3. Fetch the source wallet to get its adminSigner type ───────────────
  console.log(`🔍 Fetching wallet ${SOURCE_WALLET}...`);
  const walletResp = await axios.get(
    `${BASE_URL}/wallets/${SOURCE_WALLET}`,
    { headers },
  );
  const wallet = walletResp.data;

  const signerType    = wallet.config?.adminSigner?.type ?? "external-wallet";
  const signerString  = `${signerType}:${ADMIN_ADDRESS}`;

  console.log(`   Chain       : ${wallet.chainType}`);
  console.log(`   Signer type : ${signerType}`);
  console.log(`   Signer      : ${signerString}\n`);

  // ── 4. Check USDT balance ─────────────────────────────────────────────────
  console.log("💰 Checking USDT balance...");
  const balanceResp = await axios.get(
    `${BASE_URL}/wallets/${SOURCE_WALLET}/balances`,
    {
      headers,
      params: { tokens: "usdt" },
    },
  );

  const balances: any[] = balanceResp.data ?? [];
  console.log("   Raw balances:", JSON.stringify(balances, null, 2));

  const usdtEntry = balances.find(
    (b: any) => (b.symbol || b.token || "").toLowerCase() === "usdt",
  );

  let availableUsdt = 0;
  if (usdtEntry) {
    if (usdtEntry.rawAmount) {
      const decimals = usdtEntry.decimals ?? 6;
      availableUsdt = parseFloat(usdtEntry.rawAmount) / Math.pow(10, decimals);
    } else {
      availableUsdt = parseFloat(usdtEntry.amount) || 0;
    }
  }

  console.log(`   Available USDT: ${availableUsdt}`);

  if (availableUsdt < AMOUNT_RAW) {
    throw new Error(
      `Insufficient balance: have ${availableUsdt} USDT, need ${AMOUNT_RAW}`,
    );
  }
  console.log("   ✅ Balance sufficient\n");

  // ── 5. Build and submit the transfer ─────────────────────────────────────
  const sanitizedAmount  = sanitizeAmount(AMOUNT_RAW, 6);
  const idempotencyKey   = makeIdempotencyKey();
  const transferEndpoint = `${BASE_URL}/wallets/${SOURCE_WALLET}/tokens/${TOKEN_ID}/transfers`;

  const transferPayload = {
    amount:          sanitizedAmount,
    recipient:       RECIPIENT,
    transactionType: "direct",
    idempotencyKey,
    // signer:          signerString,
    metadata: {
      script: "transfer-solana-usdt",
      source: SOURCE_WALLET,
    },
  };

  console.log("🚀 Submitting transfer...");
  console.log("   Endpoint      :", transferEndpoint);
  console.log("   Amount        :", sanitizedAmount, "USDT");
  console.log("   Idempotency   :", idempotencyKey);
  console.log("   Signer        :", signerString);
  console.log();

  const transferResp = await axios.post(transferEndpoint, transferPayload, {
    headers: { ...headers, "Idempotency-Key": idempotencyKey },
    timeout: 30_000,
  });

  const txData = transferResp.data;
  console.log("📨 Crossmint response:");
  console.log(JSON.stringify(txData, null, 2));
  console.log();

  // ── 6. Handle awaiting-approval (sign + submit) ───────────────────────────
  if (txData.status === "awaiting-approval") {
    const pendingApprovals: any[] = txData.approvals?.pending ?? [];

    if (pendingApprovals.length === 0) {
      throw new Error(
        `Transaction ${txData.id} is awaiting approval but no pending approvals were returned.`,
      );
    }

    console.log(`⚠️  Transaction awaiting approval (${pendingApprovals.length} pending)`);

    for (const pending of pendingApprovals) {
      const message = pending.message;
      if (!message) {
        console.warn("   Skipping approval entry with no message:", pending);
        continue;
      }

      console.log(`   Signing message (${message.length} chars)...`);
      const signature = await signSolanaMessage(message, ADMIN_PRIV_KEY, ADMIN_ADDRESS);
      console.log(`   Signature (base64, ${signature.length} chars): ${signature.slice(0, 32)}...`);

      const approvalPayload = {
        approvals: [
          {
            signer: signerString,
            signature,
          },
        ],
      };

      const approvalEndpoint = `${BASE_URL}/wallets/${SOURCE_WALLET}/transactions/${txData.id}/approvals`;
      console.log(`   POSTing approval to: ${approvalEndpoint}`);

      const approvalResp = await axios.post(approvalEndpoint, approvalPayload, {
        headers,
        timeout: 30_000,
      });

      console.log("\n✅ Approval submitted:");
      console.log(JSON.stringify(approvalResp.data, null, 2));
    }
  }

  // ── 7. Summary ────────────────────────────────────────────────────────────
  const txId = txData.id ?? txData.transactionId ?? "(unknown)";
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Transfer complete");
  console.log(`  Transaction ID : ${txId}`);
  console.log(`  Status         : ${txData.status ?? "submitted"}`);
  console.log("═══════════════════════════════════════════════");
}

main().catch((err) => {
  const detail = err.response?.data ?? err.message;
  console.error("\n❌ Transfer failed:");
  console.error(typeof detail === "object" ? JSON.stringify(detail, null, 2) : detail);
  process.exit(1);
});
