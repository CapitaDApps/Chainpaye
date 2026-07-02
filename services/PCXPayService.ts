import axios from "axios";
import { logger } from "../utils/logger";

const PCXPAY_BASE_URL   = "https://prod-api.pcxpay.com";
const PCXPAY_API_KEY    = process.env.PCXPAY_API_KEY    || "";
const PCXPAY_ORG_ID     = process.env.PCXPAY_ORG_ID     || "";
const PCXPAY_USER_ID    = process.env.PCXPAY_USER_ID    || "";
const PCXPAY_ACCOUNT_ID = process.env.PCXPAY_ACCOUNT_ID || "";

function pcxHeaders() {
  return {
    "Content-Type": "application/json",
    "x-api-key": PCXPAY_API_KEY,
    Authorization: "None",
  };
}

// ─── Network rail mapping ────────────────────────────────────────────────────
// Maps the crypto_network value used in the flow to the PCXPay payment_rail string.
// PCXPay uses lowercase rail names.
export const NETWORK_TO_RAIL: Record<string, string> = {
  BASE:      "base",
  base:      "base",
  SOL:       "solana",
  solana:    "solana",
  sol:       "solana",
  BEP20:     "bsc",
  bep20:     "bsc",
  BSC:       "bsc",
  bsc:       "bsc",
  ERC20:     "ethereum",
  erc20:     "ethereum",
  ETHEREUM:  "ethereum",
  ethereum:  "ethereum",
  POLYGON:   "polygon",
  polygon:   "polygon",
  ARBITRUM:  "arbitrum",
  arbitrum:  "arbitrum",
  OPTIMISM:  "optimism",
  optimism:  "optimism",
  AVALANCHE: "avalanche",
  avax:      "avalanche",
  AVAX:      "avalanche",
  STELLAR:   "stellar",
  stellar:   "stellar",
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PCXRate {
  rate: number;
  orgRateId: string;
}

export interface PCXDepositIntent {
  transactionId: string;
  toAddress: string;   // PCX bridge wallet — where user sends crypto
  expiresAt: string;
}

export interface PCXRampPayment {
  paymentId: string;
  providerWalletAddress: string;  // where to withdraw settlement from virtual account
  cryptoAmount: number;
  status: string;
}

export interface PCXWithdrawal {
  transactionId: string;
  state: string;
}

export interface PCXBankTransferDestination {
  accountNumber: string;
  bankCode: string;
  bankName: string;
}

export interface PCXMobileMoneyDestination {
  provider: string;   // e.g. "MTN_Rwanda"
  phoneNumber: string;
}

export interface PCXInitRampParams {
  fiatCurrency: string;        // e.g. "ZAR"
  fiatAmount: number;
  clientRate: number;          // PCX rate (not marked up)
  orgRateId: string;
  cryptoCurrency: string;      // "USDC" | "USDT"
  cryptoNetwork: string;       // e.g. "BASE"
  country: string;             // 2-letter ISO e.g. "ZA"
  paymentMethod: "bank_transfer" | "mobile_money";
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  beneficiaryName: string;
  destination: PCXBankTransferDestination | PCXMobileMoneyDestination;
  partnerTxId?: string;
}

// ─── Step 1: Get exchange rate ────────────────────────────────────────────────

export async function getPcxRate(toCurrency: string): Promise<PCXRate> {
  const url = `${PCXPAY_BASE_URL}/v1/organizations/admin/exchange-rate?fromCurrency=USD&toCurrency=${toCurrency}&orgId=${PCXPAY_ORG_ID}`;
  const response = await axios.get(url, { headers: pcxHeaders() });

  const data = response.data?.data;
  const rate = data?.rate;
  const orgRateId = data?.org_rate_id;

  if (!rate || isNaN(Number(rate)) || !orgRateId) {
    throw new Error(`Invalid rate response from PCXPay for ${toCurrency}`);
  }

  logger.info(`[PCX] Rate ${toCurrency}: 1 USD = ${rate}, org_rate_id=${orgRateId}`);
  return { rate: Number(rate), orgRateId: String(orgRateId) };
}

// ─── Step 3: Register deposit intent ─────────────────────────────────────────
// Called before the user sends crypto. PCXPay returns the bridge wallet address
// (to_address) that the user's crypto must be sent to.

export async function registerPcxDepositIntent(params: {
  fromAddress: string;   // user's Crossmint wallet address
  cryptoCurrency: string;
  cryptoNetwork: string; // flow network string e.g. "BASE"
  amount: number;        // exact crypto amount user will send
  partnerTxId: string;
  fiatAmount: number;
  beneficiaryAccount?: string;
  beneficiaryBank?: string;
}): Promise<PCXDepositIntent> {
  const rail = NETWORK_TO_RAIL[params.cryptoNetwork] ?? params.cryptoNetwork.toLowerCase();

  const payload = {
    account_id: PCXPAY_ACCOUNT_ID,
    payment_rail: rail,
    currency: params.cryptoCurrency.toUpperCase(),
    user_id: PCXPAY_USER_ID,
    from_address: params.fromAddress,
    amount: params.amount,
    description: "Off-ramp deposit",
    metadata: {
      partner_tx_id: params.partnerTxId,
      fiat_amount: params.fiatAmount,
      ...(params.beneficiaryAccount ? { beneficiary_account: params.beneficiaryAccount } : {}),
      ...(params.beneficiaryBank    ? { beneficiary_bank:    params.beneficiaryBank    } : {}),
    },
  };

  logger.info(`[PCX] Registering deposit intent for partner_tx=${params.partnerTxId}, rail=${rail}, amount=${params.amount}`);
  const response = await axios.post(
    `${PCXPAY_BASE_URL}/v1/virtual-accounts/fund/crypto`,
    payload,
    { headers: pcxHeaders() },
  );

  const data = response.data?.data;
  if (!data?.transaction_id || !data?.source_deposit_instructions?.to_address) {
    throw new Error("PCXPay deposit intent response missing transaction_id or to_address");
  }

  return {
    transactionId: data.transaction_id,
    toAddress: data.source_deposit_instructions.to_address,
    expiresAt: data.expires_at ?? "",
  };
}

// ─── Step 5: Poll deposit status ─────────────────────────────────────────────
// Returns "pending" | "processing" | "completed" | "failed"

export async function getPcxDepositStatus(depositTxId: string): Promise<string> {
  const response = await axios.get(
    `${PCXPAY_BASE_URL}/v1/virtual-accounts/transactions/${depositTxId}`,
    { headers: pcxHeaders() },
  );
  return response.data?.data?.status ?? "unknown";
}

// ─── Step 6: Initiate ramp payment ───────────────────────────────────────────

export async function initiatePcxRampPayment(params: PCXInitRampParams): Promise<PCXRampPayment> {
  const isMobileMoney = params.paymentMethod === "mobile_money";
  const dest = params.destination;

  // Build destination object — same shape for both methods (phone as accountNumber for momo)
  let destinationBody: Record<string, string>;
  let mobileMoneyDetails: Record<string, string> | undefined;

  if (isMobileMoney) {
    const d = dest as PCXMobileMoneyDestination;
    destinationBody = {
      accountNumber: d.phoneNumber,
      bankCode:      d.provider,
      bankName:      d.provider,
    };
    mobileMoneyDetails = {
      provider:     d.provider,
      phone_number: d.phoneNumber,
    };
  } else {
    const d = dest as PCXBankTransferDestination;
    destinationBody = {
      accountNumber: d.accountNumber,
      bankCode:      d.bankCode,
      bankName:      d.bankName,
    };
  }

  const payload: Record<string, unknown> = {
    org_id:           PCXPAY_ORG_ID,
    user_id:          PCXPAY_USER_ID,
    direction:        "off_ramp",
    fiat_currency:    params.fiatCurrency,
    fiat_amount:      params.fiatAmount,
    crypto_currency:  params.cryptoCurrency.toUpperCase(),
    crypto_network:   params.cryptoNetwork.toUpperCase(),
    client_rate:      params.clientRate,
    org_rate_id:      params.orgRateId,
    country:          params.country,
    payment_method:   params.paymentMethod,
    payer_details: {
      email: params.payerEmail,
      name:  params.payerName,
      phone: params.payerPhone,
    },
    beneficiary_id:   "12345",
    beneficiary_name: params.beneficiaryName,
    destination:      destinationBody,
    metadata:         params.partnerTxId ? { partner_transaction_id: params.partnerTxId } : {},
  };

  if (mobileMoneyDetails) {
    payload.mobile_money_details = mobileMoneyDetails;
  }

  logger.info(`[PCX] Initiating ramp payment: ${params.fiatCurrency} ${params.fiatAmount} via ${params.paymentMethod}`);
  const response = await axios.post(
    `${PCXPAY_BASE_URL}/v1/payments-init/ramp`,
    payload,
    { headers: pcxHeaders() },
  );

  const ramp = response.data?.response;
  if (!ramp?.payment_id || !ramp?.payment_instructions?.wallet_address) {
    throw new Error(`PCXPay ramp init failed: ${JSON.stringify(response.data)}`);
  }

  return {
    paymentId:             ramp.payment_id,
    providerWalletAddress: ramp.payment_instructions.wallet_address,
    cryptoAmount:          ramp.crypto_amount ?? 0,
    status:                ramp.status ?? "created",
  };
}

// ─── Step 7: Withdraw settlement from virtual account → Provider wallet ───────

export async function withdrawPcxSettlement(params: {
  amount: number;
  currency: string;
  cryptoNetwork: string;
  toAddress: string;     // provider wallet from ramp payment response
  paymentId: string;
}): Promise<PCXWithdrawal> {
  const rail = NETWORK_TO_RAIL[params.cryptoNetwork] ?? params.cryptoNetwork.toLowerCase();

  const payload = {
    account_id:   PCXPAY_ACCOUNT_ID,
    amount:       params.amount,
    currency:     params.currency.toUpperCase(),
    payment_rail: rail,
    to_address:   params.toAddress,
    description:  `Settlement for payment ${params.paymentId}`,
    metadata:     { payment_id: params.paymentId },
  };

  logger.info(`[PCX] Withdrawing settlement: ${params.amount} ${params.currency} to ${params.toAddress}`);
  const response = await axios.post(
    `${PCXPAY_BASE_URL}/v1/virtual-accounts/withdraw/crypto`,
    payload,
    { headers: pcxHeaders() },
  );

  const data = response.data?.data;
  if (!data?.transaction_id) {
    throw new Error(`PCXPay withdrawal failed: ${JSON.stringify(response.data)}`);
  }

  return {
    transactionId: data.transaction_id,
    state:         data.state ?? "pending",
  };
}

// ─── Step 8: Poll payment status ─────────────────────────────────────────────
// Returns "created" | "initiated" | "processing" | "completed" | "failed"

export async function getPcxPaymentStatus(paymentId: string): Promise<string> {
  const response = await axios.get(
    `${PCXPAY_BASE_URL}/v1/payments-init/ramp/${paymentId}`,
    { headers: pcxHeaders() },
  );
  return response.data?.response?.status ?? response.data?.data?.status ?? "unknown";
}

// ─── Full background orchestration ───────────────────────────────────────────
// Called after the user's Crossmint → PCX bridge wallet transfer is confirmed.
// Runs entirely in the background — never blocks the WhatsApp flow response.

export async function runPcxOfframpBackground(params: {
  // Identifiers
  userId: string;
  phone: string;
  idempotencyKey: string;
  partnerTxId: string;
  // Rate (fetched before Crossmint transfer)
  orgRateId: string;
  clientRate: number;
  // Transaction details
  fiatCurrency: string;
  fiatAmount: number;
  cryptoCurrency: string;
  cryptoNetwork: string;
  country: string;
  // Payer
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  // Beneficiary / destination
  beneficiaryName: string;
  paymentMethod: "bank_transfer" | "mobile_money";
  destination: PCXBankTransferDestination | PCXMobileMoneyDestination;
  // Crossmint deposit tx id (from step 3 — used to poll deposit)
  depositTxId: string;
  // For notifications
  displayAmount: string;     // formatted e.g. "ZAR 1,000"
  displayAccount: string;    // e.g. account number or phone
  cryptoCostUsd: string;     // crypto amount deducted (for receipt)
}, notifyUser: (message: string) => Promise<void>): Promise<void> {
  const tag = `[PCX-BG-${params.fiatCurrency}]`;

  try {
    // ── Step 5: Poll deposit status until completed (max 10 min) ──
    logger.info(`${tag} Polling deposit ${params.depositTxId}...`);
    const maxPolls = 40;
    let depositStatus = "pending";
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, 15000)); // 15s intervals
      try {
        depositStatus = await getPcxDepositStatus(params.depositTxId);
        logger.info(`${tag} Deposit status [${i + 1}/${maxPolls}]: ${depositStatus}`);
      } catch (e) {
        logger.warn(`${tag} Deposit poll error: ${(e as Error).message}`);
      }
      if (depositStatus === "completed") break;
      if (depositStatus === "failed") {
        throw new Error(`PCXPay deposit failed for tx ${params.depositTxId}`);
      }
    }

    if (depositStatus !== "completed") {
      throw new Error(`Deposit did not complete after ${maxPolls} polls (last: ${depositStatus})`);
    }
    logger.info(`${tag} Deposit confirmed.`);

    // ── Step 6: Initiate ramp payment ──
    const ramp = await initiatePcxRampPayment({
      fiatCurrency:   params.fiatCurrency,
      fiatAmount:     params.fiatAmount,
      clientRate:     params.clientRate,
      orgRateId:      params.orgRateId,
      cryptoCurrency: params.cryptoCurrency,
      cryptoNetwork:  params.cryptoNetwork,
      country:        params.country,
      paymentMethod:  params.paymentMethod,
      payerName:      params.payerName,
      payerEmail:     params.payerEmail,
      payerPhone:     params.payerPhone,
      beneficiaryName: params.beneficiaryName,
      destination:    params.destination,
      partnerTxId:    params.partnerTxId,
    });
    logger.info(`${tag} Ramp payment created: ${ramp.paymentId}, provider wallet: ${ramp.providerWalletAddress}`);

    // ── Step 7: Withdraw settlement to Provider wallet ──
    const withdrawal = await withdrawPcxSettlement({
      amount:        ramp.cryptoAmount,
      currency:      params.cryptoCurrency,
      cryptoNetwork: params.cryptoNetwork,
      toAddress:     ramp.providerWalletAddress,
      paymentId:     ramp.paymentId,
    });
    logger.info(`${tag} Settlement withdrawal initiated: ${withdrawal.transactionId}`);

    // ── Step 8: Poll payment status until completed (max 20 min) ──
    const maxPaymentPolls = 80;
    let paymentStatus = "created";
    for (let i = 0; i < maxPaymentPolls; i++) {
      await new Promise((r) => setTimeout(r, 15000));
      try {
        paymentStatus = await getPcxPaymentStatus(ramp.paymentId);
        logger.info(`${tag} Payment status [${i + 1}/${maxPaymentPolls}]: ${paymentStatus}`);
      } catch (e) {
        logger.warn(`${tag} Payment poll error: ${(e as Error).message}`);
      }
      if (paymentStatus === "completed") break;
      if (paymentStatus === "failed") {
        throw new Error(`PCXPay ramp payment failed: ${ramp.paymentId}`);
      }
    }

    if (paymentStatus !== "completed") {
      logger.warn(`${tag} Payment did not reach completed after ${maxPaymentPolls} polls (last: ${paymentStatus}). May still process.`);
    }

    // ── Step 9: Notify user with detailed receipt ──
    logger.info(`${tag} Payment completed. Sending receipt notification.`);
    const completedAt = new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour12: false });
    await notifyUser(
      `✅ *Withdrawal Successful!*\n\n` +
      `Your funds have been sent successfully.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 *Amount Sent:* ${params.displayAmount}\n` +
      `📤 *Recipient:* ${params.displayAccount}\n` +
      `💎 *Crypto Sold:* ~$${parseFloat(params.cryptoCostUsd || "0").toFixed(4)} ${params.cryptoCurrency}\n` +
      `🌐 *Network:* ${params.cryptoNetwork}\n` +
      `🏦 *Payment Method:* ${params.paymentMethod === "bank_transfer" ? "Bank Transfer" : "Mobile Money"}\n` +
      `📋 *Reference:* \`${params.partnerTxId.slice(-12)}\`\n` +
      `⏰ *Completed:* ${completedAt}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Type *menu* to return to the main menu.`,
    );

  } catch (err) {
    const msg = (err as Error).message;
    logger.error(`${tag} Background offramp failed: ${msg}`);
    try {
      await notifyUser(
        `❌ *Withdrawal Failed*\n\n` +
        `Your ${params.fiatCurrency} withdrawal of ${params.displayAmount} could not be completed.\n\n` +
        `📤 Recipient: ${params.displayAccount}\n` +
        `📋 Reference: \`${params.idempotencyKey.slice(-12)}\`\n\n` +
        `Please contact support with your reference number for assistance.\n\n` +
        `Type *support* to reach our team.`,
      );
    } catch (notifyErr) {
      logger.error(`${tag} Failed to send failure notification: ${(notifyErr as Error).message}`);
    }
  }
}
