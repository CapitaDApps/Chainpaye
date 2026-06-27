/**
 * Onramp Flow Service
 * Handles WhatsApp Flow screen logic for the crypto onramp (buy crypto) feature.
 *
 * Screens:
 *   BUY_CRYPTO_FORM        → collects fiatAmount, asset, chain; calls DexPay /quote
 *   RETURN_TO_CHAT         → terminal; tells user to return to chat
 *   COMPLETE_TRANSACTION_FORM → shows quote details; calls DexPay /quote/{id}
 *   TRANSACTION_RECEIVED   → terminal; confirms transaction received
 *
 * Requirements: 2.1–2.4, 3.1–3.4, 4.1–4.3, 5.1–5.3, 6.1–6.3, 7.1–7.5, 8.1–8.4, 9.1, 10.1–10.5
 */

import axios from "axios";
import { User } from "../../models/User";
import { Transaction, TransactionStatus, TransactionType } from "../../models/Transaction";
import { crossmintService } from "../../services/CrossmintService";
import { whatsappBusinessService } from "../../services";
import { redisClient } from "../../services/redis";
import { logger } from "../../utils/logger";

export interface OnrampQuoteData {
  id: string;
  fiatAmount: number;
  tokenAmount: number;
  price: number;
  fee: number;
  paymentAccount: {
    accountName: string;
    accountNumber: string;
    bankName: string;
  };
  receivingAddress: string;
  asset: string;
  chain: string;
}

const ONRAMP_QUOTE_TTL = 1800; // 30 minutes

/**
 * Map DexPay chain value to Crossmint chainType.
 * Requirements: 3.1, 3.2
 */
export function mapChainToChainType(chain: string): "evm" | "solana" {
  const upper = chain.toUpperCase();
  if (upper === "SOL") return "solana";
  return "evm"; // BSC, BASE, ARBITRUM
}

/**
 * Build the Redis key for a user's onramp quote.
 */
export function onrampQuoteKey(phone: string): string {
  return `onramp_quote:${phone}`;
}

/**
 * Format the payment details WhatsApp message.
 * Requirements: 6.1
 */
export function formatPaymentDetailsMessage(quote: OnrampQuoteData): string {
  return [
    "💳 *Crypto Purchase Details*",
    "",
    `Amount to send: ₦${quote.fiatAmount.toLocaleString()}`,
    `You will receive: ${quote.tokenAmount} ${quote.asset}`,
    `Rate: ₦${quote.price.toLocaleString()} per ${quote.asset}`,
    "",
    "🏦 *Bank Transfer Details*",
    `Bank: ${quote.paymentAccount.bankName}`,
    `Account Name: ${quote.paymentAccount.accountName}`,
    `Account Number: ${quote.paymentAccount.accountNumber}`,
    "",
    "Tap *Complete Transaction* below to confirm after sending the payment.",
  ].join("\n");
}

/**
 * Format the confirmation WhatsApp message.
 * Requirements: 9.1, 9.2
 */
export function formatConfirmationMessage(quote: OnrampQuoteData): string {
  return [
    "✅ *Transaction Received*",
    "",
    `Amount: ₦${quote.fiatAmount.toLocaleString()}`,
    `Crypto: ${quote.tokenAmount} ${quote.asset}`,
    `Chain: ${quote.chain}`,
    "",
    "Your transaction has been received and is being processed. You will be notified once your crypto arrives.",
  ].join("\n");
}

/**
 * Main flow screen handler.
 */
export async function getOnrampFlowScreen(decryptedBody: {
  screen: string;
  data: any;
  action: string;
  flow_token: string;
}): Promise<any> {
  const { screen, data, action, flow_token } = decryptedBody;

  logger.info("Onramp flow:", { action, screen, flow_token });

  // Health check
  if (action === "ping") {
    return { data: { status: "active" } };
  }

  // Client-side error
  if (data?.error) {
    logger.warn("Onramp flow client error:", data);
    return { data: { status: "Error", acknowledged: true } };
  }

  // Flow opened
  if (action === "INIT") {
    return { screen: "BUY_CRYPTO_FORM", data: {} };
  }

  if (action === "data_exchange") {
    // Resolve phone from Redis flow_token
    const userPhone = await redisClient.get(flow_token);
    if (!userPhone) {
      return {
        screen: screen || "BUY_CRYPTO_FORM",
        data: { error_message: "Session expired. Please type *buy crypto* to start again." },
      };
    }
    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    switch (screen) {
      case "BUY_CRYPTO_FORM":
        return handleBuyCryptoForm(phone, data);

      case "COMPLETE_TRANSACTION_FORM":
        return handleCompleteTransactionForm(phone, data);

      default:
        logger.warn("Unhandled onramp screen:", { screen });
        return {
          screen,
          data: { error_message: "Unexpected screen. Please restart the flow." },
        };
    }
  }

  logger.error("Unhandled onramp flow action:", { action, screen });
  throw new Error(`Unhandled action: ${action}`);
}

/**
 * Handle BUY_CRYPTO_FORM screen submission.
 * Requirements: 3.1–3.4, 4.1–4.3, 5.1–5.2, 6.1–6.2, 10.1–10.2
 */
async function handleBuyCryptoForm(phone: string, data: any): Promise<any> {
  const { fiatAmount, asset, chain } = data;

  // Validate inputs
  const parsedAmount = parseFloat(fiatAmount);
  if (!fiatAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
    return {
      screen: "BUY_CRYPTO_FORM",
      data: { error_message: "Please enter a valid NGN amount greater than 0." },
    };
  }

  if (!asset || !chain) {
    return {
      screen: "BUY_CRYPTO_FORM",
      data: { error_message: "Please select an asset and chain." },
    };
  }

  // Look up user
  const user = await User.findOne({ whatsappNumber: phone });
  if (!user) {
    return {
      screen: "BUY_CRYPTO_FORM",
      data: { error_message: "Account not found. Please create an account first." },
    };
  }

  // Resolve wallet address based on chain
  let receivingAddress: string;
  try {
    const chainType = mapChainToChainType(chain);
    const wallet = await crossmintService.getOrCreateWallet(user._id.toString(), chainType);
    receivingAddress = wallet.address;
  } catch (err: any) {
    logger.error("Onramp: wallet retrieval failed:", err.message);
    // Fire-and-forget error notification
    whatsappBusinessService
      .sendNormalMessage(
        "❌ *Wallet Error*\n\nCouldn't prepare your receiving wallet. Please try again later.",
        phone,
      )
      .catch(() => {});
    return {
      screen: "BUY_CRYPTO_FORM",
      data: { error_message: "Could not prepare your wallet. Please try again." },
    };
  }

  // Call DexPay POST /quote
  let quoteData: OnrampQuoteData;
  try {
    const dexPayBaseUrl = process.env.DEXPAY_BASE_URL || "https://sandbox-b2b.dexpay.io";
    const response = await axios.post(
      `${dexPayBaseUrl}/quote`,
      {
        fiatAmount: parsedAmount,
        asset: asset.toUpperCase(),
        chain: chain.toUpperCase(),
        type: "BUY",
        receivingAddress,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": process.env.DEXPAY_API_KEY || "",
          "X-API-SECRET": process.env.DEXPAY_API_SECRET || "",
        },
      },
    );

    const raw = response.data?.data || response.data;
    quoteData = {
      id: raw.id,
      fiatAmount: raw.fiatAmount ?? parsedAmount,
      tokenAmount: raw.tokenAmount,
      price: raw.price,
      fee: raw.fee ?? 0,
      paymentAccount: {
        accountName: raw.paymentAccount?.accountName || "",
        accountNumber: raw.paymentAccount?.accountNumber || "",
        bankName: raw.paymentAccount?.bankName || "",
      },
      receivingAddress: raw.receivingAddress || receivingAddress,
      asset: asset.toUpperCase(),
      chain: chain.toUpperCase(),
    };
  } catch (err: any) {
    logger.error("Onramp: DexPay quote failed:", err.response?.data || err.message);
    const errMsg =
      err.response?.data?.message ||
      "Could not get a quote right now. Please try again later.";
    whatsappBusinessService
      .sendNormalMessage(`❌ *Quote Error*\n\n${errMsg}`, phone)
      .catch(() => {});
    return {
      screen: "BUY_CRYPTO_FORM",
      data: { error_message: errMsg },
    };
  }

  // Store quote in Redis (TTL 1800s)
  await redisClient.set(
    onrampQuoteKey(phone),
    JSON.stringify(quoteData),
    "EX",
    ONRAMP_QUOTE_TTL,
  );

  // Fire-and-forget: send payment details message + complete transaction flow
  (async () => {
    try {
      await whatsappBusinessService.sendNormalMessage(
        formatPaymentDetailsMessage(quoteData),
        phone,
      );
      await whatsappBusinessService.sendCompleteTransactionFlow(phone, quoteData);
    } catch (notifyErr) {
      logger.error("Onramp: failed to send payment details:", notifyErr);
    }
  })();

  return { screen: "RETURN_TO_CHAT", data: {} };
}

/**
 * Handle COMPLETE_TRANSACTION_FORM screen submission.
 * Requirements: 5.3, 7.3–7.5, 8.1–8.4, 9.1, 10.3–10.4
 */
async function handleCompleteTransactionForm(phone: string, data: any): Promise<any> {
  // Retrieve quote from Redis
  const raw = await redisClient.get(onrampQuoteKey(phone));
  if (!raw) {
    return {
      screen: "COMPLETE_TRANSACTION_FORM",
      data: {
        error_message:
          "Session expired. Please type *buy crypto* to start a new transaction.",
      },
    };
  }

  let quoteData: OnrampQuoteData;
  try {
    quoteData = JSON.parse(raw);
  } catch {
    return {
      screen: "COMPLETE_TRANSACTION_FORM",
      data: { error_message: "Invalid session data. Please type *buy crypto* to start again." },
    };
  }

  // Execute quote via DexPay POST /quote/{id}
  try {
    const dexPayBaseUrl = process.env.DEXPAY_BASE_URL || "https://sandbox-b2b.dexpay.io";
    await axios.post(
      `${dexPayBaseUrl}/quote/${quoteData.id}`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": process.env.DEXPAY_API_KEY || "",
          "X-API-SECRET": process.env.DEXPAY_API_SECRET || "",
        },
      },
    );
  } catch (err: any) {
    logger.error("Onramp: finalizeQuote failed:", err.response?.data || err.message);

    if (err.response?.status === 410) {
      return {
        screen: "COMPLETE_TRANSACTION_FORM",
        data: {
          error_message:
            "This quote has expired. Please type *buy crypto* to get a new quote.",
        },
      };
    }

    const errMsg =
      err.response?.data?.message || "Could not complete the transaction. Please try again.";
    return {
      screen: "COMPLETE_TRANSACTION_FORM",
      data: { error_message: errMsg },
    };
  }

  // Fire-and-forget: save transaction + send confirmation
  (async () => {
    try {
      const user = await User.findOne({ whatsappNumber: phone });
      if (user) {
        const tx = new Transaction({
          type: TransactionType.ON_RAMP,
          fromUser: user._id,
          amount: quoteData.fiatAmount,
          currency: "NGN",
          status: TransactionStatus.PENDING,
          description: `Buy ${quoteData.tokenAmount} ${quoteData.asset} on ${quoteData.chain}`,
          toronetTransactionId: `ONRAMP_${quoteData.id}`,
          totalAmount: quoteData.fiatAmount,
        });
        await tx.save();
        logger.info(`Onramp transaction saved: ${tx.referenceId}`);
      }
    } catch (dbErr) {
      logger.error("Onramp: failed to save transaction:", dbErr);
    }

    try {
      await whatsappBusinessService.sendNormalMessage(
        formatConfirmationMessage(quoteData),
        phone,
      );
    } catch (msgErr) {
      logger.error("Onramp: failed to send confirmation:", msgErr);
    }
  })();

  return { screen: "TRANSACTION_RECEIVED", data: {} };
}
