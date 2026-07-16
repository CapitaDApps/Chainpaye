import { sendOfframpSuccessNotification } from "../../commands/handlers/offrampHandler";
import { userService } from "../../services";
import {
  CrossmintBalance,
  crossmintService,
} from "../../services/CrossmintService";
import { financialService } from "../../services/crypto-off-ramp/FinancialService";
import { dexPayService } from "../../services/DexPayService";
import {
  getPcxRate,
  registerPcxDepositIntent,
  runPcxOfframpBackground,
  NETWORK_TO_RAIL,
  type PCXBankTransferDestination,
  type PCXMobileMoneyDestination,
} from "../../services/PCXPayService";
import { resolvePaystackAccount } from "../../services/PaystackService";
import { redisClient } from "../../services/redis";
import { logger } from "../../utils/logger";
// import { Types } from "mongoose";
import { TransactionStatus } from "../../models/Transaction";

type Network = "bsc" | "sol" | "eth" | "poly" | "trx" | "base";

interface Bank {
  id: string;
  title: string;
}

interface DecryptedBody {
  screen: string;
  data: Record<string, unknown>;
  version: string;
  action: string;
  flow_token: string;
}

// Data structures expected in data object
interface OfframpData {
  currency?: string;
  network?: string;
  sell_amount?: string;
  bank_code?: string;
  account_number?: string;
  pin?: string;
  recipientName?: string;
  bank_name?: string;
  error?: string;
  [key: string]: unknown;
}

// Fallback banks in case API fails
const FALLBACK_BANKS: Bank[] = [
  { id: "000014", title: "Access Bank" },
  { id: "000013", title: "GTBank" },
  { id: "000015", title: "Zenith Bank" },
  { id: "999992", title: "Opay" },
  { id: "090267", title: "Kuda Bank" },
];

const PCXPAY_API_KEY  = process.env.PCXPAY_API_KEY  || "";
const PCXPAY_BASE_URL = "https://prod-api.pcxpay.com";
const PCXPAY_ORG_ID   = process.env.PCXPAY_ORG_ID   || "";

/**
 * Fetch mobile money networks from PCXPay for a given country code.
 * Returns an array of { id, title } suitable for WhatsApp Flow dropdowns.
 */
async function fetchPcxPayNetworks(
  countryCode: string,
): Promise<{ id: string; title: string; type: string }[]> {
  const axios = (await import("axios")).default;
  const response = await axios.post(
    `${PCXPAY_BASE_URL}/v1/externals/networks`,
    { country_code: countryCode },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": PCXPAY_API_KEY,
        Authorization: "None",
      },
    },
  );

  const networks: any[] = response.data?.networks ?? [];
  if (!networks.length) {
    throw new Error(`No networks returned for country code ${countryCode}`);
  }

  return networks.map((n: any) => ({
    id: String(n.code ?? n.id),
    title: String(n.name),
    type: String(n.type ?? ""),  // kept for server-side filtering, stripped before sending to flow
  }));
}

/**
 * Fetch the live USD → {toCurrency} exchange rate from PCXPay.
 * Returns both the rate and org_rate_id needed for transaction initiation.
 */
async function fetchPcxPayUsdRate(toCurrency: string): Promise<{ rate: number; orgRateId: string }> {
  return getPcxRate(toCurrency);
}

/**
 * Shared PCX offramp executor — used by all non-NGN AUTHORIZE handlers.
 * 1. Validates PIN and balance
 * 2. Registers deposit intent with PCX (gets bridge wallet address)
 * 3. Transfers crypto from user's Crossmint wallet → PCX bridge wallet
 * 4. Fires background orchestration (poll deposit → init ramp → withdraw → poll payment → notify)
 * Returns { screen, data } for the WhatsApp flow.
 */
async function executePcxOfframp(params: {
  screenId: string;           // e.g. "KES_BANK_AUTHORIZE" — for error returns
  tag: string;                // log prefix e.g. "[OFFRAMP-KES-BANK]"
  data: Record<string, unknown>;
  phone: string;              // user's whatsapp number (with +)
  pin: string;
  cryptoAsset: string;        // "USDC" | "USDT"
  cryptoNetwork: string;      // e.g. "BASE"
  totalCryptoUsd: string;     // total to deduct incl. fee
  fiatCurrency: string;       // e.g. "KES"
  fiatAmount: string;         // numeric string e.g. "5,000"
  clientRate: string;         // from review screen
  orgRateId: string;          // from review screen
  country: string;            // 2-letter ISO e.g. "KE"
  paymentMethod: "bank_transfer" | "mobile_money";
  beneficiaryName: string;
  destination: PCXBankTransferDestination | PCXMobileMoneyDestination;
  idempKeySuffix: string;     // unique part for idempotency key
  displayAmount: string;      // e.g. "KES 5,000"
  displayAccount: string;     // account number or phone
}): Promise<{ screen: string; data: Record<string, unknown> }> {
  const { screenId, tag, data, phone } = params;
  const err = (msg: string) => ({ screen: screenId, data: { ...data, error_message: msg, has_error: true } });

  // 1. Get user + validate PIN
  const user = await userService.getUser(phone, true);
  if (!user) return err("User not found.");
  if (!user.emailVerified || !user.email) return err("Please verify your email before making a withdrawal.");
  if (!await user.comparePin(params.pin)) return err("Invalid PIN.");

  try {
    // 2. Map network to crossmint chain
    const chainMap: Record<string, string> = {
      sol: "solana", solana: "solana", bep20: "bsc", bsc: "bsc", base: "base",
      arbitrum: "arbitrum", stellar: "stellar", erc20: "ethereum", ethereum: "ethereum",
      polygon: "polygon", optimism: "optimism", avalanche: "avalanche",
    };
    const crossmintChain = chainMap[params.cryptoNetwork.toLowerCase()];
    if (!crossmintChain) return err(`Unsupported network: ${params.cryptoNetwork}`);

    const normalizedAsset = params.cryptoAsset.toUpperCase();
    const totalRequired = parseFloat(params.totalCryptoUsd || "0");
    const chainType = crossmintService.getChainType(crossmintChain);

    // 3. Check balance
    const balances = await crossmintService.getBalancesByChain(user.userId, crossmintChain, ["usdc", "usdt"]);
    const balEntry = balances.find((b) => (b.symbol?.toLowerCase() || b.token?.toLowerCase()) === normalizedAsset.toLowerCase());
    const currentBal = balEntry ? (() => { const d = balEntry.decimals ?? 6; const r = parseFloat(balEntry.amount) || 0; return r >= Math.pow(10, d) && d > 0 ? r / Math.pow(10, d) : r; })() : 0;
    if (currentBal < totalRequired) {
      return err(`Insufficient balance. Need ${totalRequired.toFixed(4)} ${normalizedAsset}, have ${currentBal.toFixed(4)}.`);
    }

    // 4. Idempotency check
    const idempKey = `offramp:pcx:${Buffer.from(`${user.userId}:${params.idempKeySuffix}`).toString("base64")}`;
    const existingTx = await redisClient.get(idempKey);
    if (existingTx && JSON.parse(existingTx).status === "processing") {
      return err("Transaction already in progress. Please wait.");
    }
    await redisClient.set(idempKey, JSON.stringify({ status: "processing", userId: user.userId, startedAt: new Date().toISOString() }), "EX", 600);

    // 5. Get user wallet address for this chain (needed for PCX deposit intent from_address)
    const wallets = await crossmintService.getUserWallets(user.userId);
    const wallet = wallets.find((w) => w.chainType === chainType);
    if (!wallet) {
      await redisClient.del(idempKey);
      return err(`No wallet found for ${crossmintChain}. Please contact support.`);
    }

    // 6. Register PCX deposit intent — get bridge wallet address
    const partnerTxId = `${user.userId}-${Date.now()}`;
    const fiatAmountNum = parseFloat(params.fiatAmount.replace(/,/g, ""));
    const depositIntent = await registerPcxDepositIntent({
      fromAddress:    wallet.address,
      cryptoCurrency: normalizedAsset,
      cryptoNetwork:  params.cryptoNetwork,
      amount:         totalRequired,
      partnerTxId,
      fiatAmount:     fiatAmountNum,
    });
    logger.info(`${tag} Deposit intent registered: txId=${depositIntent.transactionId}, bridge=${depositIntent.toAddress}`);

    // 7. Transfer crypto from user wallet → PCX bridge wallet
    const decimals = crossmintChain === "stellar" ? 7 : 6;
    const transferResult = await crossmintService.transferTokens({
      walletAddress: wallet.address,
      token:         `${crossmintChain}:${normalizedAsset.toLowerCase()}`,
      recipient:     depositIntent.toAddress,
      amount:        totalRequired.toFixed(decimals),
      idempotencyKey: `pcx-transfer-${user.userId}-${Date.now()}`,
    });

    if (!transferResult.success) {
      await redisClient.del(idempKey);
      return err(`Transfer failed: ${transferResult.error || "Please try again."}`);
    }

    await redisClient.set(idempKey, JSON.stringify({
      status: "transfer_completed",
      userId: user.userId,
      transferId: transferResult.transactionId,
      depositTxId: depositIntent.transactionId,
      completedAt: new Date().toISOString(),
    }), "EX", 3600);

    logger.info(`${tag} Crypto transferred to PCX bridge. Starting background orchestration.`);

    // 8. Fire background orchestration (non-blocking)
    const { whatsappBusinessService } = await import("../../services");

    // Send "processing" message immediately so user knows what's happening
    await whatsappBusinessService.sendNormalMessage(
      `⏳ *Transaction Processing*\n\n` +
      `Your withdrawal of *${params.displayAmount}* is being processed.\n\n` +
      `🔄 Crypto has been transferred. Fiat payout is underway and will typically complete within *120 seconds*.\n\n` +
      `You will receive a confirmation message once funds are sent to *${params.displayAccount}*.\n\n` +
      `Reference: \`${partnerTxId.slice(-12)}\``,
      phone,
    );

    runPcxOfframpBackground({
      userId:          user.userId,
      phone,
      idempotencyKey:  idempKey,
      partnerTxId,
      orgRateId:       params.orgRateId,
      clientRate:      parseFloat(params.clientRate),
      fiatCurrency:    params.fiatCurrency,
      fiatAmount:      fiatAmountNum,
      cryptoCurrency:  normalizedAsset,
      cryptoNetwork:   params.cryptoNetwork,
      country:         params.country,
      payerName:       user.fullName,
      payerEmail:      user.email!,
      payerPhone:      phone,
      beneficiaryName: params.beneficiaryName,
      paymentMethod:   params.paymentMethod,
      destination:     params.destination,
      depositTxId:     depositIntent.transactionId,
      displayAmount:   params.displayAmount,
      displayAccount:  params.displayAccount,
      cryptoCostUsd:   params.totalCryptoUsd,
    }, (msg) => whatsappBusinessService.sendNormalMessage(msg, phone)).catch((e) =>
      logger.error(`${tag} Background error: ${(e as Error).message}`)
    );

    return { screen: "OFFRAMP_SUCCESS", data: {} };
  } catch (e: any) {
    logger.error(`${tag} Error: ${e.message}`);
    return err(e.message || "Transaction failed. Please try again.");
  }
}

/**
 * Process DexPay quote and completion in background after transfer succeeds
 * This allows us to return success screen immediately without waiting
 */
export async function processOfframpInBackground(
  userId: string,
  phone: string,
  ngnAmount: number,
  normalizedAsset: string,
  dexPayChain: string,
  bank_code: string,
  finalRecipientName: string,
  account_number: string,
  currency: string,
  bank_name: string,
  totalInUsd: number,
  idempotencyKey?: string,
): Promise<void> {
  try {
    // Import DexPayService inside the function to avoid circular dependencies
    const { DexPayService } = await import("../../services/DexPayService");
    const dexPayService = new DexPayService();
    
    // Wait for crypto transaction to settle
    logger.info("[OFFRAMP-BG] Waiting 20s for crypto settlement...");
    console.log("\n⏳ [Background] Waiting 20 seconds for crypto transaction to settle...\n");
    await new Promise((resolve) => setTimeout(resolve, 20000));

    // Get quote from DexPay
    console.log("\n========================================");
    console.log("📊 [Background] GETTING DEXPAY QUOTE");
    console.log("========================================");

    const quoteRequest = {
      fiatAmount: ngnAmount,
      asset: normalizedAsset.toUpperCase(),
      chain: dexPayService.mapChainForDexPay(dexPayChain),
      type: "SELL" as const,
      bankCode: bank_code,
      accountName: finalRecipientName || "Beneficiary",
      accountNumber: account_number,
      // Note: receivingAddress not needed for SELL transactions (offramp)
      // DexPay sends fiat to bank account, not crypto to wallet
    };

    console.log("Quote Request:");
    console.log(JSON.stringify(quoteRequest, null, 2));
    console.log("========================================\n");

    logger.info(
      "[OFFRAMP-BG] Quote request: " + JSON.stringify(quoteRequest, null, 2),
    );

    const quote = await dexPayService.getQuote(quoteRequest);
    logger.info(
      "[OFFRAMP-BG] Quote received: " + JSON.stringify(quote, null, 2),
    );

    console.log("\n✅ [Background] Quote received:");
    console.log(JSON.stringify(quote, null, 2));

    // @ts-ignore - handling dynamic response structure
    const quoteId = quote.id || (quote.data && quote.data.id);
    console.log(`Quote ID: ${quoteId}\n`);

    if (!quoteId) {
      throw new Error("Invalid quote response: missing ID");
    }

    // Complete offramp
    console.log("\n========================================");
    console.log("💸 [Background] COMPLETING OFFRAMP");
    console.log("========================================");
    console.log(`Quote ID: ${quoteId}`);
    console.log("========================================\n");

    logger.info(`[OFFRAMP-BG] Completing offramp for quote ${quoteId}...`);

    const offrampResult = await dexPayService.completeOfframp(quoteId);
    logger.info(
      "[OFFRAMP-BG] Offramp completed: " +
        JSON.stringify(offrampResult, null, 2),
    );

    console.log("\n✅ [Background] OFFRAMP COMPLETED:");
    console.log(JSON.stringify(offrampResult, null, 2));
    console.log("========================================\n");

    // Update transaction status to completed in database
    try {
      const { TransactionService } = await import("../../services/TransactionService");
      
      // Get transaction reference ID from Redis using the exact idempotency key
      if (idempotencyKey) {
        const transactionRef = await redisClient.get(`${idempotencyKey}:txn_ref`);
        if (transactionRef) {
          await TransactionService.completeOfframpTransaction(transactionRef, quoteId);
          logger.info(`[OFFRAMP-BG] Transaction status updated to completed: ${transactionRef}`);
        } else {
          logger.warn(`[OFFRAMP-BG] No transaction ref found in Redis for key: ${idempotencyKey}:txn_ref`);
        }
      }
    } catch (dbError) {
      logger.error(`[OFFRAMP-BG] Failed to update transaction status: ${(dbError as Error).message}`);
      // Don't fail the process if database update fails
    }

    // Update idempotency record to mark as completed
    if (idempotencyKey) {
      await redisClient.set(
        idempotencyKey,
        JSON.stringify({
          status: 'completed',
          userId: userId,
          amount: totalInUsd,
          asset: normalizedAsset,
          quoteId: quoteId,
          completedAt: new Date().toISOString(),
        }),
        'EX',
        300 // Keep for 5 minutes to prevent immediate duplicates
      );
      logger.info(`[OFFRAMP-BG] Transaction marked as completed: ${idempotencyKey}`);
    }

    // Send success notification
    await sendOfframpSuccessNotification(
      phone,
      ngnAmount,
      totalInUsd,
      currency || "UNKNOWN",
      bank_name || "UNKNOWN",
      finalRecipientName,
      quoteId,
    );

    // Send offramp receipt
    try {
      const { sendOfframpReceiptAsync } = await import("../../utils/sendOfframpReceipt");
      const { getCountryFromPhoneNumber } = await import("../../utils/countryCodeMapping");
      
      // Calculate fees (flat fee from env)
      const flatFeeUsd = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
      const userCountry = getCountryFromPhoneNumber(phone);
      
      sendOfframpReceiptAsync(phone, {
        ngnAmount: ngnAmount,
        cryptoSpentUsd: totalInUsd,
        fees: flatFeeUsd,
        bankName: bank_name || "Bank",
        accountName: finalRecipientName,
        accountNumber: account_number,
        transactionDate: new Date(),
        transactionReference: quoteId,
        status: "Successful",
        asset: currency || "USDC", // Asset used (USDC/USDT)
        chain: dexPayChain.charAt(0).toUpperCase() + dexPayChain.slice(1), // Capitalize chain name
        ...(userCountry?.code && { countryCode: userCountry.code }),
      });
      
      logger.info(`[OFFRAMP-BG] Receipt generation initiated for ${phone}`);
    } catch (receiptError) {
      logger.error(
        `[OFFRAMP-BG] Warning: Failed to send receipt: ${(receiptError as Error).message}`,
      );
      // Don't fail the transaction if receipt sending fails
    }

    // Process referral earnings (if applicable)
    try {
      const { handleOfframpTransaction } = await import("../controllers/referral.controller");
      
      // Calculate USD amount from NGN using the exchange rate
      // We need to get the exchange rate that was used for this transaction
      const rateData = await dexPayService.getCurrentRates(
        normalizedAsset,
        dexPayChain,
      );
      const exchangeRate = rateData.rate;
      const sellAmountUsd = ngnAmount / exchangeRate;
      
      await handleOfframpTransaction({
        id: quoteId,
        userId: userId,
        amount: totalInUsd,
        sellAmountUsd: sellAmountUsd,
        timestamp: new Date(),
      });
      logger.info(`[OFFRAMP-BG] Referral earnings processed for transaction ${quoteId}`);
    } catch (referralError) {
      logger.error(
        `[OFFRAMP-BG] Warning: Failed to process referral earnings for transaction ${quoteId}: ${(referralError as Error).message}`,
      );
      // Don't fail the transaction if referral processing fails
    }

    logger.info("[OFFRAMP-BG] Background processing completed successfully!");
  } catch (error) {
    logger.error(
      "[OFFRAMP-BG] Background processing failed: " +
        (error as Error).message,
    );
    console.log("\n❌ [Background] Processing failed:");
    console.log((error as Error).message);
    console.log("========================================\n");
    
    // Mark transaction as failed in database
    try {
      const { TransactionService } = await import("../../services/TransactionService");
      
      // Get transaction reference ID from Redis
      const txnRefKey = `offramp-${userId}-*:txn_ref`;
      const keys = await redisClient.keys(txnRefKey);
      
      if (keys.length > 0) {
        // @ts-ignore - Redis get method returns string | null, but we handle null check below
        const transactionRef = await redisClient.get(keys[0]);
        if (transactionRef !== null) {
          await TransactionService.updateOfframpStatus({
            referenceId: transactionRef,
            status: TransactionStatus.FAILED,
            failureReason: (error as Error).message,
          });
          logger.info(`[OFFRAMP-BG] Transaction status updated to failed: ${transactionRef}`);
        }
      }
    } catch (dbError) {
      logger.error(`[OFFRAMP-BG] Failed to update transaction status: ${(dbError as Error).message}`);
    }
    
    // Mark transaction as failed in idempotency record
    if (idempotencyKey) {
      await redisClient.set(
        idempotencyKey,
        JSON.stringify({
          status: 'failed',
          userId: userId,
          error: (error as Error).message,
          failedAt: new Date().toISOString(),
        }),
        'EX',
        300 // Keep for 5 minutes
      );
    }
    
    // TODO: Send notification to user about failure
    // Could send a WhatsApp message or email notification
  }
}

export const getCryptoTopUpScreen = async (decryptedBody: DecryptedBody) => {
  const { screen, data: rawData, action, flow_token } = decryptedBody;
  const data = rawData as OfframpData;

  // handle health check request
  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  // handle error notification
  if (data?.error) {
    logger.warn("Received client error: " + JSON.stringify(data));
    return {
      data: {
        status: "Error",
        acknowledged: true,
      },
    };
  }

  const userPhone = await redisClient.get(flow_token);
  const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;

  // handle initial request when opening the flow
  if (action === "INIT") {
    // Always open at the currency selection screen
    return {
      screen: "SELECT_CURRENCY",
      data: {
        has_error: false,
        error_message: "",
      },
    };
  }

  if (action === "data_exchange") {
    if (!userPhone) {
      return {
        screen: "SELECT_CURRENCY",
        data: {
          has_error: true,
          error_message: "Session expired. Please restart the flow.",
        },
      };
    }

    // handle the request based on the current screen
    switch (screen) {
      case "SELECT_CURRENCY": {
        const { payout_country } = data as { payout_country?: string };

        if (!payout_country) {
          return {
            screen: "SELECT_CURRENCY",
            data: {
              has_error: true,
              error_message: "Please select a payout country.",
            },
          };
        }

        // Map currency codes to display names
        const countryNames: Record<string, string> = {
          NGN: "Nigeria",
          KES: "Kenya",
          ZAR: "South Africa",
          RWF: "Rwanda",
          UGX: "Uganda",
          MWK: "Malawi",
          TZS: "Tanzania",
        };

        // NGN — fully supported via DexPay
        if (payout_country === "NGN") {
          // Fetch Nigerian banks and proceed to the offramp details screen
          let banks = FALLBACK_BANKS;
          try {
            const dexPayBanks = await dexPayService.getBanks();
            if (dexPayBanks && dexPayBanks.length > 0) {
              banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
            }
            logger.info("[OFFRAMP] Fetched NGN banks: " + banks.length);
          } catch (error) {
            logger.error(
              "[OFFRAMP] Error fetching banks, using fallback: " +
                (error as Error).message,
            );
          }

          // Check for prefilled data from image payment flow
          const imagePaymentKey = `offramp:image_payment:${phone}`;
          const imagePaymentData = await redisClient.get(imagePaymentKey);

          let responseData: any = { banks, hasPrefillData: false };

          if (imagePaymentData) {
            try {
              const prefillData = JSON.parse(imagePaymentData);

              const matchedBank = banks.find(
                (b) =>
                  b.id === prefillData.bankCode ||
                  b.title.toLowerCase().includes(prefillData.bankName.toLowerCase()) ||
                  prefillData.bankName.toLowerCase().includes(b.title.toLowerCase()),
              );
              const matchedBankCode = matchedBank ? matchedBank.id : prefillData.bankCode;

              responseData = {
                banks,
                prefilledAmount: prefillData.amount.toString(),
                prefilledBankCode: matchedBankCode,
                prefilledBankName: matchedBank ? matchedBank.title : prefillData.bankName,
                prefilledAccountNumber: prefillData.accountNumber,
                hasPrefillData: true,
              };

              logger.info(
                `[OFFRAMP] Prefilled from image payment: amount=${prefillData.amount}, bank=${responseData.prefilledBankName}, account=${prefillData.accountNumber}`,
              );

              await redisClient.del(imagePaymentKey);
            } catch (error) {
              logger.error(
                "[OFFRAMP] Error parsing image payment prefill data: " +
                  (error as Error).message,
              );
            }
          }

          return {
            screen: "OFFRAMP_DETAILS",
            data: responseData,
          };
        }

        // RWF — Rwanda via PCXPay mobile money
        if (payout_country === "RWF") {
          let networks: { id: string; title: string }[] = [];
          try {
            networks = (await fetchPcxPayNetworks("RW")).map((n) => ({ id: n.id, title: n.title }));
            logger.info(`[OFFRAMP-RWF] Fetched ${networks.length} networks from PCXPay`);
          } catch (error) {
            logger.error("[OFFRAMP-RWF] Failed to fetch networks: " + (error as Error).message);
            return {
              screen: "SELECT_CURRENCY",
              data: {
                has_error: true,
                error_message: "Could not load Rwanda networks. Please try again.",
              },
            };
          }

          return {
            screen: "RWF_DETAILS",
            data: {
              networks,
              has_error: false,
              error_message: "",
            },
          };
        }

        // KES — Kenya: has both bank and momo — route to payment method selector
        if (payout_country === "KES") {
          return {
            screen: "SELECT_PAYMENT_METHOD",
            data: {
              payout_country: "KES",
              country_label: "Kenya 🇰🇪",
              currency_code: "KES",
              has_error: false,
              error_message: "",
            },
          };
        }

        // TZS — Tanzania: has both bank and momo — route to payment method selector
        if (payout_country === "TZS") {
          return {
            screen: "SELECT_PAYMENT_METHOD",
            data: {
              payout_country: "TZS",
              country_label: "Tanzania 🇹🇿",
              currency_code: "TZS",
              has_error: false,
              error_message: "",
            },
          };
        }

        // MWK — Malawi: mobile money only — fetch networks and go straight to details
        if (payout_country === "MWK") {
          let networks: { id: string; title: string }[] = [];
          try {
            const raw = await fetchPcxPayNetworks("MW");
            networks = raw.filter((n) => n.id !== undefined).map((n) => ({ id: n.id, title: n.title }));
            logger.info(`[OFFRAMP-MWK] Fetched ${networks.length} networks from PCXPay`);
          } catch (error) {
            logger.error("[OFFRAMP-MWK] Failed to fetch networks: " + (error as Error).message);
            return {
              screen: "SELECT_CURRENCY",
              data: { has_error: true, error_message: "Could not load Malawi networks. Please try again." },
            };
          }
          return {
            screen: "MWK_DETAILS",
            data: { networks, has_error: false, error_message: "" },
          };
        }

        // UGX — Uganda: mobile money only — fetch networks and go straight to details
        if (payout_country === "UGX") {
          let networks: { id: string; title: string }[] = [];
          try {
            const raw = await fetchPcxPayNetworks("UG");
            networks = raw.filter((n) => n.id !== undefined).map((n) => ({ id: n.id, title: n.title }));
            logger.info(`[OFFRAMP-UGX] Fetched ${networks.length} networks from PCXPay`);
          } catch (error) {
            logger.error("[OFFRAMP-UGX] Failed to fetch networks: " + (error as Error).message);
            return {
              screen: "SELECT_CURRENCY",
              data: { has_error: true, error_message: "Could not load Uganda networks. Please try again." },
            };
          }
          return {
            screen: "UGX_DETAILS",
            data: { networks, has_error: false, error_message: "" },
          };
        }

        // ZAR — South Africa via PCXPay bank transfer
        if (payout_country === "ZAR") {          let banks: { id: string; title: string }[] = [];
          try {
            const rawBanks = await fetchPcxPayNetworks("ZA");
            // Deduplicate by id — WhatsApp Flow rejects dropdowns with duplicate IDs
            const seen = new Set<string>();
            banks = rawBanks
              .filter((b) => { if (seen.has(b.id)) return false; seen.add(b.id); return true; })
              .map((b) => ({ id: b.id, title: b.title }));
            logger.info(`[OFFRAMP-ZAR] Fetched ${rawBanks.length} banks from PCXPay, ${banks.length} unique after dedup`);
          } catch (error) {
            logger.error("[OFFRAMP-ZAR] Failed to fetch banks: " + (error as Error).message);
            return {
              screen: "SELECT_CURRENCY",
              data: {
                has_error: true,
                error_message: "Could not load South Africa banks. Please try again.",
              },
            };
          }

          return {
            screen: "ZAR_DETAILS",
            data: {
              banks,
              has_error: false,
              error_message: "",
            },
          };
        }

        // All other currencies — show coming soon screen
        const countryName = countryNames[payout_country] || payout_country;
        logger.info(`[OFFRAMP] ${countryName} (${payout_country}) selected — routing to COMING_SOON`);

        return {
          screen: "COMING_SOON",
          data: {
            country_name: countryName,
            currency_code: payout_country,
          },
        };
      }
      case "OFFRAMP_DETAILS": {
        const { currency, network, sell_amount, bank_code, account_number } =
          data;

        // Basic validation
        if (
          !currency ||
          !network ||
          !sell_amount ||
          !bank_code ||
          !account_number
        ) {
          logger.error("Missing required fields " + JSON.stringify(data));
          // Fetch banks for error return
          let banks = FALLBACK_BANKS;
          try {
            const dexPayBanks = await dexPayService.getBanks();
            if (dexPayBanks && dexPayBanks.length > 0) {
              banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
            }
          } catch {
            // Use fallback
          }
          return {
            screen: "OFFRAMP_DETAILS",
            data: {
              banks: banks,
              error_message: "Please fill in all required fields.",
            },
          };
        }

        // Validate account number (10 digits for Nigerian banks)
        if (account_number.length !== 10 || isNaN(Number(account_number))) {
          let banks = FALLBACK_BANKS;
          try {
            const dexPayBanks = await dexPayService.getBanks();
            if (dexPayBanks && dexPayBanks.length > 0) {
              banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
            }
          } catch {
            // Use fallback
          }
          return {
            screen: "OFFRAMP_DETAILS",
            data: {
              banks: banks,
              error_message: "Account number must be exactly 10 digits.",
            },
          };
        }

        // Validate minimum offramp amount (configurable via env)
        const minOfframpAmount = parseFloat(process.env.OFFRAMP_MIN_AMOUNT_NGN || "5000");
        const maxOfframpAmount = parseFloat(process.env.OFFRAMP_MAX_AMOUNT_NGN || "10000000");
        const sellAmountNum = parseFloat(sell_amount);
        
        if (sellAmountNum < minOfframpAmount) {
          let banks = FALLBACK_BANKS;
          try {
            const dexPayBanks = await dexPayService.getBanks();
            if (dexPayBanks && dexPayBanks.length > 0) {
              banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
            }
          } catch {
            // Use fallback
          }
          return {
            screen: "OFFRAMP_DETAILS",
            data: {
              banks: banks,
              error_message: `Minimum offramp amount is ₦${minOfframpAmount.toLocaleString()}. Please enter a higher amount.`,
            },
          };
        }
        
        if (sellAmountNum > maxOfframpAmount) {
          let banks = FALLBACK_BANKS;
          try {
            const dexPayBanks = await dexPayService.getBanks();
            if (dexPayBanks && dexPayBanks.length > 0) {
              banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
            }
          } catch {
            // Use fallback
          }
          return {
            screen: "OFFRAMP_DETAILS",
            data: {
              banks: banks,
              error_message: `Maximum offramp amount is ₦${maxOfframpAmount.toLocaleString()}. Please enter a lower amount.`,
            },
          };
        }

        // Resolve bank name from bank code
        let bankName = "Bank";
        try {
          const dexPayBanks = await dexPayService.getBanks();
          const foundBank = dexPayBanks.find((b) => b.code === bank_code);
          if (foundBank) {
            bankName = foundBank.name;
          }
        } catch (error) {
          logger.error(
            "DEBUG: Error resolving bank name: " + (error as Error).message,
          );
        }

        // Resolve recipient name from account number
        let recipientName = "Account Holder";
        try {
          const resolvedAccount = await dexPayService.resolveAccount(
            account_number,
            bank_code,
          );
          if (resolvedAccount && resolvedAccount.accountName) {
            recipientName = resolvedAccount.accountName;
          }
        } catch (error) {
          logger.error(
            "DEBUG: Error resolving account name: " + (error as Error).message,
          );
          let banks = FALLBACK_BANKS;
          try {
            const dexPayBanks = await dexPayService.getBanks();
            if (dexPayBanks && dexPayBanks.length > 0) {
              banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
            }
          } catch {
            // Use fallback
          }

          const errorMsg = (error as Error).message?.includes("not found")
            ? "Account not found. Please check details."
            : "Could not verify account details.";

          return {
            screen: "OFFRAMP_DETAILS",
            data: {
              banks: banks,
              error_message: errorMsg,
            },
          };
        }

        // Get current exchange rate for display
        // Map network to DexPay chain format
        const chainMapping: Record<string, string> = {
          sol: "solana",
          bsc: "bep20",
          base: "base",
          arbitrum: "arbitrum",
          stellar: "stellar",
          // Aliases
          bep20: "bep20",
          solana: "solana",
        };

        const dexPayChain = chainMapping[network.toLowerCase()];

        if (!dexPayChain) {
          let banks = FALLBACK_BANKS;
          try {
            const dexPayBanks = await dexPayService.getBanks();
            if (dexPayBanks && dexPayBanks.length > 0) {
              banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
            }
          } catch {
            // Use fallback
          }
          return {
            screen: "OFFRAMP_DETAILS",
            data: {
              banks: banks,
              error_message: `Unsupported network: ${network}. Supported: BSC, SOL, BASE, ARBITRUM, STELLAR`,
            },
          };
        }

        // Validate Asset + Chain Combinations
        const normalizedAsset = currency.toUpperCase();
        const chainKey = network.toLowerCase();
        let isSupportedCombination = false;

        if (normalizedAsset === "USDC") {
          // USDC supported on all chains including Stellar
          if (["sol", "bsc", "base", "arbitrum", "bep20", "stellar"].includes(chainKey)) {
            isSupportedCombination = true;
          }
        } else if (normalizedAsset === "USDT") {
          // USDT only supported on BSC and SOL (not Stellar)
          if (["sol", "bsc", "bep20"].includes(chainKey)) {
            isSupportedCombination = true;
          }
        }

        if (!isSupportedCombination) {
          let banks = FALLBACK_BANKS;
          try {
            const dexPayBanks = await dexPayService.getBanks();
            if (dexPayBanks && dexPayBanks.length > 0) {
              banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
            }
          } catch {
            // Use fallback
          }
          return {
            screen: "OFFRAMP_DETAILS",
            data: {
              banks: banks,
              error_message: `${normalizedAsset} is not supported on ${network}. Supported: BSC (USDC/USDT), SOL (USDC/USDT), BASE (USDC), ARBITRUM (USDC), STELLAR (USDC)`,
            },
          };
        }

        const ngnAmount = parseFloat(sell_amount) || 1000;
        let rateDisplay = "Current market rate"; // Fallback
        let sellAmountUsd = "0.00"; // Amount in USD (excluding fees)

        // For Stellar: rate fetch uses USDT on BSC since that's what DexPay will quote
        const isStellarPreview = dexPayChain === "stellar";
        const rateQueryAsset = isStellarPreview ? "USDT" : currency;
        const rateQueryChain = isStellarPreview ? "bep20" : dexPayChain;

        try {
          const rateData = await dexPayService.getCurrentRates(
            rateQueryAsset,
            rateQueryChain,
          );
          if (rateData && rateData.rate > 0) {
            // Apply spread to the rate (user sees worse rate) - configurable via env
            const spreadNgn = parseFloat(process.env.OFFRAMP_SPREAD_NGN || "60");
            const spreadRate = rateData.rate - spreadNgn;
            
            // Calculate USD amount (excluding fees) using spread rate
            const usdAmount = ngnAmount / spreadRate;
            sellAmountUsd = usdAmount.toFixed(6).replace(/\.?0+$/, ''); // Remove trailing zeros
            
            // Ensure at least 2 decimal places
            if (!sellAmountUsd.includes('.')) {
              sellAmountUsd += '.00';
            } else {
              const decimalPart = sellAmountUsd.split('.')[1];
              if (decimalPart && decimalPart.length === 1) {
                sellAmountUsd += '0';
              }
            }
            
            // Format rate with comma separators and Naira symbol
            rateDisplay = `₦${spreadRate.toLocaleString("en-NG", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}`;
            logger.info(
              `Fetched rate for ${currency} on ${dexPayChain}: Original ${rateData.rate}, Spread rate shown: ${spreadRate}, USD amount: ${sellAmountUsd}`,
            );
          }
        } catch (error) {
          // Log error but continue - rate will show fallback text
          logger.error(
            "DEBUG: Error fetching current rate: " + (error as Error).message,
          );
          // TODO! Rate fetching failed - consider if we should block the flow or continue with fallback
        }

        // Format amount to receive with comma separators
        const amountToReceive = parseFloat(sell_amount).toLocaleString("en-NG", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        });

        return {
          screen: "OFFRAMP_FIAT_REVIEW",
          data: {
            currency,
            network,
            sell_amount, // Original NGN amount
            sell_amount_usd: sellAmountUsd, // USD amount (excluding fees)
            amount_to_receive: amountToReceive, // Formatted NGN amount
            bank_name: bankName,
            bank_code,
            account_number,
            recipient_name: recipientName,
            recipientName: recipientName, // Store for next step
            rate: rateDisplay, // Dynamic rate from DexPay API with spread
          },
        };
      }

      case "OFFRAMP_FIAT_REVIEW": {
        // Calculate fees before showing crypto review screen
        const { sell_amount, currency, network } = data;
        const sell_amount_usd = data.sell_amount_usd as string | undefined;
        const amount_to_receive = data.amount_to_receive as string | undefined;
        
        // Validate required fields
        if (!sell_amount || !currency || !network) {
          logger.error("[OFFRAMP] Missing required fields for fee calculation");
          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              ...data,
              sell_amount_usd: sell_amount_usd || "0.00",
              amount_to_receive: amount_to_receive || sell_amount,
              total_amount_usd: "0.75",
            },
          };
        }
        
        try {
          // Calculate total amount (selling + fee)
          const sellAmountUsdNum = parseFloat(sell_amount_usd || "0");
          const flatFeeUsd = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
          const totalAmountUsdNum = sellAmountUsdNum + flatFeeUsd; // Add flat fee from env
          
          // Format total amount
          let totalAmountUsd = totalAmountUsdNum.toFixed(6).replace(/\.?0+$/, ''); // Remove trailing zeros
          
          // Ensure at least 2 decimal places
          if (!totalAmountUsd.includes('.')) {
            totalAmountUsd += '.00';
          } else {
            const decimalPart = totalAmountUsd.split('.')[1];
            if (decimalPart && decimalPart.length === 1) {
              totalAmountUsd += '0';
            }
          }
          
          logger.info(`[OFFRAMP] Total amount calculated: Selling ${sell_amount_usd} + Fee ${flatFeeUsd} = Total ${totalAmountUsd} USD`);
          
          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              ...data,
              sell_amount_usd: sell_amount_usd || "0.00",
              amount_to_receive: amount_to_receive || sell_amount,
              total_amount_usd: totalAmountUsd,
              has_error: false,
            },
          };
        } catch (error) {
          logger.error("[OFFRAMP] Error calculating total amount: " + (error as Error).message);
          // Fallback to showing screen with calculated values
          const sellAmountUsdNum = parseFloat(sell_amount_usd || "0");
          const flatFeeUsd = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
          const totalAmountUsdNum = sellAmountUsdNum + flatFeeUsd;
          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              ...data,
              sell_amount_usd: sell_amount_usd || "0.00",
              amount_to_receive: amount_to_receive || sell_amount,
              total_amount_usd: totalAmountUsdNum.toFixed(2),
              has_error: false,
            },
          };
        }
      }

      // Fixed OFFRAMP_CRYPTO_REVIEW logic

      case "OFFRAMP_CRYPTO_REVIEW": {
        const {
          pin,
          sell_amount,
          currency,
          network,
          bank_name,
          bank_code,
          account_number,
          recipientName,
        } = data;

        // ============================================================
        // STEP 0: VALIDATE INPUT DATA
        // ============================================================
        if (
          !currency ||
          !network ||
          !sell_amount ||
          !pin ||
          !bank_code ||
          !account_number
        ) {
          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              ...data,
              error_message: "Missing required transaction details.",
              has_error: true,
            },
          };
        }

        // ============================================================
        // STEP 1: VALIDATE PIN
        // ============================================================
        const user = await userService.getUser(phone, true);
        if (!user) {
          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              ...data,
              error_message: "User not found.",
              has_error: true,
            },
          };
        }

        const validPin = await user.comparePin(pin);
        if (!validPin) {
          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              ...data,
              error_message: "Invalid PIN",
              has_error: true,
            },
          };
        }

        logger.info("[OFFRAMP] PIN validated successfully");

        try {
          // ============================================================
          // STEP 2: NORMALIZE CHAIN NAMES
          // ============================================================
          const chainMapping: Record<
            string,
            { dexPay: string; crossmint: string }
          > = {
            sol: { dexPay: "solana", crossmint: "solana" },
            solana: { dexPay: "solana", crossmint: "solana" },
            bsc: { dexPay: "bep20", crossmint: "bsc" },
            bep20: { dexPay: "bep20", crossmint: "bsc" },
            base: { dexPay: "base", crossmint: "base" },
            arbitrum: { dexPay: "arbitrum", crossmint: "arbitrum" },
            stellar: { dexPay: "stellar", crossmint: "stellar" },
          };

          const normalizedChain = chainMapping[network.toLowerCase()];
          if (!normalizedChain) {
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `Unsupported network: ${network}. Supported: BEP20, SOL, BASE, ARBITRUM, STELLAR`,
                has_error: true,
              },
            };
          }

          // Validate Asset + Chain Combinations
          const normalizedAsset = currency.toUpperCase();
          const chainKey = network.toLowerCase();

          let isSupportedCombination = false;

          if (normalizedAsset === "USDC") {
            // USDC supported on all chains including Stellar
            if (
              ["sol", "solana", "bsc", "bep20", "base", "arbitrum", "stellar"].includes(chainKey)
            ) {
              isSupportedCombination = true;
            }
          } else if (normalizedAsset === "USDT") {
            // USDT supported on BEP20, SOL, and ARBITRUM (not Stellar)
            if (["sol", "solana", "bsc", "bep20", "arbitrum"].includes(chainKey)) {
              isSupportedCombination = true;
            }
          }

          if (!isSupportedCombination) {
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `${normalizedAsset} is not supported on ${network}. Supported: BEP20 (USDC/USDT), SOL (USDC/USDT), BASE (USDC), ARBITRUM (USDC/USDT), STELLAR (USDC)`,
                has_error: true,
              },
            };
          }

          const dexPayChain = normalizedChain.dexPay;
          const crossmintChain = normalizedChain.crossmint;

          // For Stellar: USDC is received on Stellar, but DexPay quote uses USDT on BSC
          const isStellar = crossmintChain === "stellar";
          const dexPayQuoteChain = isStellar ? "bep20" : dexPayChain;
          const dexPayQuoteAsset = isStellar ? "USDT" : normalizedAsset;

          // ============================================================
          // CONSOLE LOG: CHAIN MAPPING
          // ============================================================
          console.log("\n========================================");
          console.log("🔗 CHAIN MAPPING");
          console.log("========================================");
          console.log(`📥 User selected network: ${network}`);
          console.log(`📥 User selected currency: ${currency}`);
          console.log(`\n🔄 Normalized values:`);
          console.log(`   DexPay chain: ${dexPayChain}`);
          console.log(`   Crossmint chain: ${crossmintChain}`);
          console.log(`   Asset: ${normalizedAsset}`);
          console.log(`\n🎯 Token identifier will be: ${crossmintChain}:${normalizedAsset.toLowerCase()}`);
          console.log("========================================\n");

          // ============================================================
          // STEP 3: LOG MAPPING
          // ============================================================
          logger.info(
            `[OFFRAMP] Chain mapping: ${network} -> DexPay: ${dexPayChain}, Crossmint: ${crossmintChain}`,
          );

          // ============================================================
          // STEP 4: GET CURRENT EXCHANGE RATE
          // ============================================================
          const ngnAmount = parseFloat(sell_amount);
          let nairaRate: number;

          try {
            const rateData = await dexPayService.getCurrentRates(
              isStellar ? dexPayQuoteAsset : currency,
              dexPayQuoteChain,
            );

            nairaRate = rateData.rate;
            logger.info(
              `[OFFRAMP] Current rate: 1 ${currency} = ₦${nairaRate}`,
            );

            // Validate rate is not zero
            if (!nairaRate || nairaRate <= 0) {
              logger.error(`[OFFRAMP] Invalid rate received: ${nairaRate}`);
              return {
                screen: "OFFRAMP_CRYPTO_REVIEW",
                data: {
                  ...data,
                  error_message:
                    "Exchange rate unavailable. Please try again later.",
                  has_error: true,
                },
              };
            }
          } catch (rateError) {
            logger.error(
              "[OFFRAMP] Failed to fetch exchange rate: " +
                (rateError as Error).message,
            );
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message:
                  "Could not fetch current exchange rate. Please try again.",
                has_error: true,
              },
            };
          }

          // ============================================================
          // STEP 5: CALCULATE TRANSFER AMOUNT USING FINANCIAL SERVICE
          // This calculates: chainpayeFee, dexpayFee, totalFees, totalInUsd
          // ============================================================
          const financials = financialService.calculateTransactionFinancials(
            ngnAmount,
            nairaRate,
          );

          const totalCryptoRequired = financials.totalInUsd;

          logger.info(`[OFFRAMP] Financial calculation:
            - NGN Amount: ${ngnAmount}
            - Naira Rate: ${nairaRate}
            - Chainpaye Fee: ${financials.chainpayeFee} NGN
            - DexPay Fee: ${financials.dexpayFee} NGN
            - Total Fees: ${financials.totalFees} NGN
            - Crypto Amount (totalInUsd): ${financials.totalInUsd} ${normalizedAsset.toUpperCase()}
            - Total Required: ${totalCryptoRequired} ${normalizedAsset.toUpperCase()}
          `);

          // ============================================================
          // STEP 6: GET WALLET BALANCE AND CHECK SUFFICIENCY
          // ============================================================
          const chainType = crossmintService.getChainType(crossmintChain);
          let balances: CrossmintBalance[] = [];

          if (chainType === "solana") {
            balances = await crossmintService.getBalancesByChain(
              user.userId,
              crossmintChain,
              ["usdc", "usdt"],
            );
          } else {
            balances = await crossmintService.getBalancesByChain(
              user.userId,
              crossmintChain,
              ["usdc", "usdt"],
            );
          }

          logger.info(
            `[OFFRAMP] Balances for ${crossmintChain}: ` +
              JSON.stringify(balances, null, 2),
          );

          // Find balance for the selected asset (case-insensitive comparison)
          const assetBalance = balances.find(
            (b) =>
              (b.symbol?.toLowerCase() || b.token?.toLowerCase()) ===
              normalizedAsset.toLowerCase(),
          );

          // Parse balance with proper decimal handling
          // Crossmint API may return raw amounts in 'amount' field
          let currentBalance = 0;
          if (assetBalance) {
            const decimals = assetBalance.decimals ?? 6;
            const rawAmount = parseFloat(assetBalance.amount) || 0;
            // If amount >= 10^decimals, it's likely raw and needs conversion
            if (rawAmount >= Math.pow(10, decimals) && decimals > 0) {
              currentBalance = rawAmount / Math.pow(10, decimals);
              logger.info(
                `[OFFRAMP] Converted raw balance: ${rawAmount} -> ${currentBalance} (${decimals} decimals)`,
              );
            } else {
              currentBalance = rawAmount;
            }
          }

          logger.info(
            `[OFFRAMP] Current balance: ${currentBalance} ${normalizedAsset.toUpperCase()}, Required: ${totalCryptoRequired} ${normalizedAsset.toUpperCase()}`,
          );

          // Check if user has sufficient balance
          if (currentBalance < totalCryptoRequired) {
            const shortfall = totalCryptoRequired - currentBalance;
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `Insufficient balance. You need ${totalCryptoRequired.toFixed(4)} ${currency.toUpperCase()} but have ${currentBalance.toFixed(4)}. Please deposit ${shortfall.toFixed(4)} more.`,
                has_error: true,
              },
            };
          }

          // ============================================================
          // STEP 7: RESOLVE ACCOUNT NAME (if missing)
          // ============================================================
          let finalRecipientName = recipientName;
          if (
            !finalRecipientName ||
            finalRecipientName === "Beneficiary" ||
            finalRecipientName === "Account Holder"
          ) {
            try {
              logger.info("[OFFRAMP] Resolving account details...");
              const resolved = await dexPayService.resolveAccount(
                account_number,
                bank_code,
              );
              finalRecipientName = resolved.accountName;
              logger.info(
                "[OFFRAMP] Resolved account name: " + finalRecipientName,
              );
            } catch (resolveError) {
              logger.error(
                "[OFFRAMP] Could not resolve account name: " +
                  (resolveError as Error).message,
              );
              return {
                screen: "OFFRAMP_CRYPTO_REVIEW",
                data: {
                  ...data,
                  error_message:
                    "Could not verify account details. Please try again.",
                  has_error: true,
                },
              };
            }
          }

          finalRecipientName = finalRecipientName
            ? finalRecipientName.trim().replace(/\s+/g, " ")
            : "";

          // ============================================================
          // STEP 8: GET RECEIVING ADDRESS (our main wallet)
          // ============================================================
          const receivingAddress =
            dexPayService.getReceivingAddress(dexPayChain);
          logger.info(
            `[OFFRAMP] Receiving address for ${dexPayChain}: ${receivingAddress}`,
          );

          // ============================================================
          // STEP 9: IDEMPOTENCY CHECK - Prevent double-spending
          // ============================================================
          // Create a unique transaction identifier based on user, amount, and bank details
          const transactionIdentifier = `${user.userId}:${ngnAmount}:${bank_code}:${account_number}:${normalizedAsset}:${crossmintChain}`;
          const idempotencyKey = `offramp:transaction:${Buffer.from(transactionIdentifier).toString('base64')}`;
          
          // Check if this exact transaction is already in progress or completed
          const existingTransaction = await redisClient.get(idempotencyKey);
          
          if (existingTransaction) {
            const txData = JSON.parse(existingTransaction);
            logger.warn(`[OFFRAMP] Duplicate transaction attempt detected for user ${user.userId}`);
            
            // If transaction is in progress, inform user
            if (txData.status === 'processing') {
              return {
                screen: "OFFRAMP_CRYPTO_REVIEW",
                data: {
                  ...data,
                  error_message: "Transaction already in progress. Please wait for completion.",
                  has_error: true,
                },
              };
            }
            
            // If transaction completed recently (within last 5 minutes), prevent duplicate
            if (txData.status === 'completed') {
              const completedAt = new Date(txData.completedAt);
              const now = new Date();
              const minutesSinceCompletion = (now.getTime() - completedAt.getTime()) / (1000 * 60);
              
              if (minutesSinceCompletion < 5) {
                return {
                  screen: "OFFRAMP_CRYPTO_REVIEW",
                  data: {
                    ...data,
                    error_message: `Transaction already completed ${Math.floor(minutesSinceCompletion)} minute(s) ago. Reference: ${txData.transferHash?.slice(0, 8)}`,
                    has_error: true,
                  },
                };
              }
            }
          }
          
          // Mark transaction as processing (expires in 10 minutes)
          await redisClient.set(
            idempotencyKey,
            JSON.stringify({
              status: 'processing',
              userId: user.userId,
              amount: totalCryptoRequired,
              asset: normalizedAsset,
              chain: crossmintChain,
              startedAt: new Date().toISOString(),
            }),
            'EX',
            600 // 10 minutes expiry
          );
          
          logger.info(`[OFFRAMP] Idempotency check passed. Transaction marked as processing: ${idempotencyKey}`);

          // ============================================================
          // STEP 10: TRANSFER CRYPTO FROM USER WALLET TO MAIN WALLET
          // This MUST happen before getting quote
          // ============================================================
          logger.info(
            `[OFFRAMP] Transferring ${totalCryptoRequired} ${normalizedAsset.toUpperCase()} to main wallet...`,
          );

          // Get user's wallet
          const wallets = await crossmintService.getUserWallets(user.userId);
          const wallet = wallets.find((w) => w.chainType === chainType);

          if (!wallet) {
            // Clean up idempotency lock on error
            await redisClient.del(idempotencyKey);
            throw new Error(`No wallet found for chain ${chainType}`);
          }

          // Generate a unique idempotency key for this transfer (includes timestamp for uniqueness)
          const transferIdempotencyKey = `offramp-transfer-${user.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Round amount to appropriate decimal places based on chain
          // Stellar USDC supports max 7 decimals, others typically support 6
          const decimals = isStellar ? 7 : 6;
          const roundedAmount = totalCryptoRequired.toFixed(decimals);

          const transferResult = await crossmintService.transferTokens({
            walletAddress: wallet.address,
            token: `${crossmintChain}:${normalizedAsset.toLowerCase()}`,
            recipient: receivingAddress,
            amount: roundedAmount,
            idempotencyKey: transferIdempotencyKey,
          });

          logger.info(
            "[OFFRAMP] Transfer result: " +
              JSON.stringify(transferResult, null, 2),
          );

          if (!transferResult.success) {
            logger.error(
              `[OFFRAMP] Transfer failed: ${transferResult.error || "Unknown error"}`,
            );
            
            // Clean up idempotency lock on transfer failure
            await redisClient.del(idempotencyKey);
            
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `Transfer failed: ${transferResult.error || "Please try again."}`,
                has_error: true,
              },
            };
          }

          // ============================================================
          // RECORD OFFRAMP TRANSACTION IN DATABASE
          // Status: PROCESSING (crypto transferred, waiting for DexPay)
          // ============================================================
          try {
            const { TransactionService } = await import("../../services/TransactionService");
            
            const offrampTransaction = await TransactionService.createOfframpTransaction({
              refId: `OFFRAMP-${user.userId}-${Date.now()}`,
              crossmintTxId: transferResult.transactionId || transferIdempotencyKey,
              userId: user._id,
              asset: normalizedAsset,
              chain: crossmintChain,
              cryptoAmount: financials.totalInUsd - (parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75")),
              fees: parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75"),
              ngnAmount: ngnAmount,
              exchangeRate: nairaRate,
              accountNumber: account_number,
              accountName: finalRecipientName || "Beneficiary",
              bankName: bank_name || "Bank",
              bankCode: bank_code,
            });

            logger.info(`[OFFRAMP] Transaction recorded in database: ${offrampTransaction.referenceId}`);
            
            // Store transaction reference ID for background processing
            await redisClient.set(
              `${idempotencyKey}:txn_ref`,
              offrampTransaction.referenceId,
              'EX',
              600 // Keep for 10 minutes
            );
          } catch (dbError) {
            logger.error(`[OFFRAMP] Failed to record transaction in database: ${(dbError as Error).message}`);
            // Don't fail the offramp process if database recording fails
          }
          
          // Update idempotency record with transfer details
          await redisClient.set(
            idempotencyKey,
            JSON.stringify({
              status: 'transfer_completed',
              userId: user.userId,
              amount: totalCryptoRequired,
              asset: normalizedAsset,
              chain: crossmintChain,
              startedAt: new Date().toISOString(),
              transferId: transferResult.transactionId || transferIdempotencyKey,
              transferCompletedAt: new Date().toISOString(),
            }),
            'EX',
            600 // Keep for 10 minutes
          );

          // ============================================================
          // TRANSFER SUCCESSFUL - RETURN SUCCESS SCREEN IMMEDIATELY
          // Process DexPay quote and completion in background
          // ============================================================
          logger.info("[OFFRAMP] Transfer successful! Returning success screen...");
          
          console.log("\n========================================");
          console.log("✅ TRANSFER SUCCESSFUL");
          console.log("🎉 RETURNING SUCCESS SCREEN IMMEDIATELY");
          console.log("========================================\n");

          // Process DexPay quote and completion in background (non-blocking)
          processOfframpInBackground(
            user.userId,
            phone,
            ngnAmount,
            dexPayQuoteAsset,
            dexPayQuoteChain,
            bank_code,
            finalRecipientName || "Beneficiary",
            account_number,
            currency || "USDT",
            bank_name || "Bank",
            financials.totalInUsd,
            idempotencyKey,
          ).catch((err) =>
            logger.error(
              "[OFFRAMP] Background processing error: " + (err as Error).message,
            ),
          );

          return {
            screen: "OFFRAMP_SUCCESS",
            data: {},
          };
        } catch (error) {
          logger.error(
            "[OFFRAMP] Error processing crypto offramp: " +
              (error as Error).message,
          );
          if ((error as Error).stack) {
            logger.error("[OFFRAMP] Error stack: " + (error as Error).stack);
          }

          let errorMessage =
            (error as Error).message || "Transaction failed. Please try again.";

          // User-friendly error messages
          if (errorMessage.toLowerCase().includes("no trade ad available")) {
            errorMessage =
              "Service temporarily unavailable. Please try a different amount or wait a few minutes.";
          } else if (
            errorMessage.toLowerCase().includes("insufficient balance")
          ) {
            errorMessage =
              "Insufficient balance in your wallet. Please deposit more crypto.";
          } else if (errorMessage.toLowerCase().includes("account not found")) {
            errorMessage =
              "Bank account not found. Please verify your account details.";
          } else if (errorMessage.toLowerCase().includes("expired")) {
            errorMessage = "Quote has expired. Please try again.";
          } else if (errorMessage.toLowerCase().includes("fiat amount")) {
            errorMessage = `Invalid amount. Please try a different amount between ₦1,000 and ₦5,000,000.`;
          } else if (
            errorMessage
              .toLowerCase()
              .includes("beneficiary_bank_not_available")
          ) {
            errorMessage =
              "Selected bank is temporarily unavailable. Please try a different bank.";
          }

          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              ...data,
              error_message: errorMessage,
              has_error: true,
            },
          };
        }
      }

      // Legacy fallback (optional, if you want to keep old logic reachable, but flow file determines screens)
      case "OFFRAMP_INPUT":
        // ... implementation if needed ...
        break;

      // ─────────────────────────────────────────────────────────────
      // RWF SCREENS — Rwanda mobile money via PCXPay
      // ─────────────────────────────────────────────────────────────

      // ─────────────────────────────────────────────────────────────
      // SELECT_PAYMENT_METHOD — KES & TZS route here first
      // ─────────────────────────────────────────────────────────────

      case "SELECT_PAYMENT_METHOD": {
        const { payout_country: spmCountry, payment_method: spmMethod } = data as {
          payout_country?: string;
          payment_method?: string;
        };

        if (!spmCountry || !spmMethod) {
          return {
            screen: "SELECT_PAYMENT_METHOD",
            data: {
              payout_country: spmCountry || "",
              country_label: spmCountry === "KES" ? "Kenya 🇰🇪" : "Tanzania 🇹🇿",
              currency_code: spmCountry || "",
              has_error: true,
              error_message: "Please select a payment method.",
            },
          };
        }

        const pcxCountryCode = spmCountry === "KES" ? "KE" : "TZ";
        const currencyCode = spmCountry;

        if (spmMethod === "bank_transfer") {
          // Fetch only bank-type networks from PCXPay
          let banks: { id: string; title: string }[] = [];
          try {
            const raw = await fetchPcxPayNetworks(pcxCountryCode);
            const seen = new Set<string>();
            banks = raw
              .filter((n) => n.type === "bank")
              .filter((b) => { if (seen.has(b.id)) return false; seen.add(b.id); return true; })
              .map((b) => ({ id: b.id, title: b.title }));
            logger.info(`[OFFRAMP-${currencyCode}] Fetched ${banks.length} banks from PCXPay`);
          } catch (err) {
            logger.error(`[OFFRAMP-${currencyCode}] Failed to fetch banks: ` + (err as Error).message);
            return {
              screen: "SELECT_PAYMENT_METHOD",
              data: {
                payout_country: spmCountry,
                country_label: spmCountry === "KES" ? "Kenya 🇰🇪" : "Tanzania 🇹🇿",
                currency_code: currencyCode,
                has_error: true,
                error_message: "Could not load banks. Please try again.",
              },
            };
          }
          const detailsScreen = spmCountry === "KES" ? "KES_BANK_DETAILS" : "TZS_BANK_DETAILS";
          return {
            screen: detailsScreen,
            data: { banks, has_error: false, error_message: "" },
          };
        }

        if (spmMethod === "mobile_money") {
          // Fetch only momo-type networks from PCXPay
          let networks: { id: string; title: string }[] = [];
          try {
            const raw = await fetchPcxPayNetworks(pcxCountryCode);
            networks = raw
              .filter((n) => n.type === "momo")
              .map((n) => ({ id: n.id, title: n.title }));
            logger.info(`[OFFRAMP-${currencyCode}] Fetched ${networks.length} momo networks from PCXPay`);
          } catch (err) {
            logger.error(`[OFFRAMP-${currencyCode}] Failed to fetch momo networks: ` + (err as Error).message);
            return {
              screen: "SELECT_PAYMENT_METHOD",
              data: {
                payout_country: spmCountry,
                country_label: spmCountry === "KES" ? "Kenya 🇰🇪" : "Tanzania 🇹🇿",
                currency_code: currencyCode,
                has_error: true,
                error_message: "Could not load mobile money networks. Please try again.",
              },
            };
          }
          const detailsScreen = spmCountry === "KES" ? "KES_MOMO_DETAILS" : "TZS_MOMO_DETAILS";
          return {
            screen: detailsScreen,
            data: { networks, has_error: false, error_message: "" },
          };
        }

        return {
          screen: "SELECT_PAYMENT_METHOD",
          data: {
            payout_country: spmCountry,
            country_label: spmCountry === "KES" ? "Kenya 🇰🇪" : "Tanzania 🇹🇿",
            currency_code: currencyCode,
            has_error: true,
            error_message: "Invalid payment method selected.",
          },
        };
      }

      // ─────────────────────────────────────────────────────────────
      // KES BANK SCREENS — Kenya bank transfer via PCXPay + Paystack resolve
      // ─────────────────────────────────────────────────────────────

      case "KES_BANK_DETAILS": {
        const { crypto_asset: kesBankAsset, crypto_network: kesBankNetwork,
          bank_code: kesBankCode, account_number: kesBankAccNum,
          account_name: kesBankAccNameInput, sell_amount: kesBankSellAmt } =
          data as Record<string, string | undefined>;

        const kesBanksOnError = async () => {
          try {
            const raw = await fetchPcxPayNetworks("KE");
            const seen = new Set<string>();
            return raw
              .filter((n) => n.type === "bank")
              .filter((b) => { if (seen.has(b.id)) return false; seen.add(b.id); return true; })
              .map((b) => ({ id: b.id, title: b.title }));
          } catch { return []; }
        };

        if (!kesBankAsset || !kesBankNetwork || !kesBankCode || !kesBankAccNum || !kesBankAccNameInput || !kesBankSellAmt) {
          return { screen: "KES_BANK_DETAILS", data: { banks: await kesBanksOnError(), has_error: true, error_message: "Please fill in all required fields." } };
        }

        const kesFiatInput = parseFloat(kesBankSellAmt);
        if (isNaN(kesFiatInput) || kesFiatInput < 500) {
          return { screen: "KES_BANK_DETAILS", data: { banks: await kesBanksOnError(), has_error: true, error_message: "Minimum withdrawal amount is KES 500." } };
        }

        let kesRate: number;
        let kesOrgRateId: string;
        try {
          const rateData = await fetchPcxPayUsdRate("KES");
          kesRate = rateData.rate;
          kesOrgRateId = rateData.orgRateId;
          logger.info(`[OFFRAMP-KES-BANK] Rate: 1 USD = ${kesRate} KES`);
        } catch (err) {
          return { screen: "KES_BANK_DETAILS", data: { banks: await kesBanksOnError(), has_error: true, error_message: "Could not fetch exchange rate. Please try again." } };
        }

        // Resolve bank name
        let kesBankName = kesBankCode;
        try {
          const allBanks = await fetchPcxPayNetworks("KE");
          const found = allBanks.find((b) => b.id === kesBankCode);
          if (found) kesBankName = found.title;
        } catch { /* keep code */ }

        // Resolve account name via Paystack
        // Use user-entered account name directly (no Paystack resolution for KES bank)
        const kesAccountName = kesBankAccNameInput!.trim();

        const kesCryptoCost = kesFiatInput / kesRate;
        const kesCostFormatted = kesCryptoCost.toFixed(6).replace(/\.?0+$/, "") || "0.00";

        return {
          screen: "KES_BANK_REVIEW",
          data: {
            crypto_asset: kesBankAsset.toUpperCase(),
            crypto_network: kesBankNetwork.toUpperCase(),
            bank_code: kesBankCode,
            bank_name: kesBankName,
            account_number: kesBankAccNum,
            account_name: kesAccountName,
            sell_amount: kesFiatInput.toLocaleString("en-KE", { maximumFractionDigits: 0 }),
            crypto_cost: kesCostFormatted,
            rate: kesRate.toFixed(2),
            org_rate_id: kesOrgRateId,
            has_error: false,
            error_message: "",
          },
        };
      }

      case "KES_BANK_REVIEW": {
        const { crypto_asset: kbrAsset, crypto_network: kbrNetwork, bank_code: kbrBankCode,
          bank_name: kbrBankName, account_number: kbrAccNum, account_name: kbrAccName,
          sell_amount: kbrSellAmt, crypto_cost: kbrCryptoCost, org_rate_id: kbrOrgRateId,
          rate: kbrRate } = data as Record<string, string | undefined>;

        const flatFee = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
        const kbrTotal = (parseFloat(kbrCryptoCost || "0") + flatFee).toFixed(6).replace(/\.?0+$/, "") || "0.00";

        return {
          screen: "KES_BANK_AUTHORIZE",
          data: {
            crypto_asset: kbrAsset || "USDC", crypto_network: kbrNetwork || "",
            bank_code: kbrBankCode || "", bank_name: kbrBankName || "",
            account_number: kbrAccNum || "", account_name: kbrAccName || "",
            sell_amount: kbrSellAmt || "0", crypto_cost: kbrCryptoCost || "0",
            rate: kbrRate || "0", org_rate_id: kbrOrgRateId || "",
            total_crypto_usd: kbrTotal, has_error: false, error_message: "",
          },
        };
      }

      case "KES_BANK_AUTHORIZE": {
        const { pin: kesBankPin, crypto_asset: kesBankFinAsset, crypto_network: kesBankFinNetwork,
          bank_code: kesBankFinCode, bank_name: kesBankFinName, account_number: kesBankFinAccNum,
          account_name: kesBankFinAccName, sell_amount: kesBankFinSellAmt,
          total_crypto_usd: kesBankFinTotal, rate: kesBankRate, org_rate_id: kesBankOrgRateId } =
          data as Record<string, string | undefined>;

        if (!kesBankPin || !kesBankFinAsset || !kesBankFinNetwork || !kesBankFinCode || !kesBankFinAccNum || !kesBankFinSellAmt) {
          return { screen: "KES_BANK_AUTHORIZE", data: { ...data, error_message: "Missing required transaction details.", has_error: true } };
        }
        return executePcxOfframp({
          screenId: "KES_BANK_AUTHORIZE", tag: "[OFFRAMP-KES-BANK]",
          data: data as Record<string, unknown>, phone,
          pin: kesBankPin, cryptoAsset: kesBankFinAsset, cryptoNetwork: kesBankFinNetwork,
          totalCryptoUsd: kesBankFinTotal || "0", fiatCurrency: "KES",
          fiatAmount: kesBankFinSellAmt, clientRate: kesBankRate || "0",
          orgRateId: kesBankOrgRateId || "", country: "KE",
          paymentMethod: "bank_transfer",
          beneficiaryName: kesBankFinAccName || kesBankFinAccNum || "",
          destination: { accountNumber: kesBankFinAccNum, bankCode: kesBankFinCode, bankName: kesBankFinName || kesBankFinCode } as PCXBankTransferDestination,
          idempKeySuffix: `${kesBankFinSellAmt}:${kesBankFinCode}:${kesBankFinAccNum}`,
          displayAmount: `KES ${kesBankFinSellAmt}`,
          displayAccount: kesBankFinAccNum,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // KES MOMO SCREENS — Kenya mobile money via PCXPay (no account resolve)
      // ─────────────────────────────────────────────────────────────

      case "KES_MOMO_DETAILS": {
        const { crypto_asset: kesMA, crypto_network: kesMN, network_code: kesMC,
          phone_number: kesMPhone, sell_amount: kesMSell } = data as Record<string, string | undefined>;

        const kesNetworksOnError = async () => { try { const raw = await fetchPcxPayNetworks("KE"); return raw.filter((n) => n.type === "momo").map((n) => ({ id: n.id, title: n.title })); } catch { return []; } };

        if (!kesMA || !kesMN || !kesMC || !kesMPhone || !kesMSell) {
          return { screen: "KES_MOMO_DETAILS", data: { networks: await kesNetworksOnError(), has_error: true, error_message: "Please fill in all required fields." } };
        }

        const kesMomoInput = parseFloat(kesMSell);
        if (isNaN(kesMomoInput) || kesMomoInput < 500) {
          return { screen: "KES_MOMO_DETAILS", data: { networks: await kesNetworksOnError(), has_error: true, error_message: "Minimum withdrawal amount is KES 500." } };
        }

        let kesRate: number;
        let kesOrgRateId: string;
        try { const r = await fetchPcxPayUsdRate("KES"); kesRate = r.rate; kesOrgRateId = r.orgRateId; } catch {
          return { screen: "KES_MOMO_DETAILS", data: { networks: await kesNetworksOnError(), has_error: true, error_message: "Could not fetch exchange rate." } };
        }

        let kesMomoNetworkName = kesMC;
        try { const all = await fetchPcxPayNetworks("KE"); const f = all.find((n) => n.id === kesMC); if (f) kesMomoNetworkName = f.title; } catch { /* keep code */ }

        // Resolve M-Pesa account name via Paystack
        let kesMomoAccountName = "";
        try {
          const resolved = await resolvePaystackAccount(kesMPhone!, kesMC!);
          kesMomoAccountName = resolved.accountName;
          logger.info(`[OFFRAMP-KES-MOMO] Resolved: ${kesMPhone} -> ${kesMomoAccountName}`);
        } catch (re: any) {
          logger.warn(`[OFFRAMP-KES-MOMO] Could not resolve account name: ${re.message}`);
        }

        const kesMomoCost = (kesMomoInput / kesRate).toFixed(6).replace(/\.?0+$/, "") || "0.00";
        return {
          screen: "KES_MOMO_REVIEW",
          data: {
            crypto_asset: kesMA.toUpperCase(), crypto_network: kesMN.toUpperCase(),
            network_code: kesMC, network_name: kesMomoNetworkName, account_name: kesMomoAccountName,
            phone_number: kesMPhone, sell_amount: kesMomoInput.toLocaleString("en-KE", { maximumFractionDigits: 0 }),
            crypto_cost: kesMomoCost, rate: kesRate.toFixed(2),
            org_rate_id: kesOrgRateId, has_error: false, error_message: "",
          },
        };
      }

      case "KES_MOMO_REVIEW": {
        const { crypto_asset: kmrA, crypto_network: kmrN, network_code: kmrC, network_name: kmrNN,
          phone_number: kmrPhone, account_name: kmrAccountName, sell_amount: kmrSell, crypto_cost: kmrCost,
          org_rate_id: kmrOrgRateId, rate: kmrRate } = data as Record<string, string | undefined>;
        const flatFee = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
        const kmrTotal = (parseFloat(kmrCost || "0") + flatFee).toFixed(6).replace(/\.?0+$/, "") || "0.00";
        return {
          screen: "KES_MOMO_AUTHORIZE",
          data: { crypto_asset: kmrA || "USDC", crypto_network: kmrN || "", network_code: kmrC || "",
            network_name: kmrNN || "", phone_number: kmrPhone || "", account_name: kmrAccountName || "", sell_amount: kmrSell || "0",
            crypto_cost: kmrCost || "0", rate: kmrRate || "0", org_rate_id: kmrOrgRateId || "",
            total_crypto_usd: kmrTotal, has_error: false, error_message: "" },
        };
      }

      case "KES_MOMO_AUTHORIZE": {
        const { pin: kmaPin, crypto_asset: kmaAsset, crypto_network: kmaNetwork, network_code: kmaCode,
          network_name: kmaName, phone_number: kmaPhone, account_name: kmaAccountName, sell_amount: kmaSell,
          total_crypto_usd: kmaTotal, rate: kmaRate, org_rate_id: kmaOrgRateId } = data as Record<string, string | undefined>;
        if (!kmaPin || !kmaAsset || !kmaNetwork || !kmaCode || !kmaPhone || !kmaSell) {
          return { screen: "KES_MOMO_AUTHORIZE", data: { ...data, error_message: "Missing required transaction details.", has_error: true } };
        }
        return executePcxOfframp({
          screenId: "KES_MOMO_AUTHORIZE", tag: "[OFFRAMP-KES-MOMO]",
          data: data as Record<string, unknown>, phone,
          pin: kmaPin, cryptoAsset: kmaAsset, cryptoNetwork: kmaNetwork,
          totalCryptoUsd: kmaTotal || "0", fiatCurrency: "KES",
          fiatAmount: kmaSell, clientRate: kmaRate || "0",
          orgRateId: kmaOrgRateId || "", country: "KE",
          paymentMethod: "mobile_money",
          beneficiaryName: kmaAccountName || kmaName || kmaPhone,
          destination: { provider: kmaCode, phoneNumber: kmaPhone } as PCXMobileMoneyDestination,
          idempKeySuffix: `${kmaSell}:${kmaCode}:${kmaPhone}`,
          displayAmount: `KES ${kmaSell}`,
          displayAccount: kmaPhone,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // TZS BANK SCREENS — Tanzania bank transfer via PCXPay (manual account name)
      // ─────────────────────────────────────────────────────────────

      case "TZS_BANK_DETAILS": {
        const { crypto_asset: tzsBA, crypto_network: tzsBN, bank_code: tzsBC,
          account_number: tzsBAcc, account_name: tzsBAccNameInput, sell_amount: tzsBSell } = data as Record<string, string | undefined>;

        const tzsBanksOnError = async () => {
          try { const raw = await fetchPcxPayNetworks("TZ"); const seen = new Set<string>(); return raw.filter((n) => n.type === "bank").filter((b) => { if (seen.has(b.id)) return false; seen.add(b.id); return true; }).map((b) => ({ id: b.id, title: b.title })); } catch { return []; }
        };

        if (!tzsBA || !tzsBN || !tzsBC || !tzsBAcc || !tzsBAccNameInput || !tzsBSell) {
          return { screen: "TZS_BANK_DETAILS", data: { banks: await tzsBanksOnError(), has_error: true, error_message: "Please fill in all required fields." } };
        }

        const tzsFiatInput = parseFloat(tzsBSell);
        if (isNaN(tzsFiatInput) || tzsFiatInput < 10000) {
          return { screen: "TZS_BANK_DETAILS", data: { banks: await tzsBanksOnError(), has_error: true, error_message: "Minimum withdrawal amount is TZS 10,000." } };
        }

        let tzsRate: number;
        let tzsOrgRateId: string;
        try { const r = await fetchPcxPayUsdRate("TZS"); tzsRate = r.rate; tzsOrgRateId = r.orgRateId; logger.info(`[OFFRAMP-TZS-BANK] Rate: 1 USD = ${tzsRate} TZS`); }
        catch { return { screen: "TZS_BANK_DETAILS", data: { banks: await tzsBanksOnError(), has_error: true, error_message: "Could not fetch exchange rate." } }; }

        let tzsBankName = tzsBC;
        try { const all = await fetchPcxPayNetworks("TZ"); const f = all.find((b) => b.id === tzsBC); if (f) tzsBankName = f.title; } catch { /* keep code */ }

        // Resolve account name via Paystack
        // Use user-entered account name directly (no Paystack resolution for TZS bank)
        const tzsBankAccName = tzsBAccNameInput!.trim();

        const tzsCost = (tzsFiatInput / tzsRate).toFixed(6).replace(/\.?0+$/, "") || "0.00";
        return {
          screen: "TZS_BANK_REVIEW",
          data: { crypto_asset: tzsBA.toUpperCase(), crypto_network: tzsBN.toUpperCase(), bank_code: tzsBC,
            bank_name: tzsBankName, account_number: tzsBAcc, account_name: tzsBankAccName,
            sell_amount: tzsFiatInput.toLocaleString("en-TZ", { maximumFractionDigits: 0 }),
            crypto_cost: tzsCost, rate: tzsRate.toFixed(2), org_rate_id: tzsOrgRateId,
            has_error: false, error_message: "" },
        };
      }

      case "TZS_BANK_REVIEW": {
        const { crypto_asset: tbrA, crypto_network: tbrN, bank_code: tbrBC, bank_name: tbrBN,
          account_number: tbrAcc, account_name: tbrAN, sell_amount: tbrSell, crypto_cost: tbrCost,
          org_rate_id: tbrOrgRateId, rate: tbrRate } = data as Record<string, string | undefined>;
        const flatFee = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
        const tbrTotal = (parseFloat(tbrCost || "0") + flatFee).toFixed(6).replace(/\.?0+$/, "") || "0.00";
        return {
          screen: "TZS_BANK_AUTHORIZE",
          data: { crypto_asset: tbrA || "USDC", crypto_network: tbrN || "", bank_code: tbrBC || "",
            bank_name: tbrBN || "", account_number: tbrAcc || "", account_name: tbrAN || "",
            sell_amount: tbrSell || "0", crypto_cost: tbrCost || "0",
            rate: tbrRate || "0", org_rate_id: tbrOrgRateId || "",
            total_crypto_usd: tbrTotal, has_error: false, error_message: "" },
        };
      }

      case "TZS_BANK_AUTHORIZE": {
        const { pin: tbaPin, crypto_asset: tbaAsset, crypto_network: tbaNetwork, bank_code: tbaCode,
          bank_name: tbaBank, account_number: tbaAcc, account_name: tbaAccName,
          sell_amount: tbaSell, total_crypto_usd: tbaTotal, rate: tbaRate, org_rate_id: tbaOrgRateId } = data as Record<string, string | undefined>;
        if (!tbaPin || !tbaAsset || !tbaNetwork || !tbaCode || !tbaAcc || !tbaSell) {
          return { screen: "TZS_BANK_AUTHORIZE", data: { ...data, error_message: "Missing required transaction details.", has_error: true } };
        }
        return executePcxOfframp({
          screenId: "TZS_BANK_AUTHORIZE", tag: "[OFFRAMP-TZS-BANK]",
          data: data as Record<string, unknown>, phone,
          pin: tbaPin, cryptoAsset: tbaAsset, cryptoNetwork: tbaNetwork,
          totalCryptoUsd: tbaTotal || "0", fiatCurrency: "TZS",
          fiatAmount: tbaSell, clientRate: tbaRate || "0",
          orgRateId: tbaOrgRateId || "", country: "TZ",
          paymentMethod: "bank_transfer",
          beneficiaryName: tbaAccName || tbaAcc,
          destination: { accountNumber: tbaAcc, bankCode: tbaCode, bankName: tbaBank || tbaCode } as PCXBankTransferDestination,
          idempKeySuffix: `${tbaSell}:${tbaCode}:${tbaAcc}`,
          displayAmount: `TZS ${tbaSell}`,
          displayAccount: tbaAcc,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // TZS MOMO + UGX SCREENS — mobile money only, no account resolve
      // ─────────────────────────────────────────────────────────────

      case "TZS_MOMO_DETAILS": {
        const { crypto_asset: tzsMA, crypto_network: tzsMN, network_code: tzsMC,
          phone_number: tzsMPhone, sell_amount: tzsMSell } = data as Record<string, string | undefined>;
        const tzsNetworksOnError = async () => { try { const raw = await fetchPcxPayNetworks("TZ"); return raw.filter((n) => n.type === "momo").map((n) => ({ id: n.id, title: n.title })); } catch { return []; } };
        if (!tzsMA || !tzsMN || !tzsMC || !tzsMPhone || !tzsMSell) return { screen: "TZS_MOMO_DETAILS", data: { networks: await tzsNetworksOnError(), has_error: true, error_message: "Please fill in all required fields." } };
        const tzsMomoInput = parseFloat(tzsMSell);
        if (isNaN(tzsMomoInput) || tzsMomoInput < 10000) return { screen: "TZS_MOMO_DETAILS", data: { networks: await tzsNetworksOnError(), has_error: true, error_message: "Minimum withdrawal amount is TZS 10,000." } };
        let tzsRate: number;
        let tzsMomoOrgRateId: string;
        try { const r = await fetchPcxPayUsdRate("TZS"); tzsRate = r.rate; tzsMomoOrgRateId = r.orgRateId; } catch { return { screen: "TZS_MOMO_DETAILS", data: { networks: await tzsNetworksOnError(), has_error: true, error_message: "Could not fetch exchange rate." } }; }
        let tzsMomoName = tzsMC;
        try { const all = await fetchPcxPayNetworks("TZ"); const f = all.find((n) => n.id === tzsMC); if (f) tzsMomoName = f.title; } catch { /* keep */ }
        return { screen: "TZS_MOMO_REVIEW", data: { crypto_asset: tzsMA.toUpperCase(), crypto_network: tzsMN.toUpperCase(), network_code: tzsMC, network_name: tzsMomoName, phone_number: tzsMPhone, sell_amount: tzsMomoInput.toLocaleString("en-TZ", { maximumFractionDigits: 0 }), crypto_cost: (tzsMomoInput / tzsRate).toFixed(6).replace(/\.?0+$/, "") || "0.00", rate: tzsRate.toFixed(2), org_rate_id: tzsMomoOrgRateId, has_error: false, error_message: "" } };
      }

      case "TZS_MOMO_REVIEW": {
        const { crypto_asset: tmrA, crypto_network: tmrN, network_code: tmrC, network_name: tmrNN, phone_number: tmrPhone, sell_amount: tmrSell, crypto_cost: tmrCost, org_rate_id: tmrOrgRateId, rate: tmrRate } = data as Record<string, string | undefined>;
        const tmrTotal = (parseFloat(tmrCost || "0") + parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75")).toFixed(6).replace(/\.?0+$/, "") || "0.00";
        return { screen: "TZS_MOMO_AUTHORIZE", data: { crypto_asset: tmrA || "USDC", crypto_network: tmrN || "", network_code: tmrC || "", network_name: tmrNN || "", phone_number: tmrPhone || "", sell_amount: tmrSell || "0", crypto_cost: tmrCost || "0", rate: tmrRate || "0", org_rate_id: tmrOrgRateId || "", total_crypto_usd: tmrTotal, has_error: false, error_message: "" } };
      }

      case "TZS_MOMO_AUTHORIZE": {
        const { pin: tmaPin, crypto_asset: tmaAsset, crypto_network: tmaNetwork, network_code: tmaCode, network_name: tmaName, phone_number: tmaPhone, sell_amount: tmaSell, total_crypto_usd: tmaTotal, rate: tmaRate, org_rate_id: tmaOrgRateId } = data as Record<string, string | undefined>;
        if (!tmaPin || !tmaAsset || !tmaNetwork || !tmaCode || !tmaPhone || !tmaSell) return { screen: "TZS_MOMO_AUTHORIZE", data: { ...data, error_message: "Missing required transaction details.", has_error: true } };
        return executePcxOfframp({
          screenId: "TZS_MOMO_AUTHORIZE", tag: "[OFFRAMP-TZS-MOMO]",
          data: data as Record<string, unknown>, phone,
          pin: tmaPin, cryptoAsset: tmaAsset, cryptoNetwork: tmaNetwork,
          totalCryptoUsd: tmaTotal || "0", fiatCurrency: "TZS",
          fiatAmount: tmaSell, clientRate: tmaRate || "0",
          orgRateId: tmaOrgRateId || "", country: "TZ",
          paymentMethod: "mobile_money",
          beneficiaryName: tmaName || tmaPhone,
          destination: { provider: tmaCode, phoneNumber: tmaPhone } as PCXMobileMoneyDestination,
          idempKeySuffix: `${tmaSell}:${tmaCode}:${tmaPhone}`,
          displayAmount: `TZS ${tmaSell}`,
          displayAccount: tmaPhone,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // MWK SCREENS — Malawi mobile money only via PCXPay
      // ─────────────────────────────────────────────────────────────

      case "MWK_DETAILS": {
        const { crypto_asset: mwkA, crypto_network: mwkN, network_code: mwkC, phone_number: mwkPhone, sell_amount: mwkSell } = data as Record<string, string | undefined>;
        const mwkNetworksOnError = async () => { try { return (await fetchPcxPayNetworks("MW")).map((n) => ({ id: n.id, title: n.title })); } catch { return []; } };
        if (!mwkA || !mwkN || !mwkC || !mwkPhone || !mwkSell) return { screen: "MWK_DETAILS", data: { networks: await mwkNetworksOnError(), has_error: true, error_message: "Please fill in all required fields." } };
        const mwkFiatInput = parseFloat(mwkSell);
        if (isNaN(mwkFiatInput) || mwkFiatInput < 5000) return { screen: "MWK_DETAILS", data: { networks: await mwkNetworksOnError(), has_error: true, error_message: "Minimum withdrawal amount is MWK 5,000." } };
        let mwkRate: number;
        let mwkOrgRateId: string;
        try { const r = await fetchPcxPayUsdRate("MWK"); mwkRate = r.rate; mwkOrgRateId = r.orgRateId; logger.info(`[OFFRAMP-MWK] Rate: 1 USD = ${mwkRate} MWK`); } catch { return { screen: "MWK_DETAILS", data: { networks: await mwkNetworksOnError(), has_error: true, error_message: "Could not fetch exchange rate." } }; }
        let mwkNetworkName = mwkC;
        try { const all = await fetchPcxPayNetworks("MW"); const f = all.find((n) => n.id === mwkC); if (f) mwkNetworkName = f.title; } catch { /* keep */ }
        return { screen: "MWK_REVIEW", data: { crypto_asset: mwkA.toUpperCase(), crypto_network: mwkN.toUpperCase(), network_code: mwkC, network_name: mwkNetworkName, phone_number: mwkPhone, sell_amount: mwkFiatInput.toLocaleString("en-MW", { maximumFractionDigits: 0 }), crypto_cost: (mwkFiatInput / mwkRate).toFixed(6).replace(/\.?0+$/, "") || "0.00", rate: mwkRate.toFixed(2), org_rate_id: mwkOrgRateId, has_error: false, error_message: "" } };
      }

      case "MWK_REVIEW": {
        const { crypto_asset: mwrA, crypto_network: mwrN, network_code: mwrC, network_name: mwrNN, phone_number: mwrPhone, sell_amount: mwrSell, crypto_cost: mwrCost, org_rate_id: mwrOrgRateId, rate: mwrRate } = data as Record<string, string | undefined>;
        const mwrTotal = (parseFloat(mwrCost || "0") + parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75")).toFixed(6).replace(/\.?0+$/, "") || "0.00";
        return { screen: "MWK_AUTHORIZE", data: { crypto_asset: mwrA || "USDC", crypto_network: mwrN || "", network_code: mwrC || "", network_name: mwrNN || "", phone_number: mwrPhone || "", sell_amount: mwrSell || "0", crypto_cost: mwrCost || "0", rate: mwrRate || "0", org_rate_id: mwrOrgRateId || "", total_crypto_usd: mwrTotal, has_error: false, error_message: "" } };
      }

      case "MWK_AUTHORIZE": {
        const { pin: mwaPin, crypto_asset: mwaAsset, crypto_network: mwaNetwork, network_code: mwaCode, network_name: mwaName, phone_number: mwaPhone, sell_amount: mwaSell, total_crypto_usd: mwaTotal, rate: mwaRate, org_rate_id: mwaOrgRateId } = data as Record<string, string | undefined>;
        if (!mwaPin || !mwaAsset || !mwaNetwork || !mwaCode || !mwaPhone || !mwaSell) return { screen: "MWK_AUTHORIZE", data: { ...data, error_message: "Missing required transaction details.", has_error: true } };
        return executePcxOfframp({
          screenId: "MWK_AUTHORIZE", tag: "[OFFRAMP-MWK]",
          data: data as Record<string, unknown>, phone,
          pin: mwaPin, cryptoAsset: mwaAsset, cryptoNetwork: mwaNetwork,
          totalCryptoUsd: mwaTotal || "0", fiatCurrency: "MWK",
          fiatAmount: mwaSell, clientRate: mwaRate || "0",
          orgRateId: mwaOrgRateId || "", country: "MW",
          paymentMethod: "mobile_money",
          beneficiaryName: mwaName || mwaPhone,
          destination: { provider: mwaCode, phoneNumber: mwaPhone } as PCXMobileMoneyDestination,
          idempKeySuffix: `${mwaSell}:${mwaCode}:${mwaPhone}`,
          displayAmount: `MWK ${mwaSell}`,
          displayAccount: mwaPhone,
        });
      }

      case "UGX_DETAILS": {
        const { crypto_asset: ugxA, crypto_network: ugxN, network_code: ugxC, phone_number: ugxPhone, sell_amount: ugxSell } = data as Record<string, string | undefined>;
        const ugxNetworksOnError = async () => { try { return (await fetchPcxPayNetworks("UG")).map((n) => ({ id: n.id, title: n.title })); } catch { return []; } };
        if (!ugxA || !ugxN || !ugxC || !ugxPhone || !ugxSell) return { screen: "UGX_DETAILS", data: { networks: await ugxNetworksOnError(), has_error: true, error_message: "Please fill in all required fields." } };
        const ugxFiatInput = parseFloat(ugxSell);
        if (isNaN(ugxFiatInput) || ugxFiatInput < 50000) return { screen: "UGX_DETAILS", data: { networks: await ugxNetworksOnError(), has_error: true, error_message: "Minimum withdrawal amount is UGX 50,000." } };
        let ugxRate: number;
        let ugxOrgRateId: string;
        try { const r = await fetchPcxPayUsdRate("UGX"); ugxRate = r.rate; ugxOrgRateId = r.orgRateId; logger.info(`[OFFRAMP-UGX] Rate: 1 USD = ${ugxRate} UGX`); } catch { return { screen: "UGX_DETAILS", data: { networks: await ugxNetworksOnError(), has_error: true, error_message: "Could not fetch exchange rate." } }; }
        let ugxNetworkName = ugxC;
        try { const all = await fetchPcxPayNetworks("UG"); const f = all.find((n) => n.id === ugxC); if (f) ugxNetworkName = f.title; } catch { /* keep */ }
        return { screen: "UGX_REVIEW", data: { crypto_asset: ugxA.toUpperCase(), crypto_network: ugxN.toUpperCase(), network_code: ugxC, network_name: ugxNetworkName, phone_number: ugxPhone, sell_amount: ugxFiatInput.toLocaleString("en-UG", { maximumFractionDigits: 0 }), crypto_cost: (ugxFiatInput / ugxRate).toFixed(6).replace(/\.?0+$/, "") || "0.00", rate: ugxRate.toFixed(2), org_rate_id: ugxOrgRateId, has_error: false, error_message: "" } };
      }

      case "UGX_REVIEW": {
        const { crypto_asset: urA, crypto_network: urN, network_code: urC, network_name: urNN, phone_number: urPhone, sell_amount: urSell, crypto_cost: urCost, org_rate_id: urOrgRateId, rate: urRate } = data as Record<string, string | undefined>;
        const urTotal = (parseFloat(urCost || "0") + parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75")).toFixed(6).replace(/\.?0+$/, "") || "0.00";
        return { screen: "UGX_AUTHORIZE", data: { crypto_asset: urA || "USDC", crypto_network: urN || "", network_code: urC || "", network_name: urNN || "", phone_number: urPhone || "", sell_amount: urSell || "0", crypto_cost: urCost || "0", rate: urRate || "0", org_rate_id: urOrgRateId || "", total_crypto_usd: urTotal, has_error: false, error_message: "" } };
      }

      case "UGX_AUTHORIZE": {
        const { pin: uaPin, crypto_asset: uaAsset, crypto_network: uaNetwork, network_code: uaCode, network_name: uaName, phone_number: uaPhone, sell_amount: uaSell, total_crypto_usd: uaTotal, rate: uaRate, org_rate_id: uaOrgRateId } = data as Record<string, string | undefined>;
        if (!uaPin || !uaAsset || !uaNetwork || !uaCode || !uaPhone || !uaSell) return { screen: "UGX_AUTHORIZE", data: { ...data, error_message: "Missing required transaction details.", has_error: true } };
        return executePcxOfframp({
          screenId: "UGX_AUTHORIZE", tag: "[OFFRAMP-UGX]",
          data: data as Record<string, unknown>, phone,
          pin: uaPin, cryptoAsset: uaAsset, cryptoNetwork: uaNetwork,
          totalCryptoUsd: uaTotal || "0", fiatCurrency: "UGX",
          fiatAmount: uaSell, clientRate: uaRate || "0",
          orgRateId: uaOrgRateId || "", country: "UG",
          paymentMethod: "mobile_money",
          beneficiaryName: uaName || uaPhone,
          destination: { provider: uaCode, phoneNumber: uaPhone } as PCXMobileMoneyDestination,
          idempKeySuffix: `${uaSell}:${uaCode}:${uaPhone}`,
          displayAmount: `UGX ${uaSell}`,
          displayAccount: uaPhone,
        });
      }

      case "RWF_DETAILS": {
        const {
          crypto_asset,
          crypto_network,
          network_code,
          phone_number,
          sell_amount: rwfSellAmount,
        } = data as {
          crypto_asset?: string;
          crypto_network?: string;
          network_code?: string;
          phone_number?: string;
          sell_amount?: string;
        };

        // Basic validation
        if (!crypto_asset || !crypto_network || !network_code || !phone_number || !rwfSellAmount) {
          let networks: { id: string; title: string }[] = [];
          try { networks = (await fetchPcxPayNetworks("RW")).map((n) => ({ id: n.id, title: n.title })); } catch { /* use empty */ }
          return {
            screen: "RWF_DETAILS",
            data: { networks, has_error: true, error_message: "Please fill in all required fields." },
          };
        }

        const rwfInputAmount = parseFloat(rwfSellAmount);
        if (isNaN(rwfInputAmount) || rwfInputAmount < 5000) {
          let networks: { id: string; title: string }[] = [];
          try { networks = (await fetchPcxPayNetworks("RW")).map((n) => ({ id: n.id, title: n.title })); } catch { /* use empty */ }
          return {
            screen: "RWF_DETAILS",
            data: { networks, has_error: true, error_message: "Minimum withdrawal amount is RWF 5,000." },
          };
        }

        // Validate asset + chain combination
        const rwfAsset = crypto_asset.toUpperCase();
        const rwfChainKey = crypto_network.toLowerCase();
        // USDC: BASE, ERC20, POLYGON, OPTIMISM, ARBITRUM, SOL, AVALANCHE
        // USDT: ERC20, POLYGON, SOL, AVALANCHE
        const rwfUsdcChains = ["base", "erc20", "polygon", "optimism", "arbitrum", "sol", "solana", "avalanche"];
        const rwfUsdtChains = ["erc20", "polygon", "sol", "solana", "avalanche"];
        const supportedRwf =
          (rwfAsset === "USDC" && rwfUsdcChains.includes(rwfChainKey)) ||
          (rwfAsset === "USDT" && rwfUsdtChains.includes(rwfChainKey));

        if (!supportedRwf) {
          let networks: { id: string; title: string }[] = [];
          try { networks = (await fetchPcxPayNetworks("RW")).map((n) => ({ id: n.id, title: n.title })); } catch { /* use empty */ }
          return {
            screen: "RWF_DETAILS",
            data: {
              networks,
              has_error: true,
              error_message: `${rwfAsset} is not supported on ${crypto_network}. USDC: BASE/ERC20/POLYGON/OPTIMISM/ARBITRUM/SOL/AVALANCHE. USDT: ERC20/POLYGON/SOL/AVALANCHE`,
            },
          };
        }

        // Fetch live USD→RWF rate from PCXPay
        let rwfRate: number;
        let rwfOrgRateId: string;
        try {
          const rateData = await fetchPcxPayUsdRate("RWF");
          rwfRate = rateData.rate;
          rwfOrgRateId = rateData.orgRateId;
          logger.info(`[OFFRAMP-RWF] Live rate: 1 USD = ${rwfRate} RWF`);
        } catch (rateError) {
          logger.error("[OFFRAMP-RWF] Rate fetch failed: " + (rateError as Error).message);
          let networks: { id: string; title: string }[] = [];
          try { networks = (await fetchPcxPayNetworks("RW")).map((n) => ({ id: n.id, title: n.title })); } catch { /* use empty */ }
          return {
            screen: "RWF_DETAILS",
            data: { networks, has_error: true, error_message: "Could not fetch current exchange rate. Please try again." },
          };
        }

        // RWF amount is what the user entered — derive USD crypto cost
        const cryptoCostUsd = rwfInputAmount / rwfRate;
        const formattedCryptoCost = cryptoCostUsd.toFixed(6).replace(/\.?0+$/, "") || "0.00";

        // Resolve network name from code
        let networkName = network_code;
        try {
          const allNetworks = await fetchPcxPayNetworks("RW");
          const found = allNetworks.find((n) => n.id === network_code);
          if (found) networkName = found.title;
        } catch { /* keep code as name */ }

        return {
          screen: "RWF_REVIEW",
          data: {
            crypto_asset: rwfAsset,
            crypto_network: crypto_network.toUpperCase(),
            network_code,
            network_name: networkName,
            phone_number,
            sell_amount: rwfInputAmount.toLocaleString("en-RW", { maximumFractionDigits: 0 }),
            crypto_cost: formattedCryptoCost,
            rate: rwfRate.toLocaleString("en-RW", { maximumFractionDigits: 0 }),
            org_rate_id: rwfOrgRateId,
            has_error: false,
            error_message: "",
          },
        };
      }

      case "RWF_REVIEW": {
        const {
          crypto_asset: rwfReviewAsset,
          crypto_network: rwfReviewNetwork,
          network_code: rwfReviewNetworkCode,
          network_name: rwfReviewNetworkName,
          phone_number: rwfReviewPhone,
          sell_amount: rwfReviewSellAmount,
          crypto_cost: rwfReviewCryptoCost,
          org_rate_id: rwfReviewOrgRateId,
          rate: rwfReviewRate,
        } = data as Record<string, string | undefined>;

        const flatFeeUsd = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
        const cryptoCostNum = parseFloat(rwfReviewCryptoCost || "0");
        const totalCrypto = (cryptoCostNum + flatFeeUsd).toFixed(6).replace(/\.?0+$/, "") || "0.00";

        return {
          screen: "RWF_AUTHORIZE",
          data: {
            crypto_asset: rwfReviewAsset || "USDC",
            crypto_network: rwfReviewNetwork || "",
            network_code: rwfReviewNetworkCode || "",
            network_name: rwfReviewNetworkName || "",
            phone_number: rwfReviewPhone || "",
            sell_amount: rwfReviewSellAmount || "0",
            crypto_cost: rwfReviewCryptoCost || "0",
            rate: rwfReviewRate || "0",
            org_rate_id: rwfReviewOrgRateId || "",
            total_crypto_usd: totalCrypto,
            has_error: false,
            error_message: "",
          },
        };
      }

      case "RWF_AUTHORIZE": {
        const {
          pin: rwfPin,
          crypto_asset: rwfFinalAsset,
          crypto_network: rwfFinalNetwork,
          network_code: rwfFinalNetworkCode,
          network_name: rwfFinalNetworkName,
          phone_number: rwfFinalPhone,
          sell_amount: rwfFinalSellAmount,
          total_crypto_usd: rwfFinalTotal,
          rate: rwfFinalRate,
          org_rate_id: rwfFinalOrgRateId,
        } = data as Record<string, string | undefined>;

        if (!rwfPin || !rwfFinalAsset || !rwfFinalNetwork || !rwfFinalNetworkCode || !rwfFinalPhone || !rwfFinalSellAmount) {
          return { screen: "RWF_AUTHORIZE", data: { ...data, error_message: "Missing required transaction details.", has_error: true } };
        }
        return executePcxOfframp({
          screenId: "RWF_AUTHORIZE", tag: "[OFFRAMP-RWF]",
          data: data as Record<string, unknown>, phone,
          pin: rwfPin, cryptoAsset: rwfFinalAsset, cryptoNetwork: rwfFinalNetwork,
          totalCryptoUsd: rwfFinalTotal || "0", fiatCurrency: "RWF",
          fiatAmount: rwfFinalSellAmount, clientRate: rwfFinalRate || "0",
          orgRateId: rwfFinalOrgRateId || "", country: "RW",
          paymentMethod: "mobile_money",
          beneficiaryName: rwfFinalNetworkName || rwfFinalPhone,
          destination: { provider: rwfFinalNetworkCode, phoneNumber: rwfFinalPhone } as PCXMobileMoneyDestination,
          idempKeySuffix: `${rwfFinalSellAmount}:${rwfFinalNetworkCode}:${rwfFinalPhone}`,
          displayAmount: `RWF ${rwfFinalSellAmount}`,
          displayAccount: rwfFinalPhone,
        });
      }

      // ─────────────────────────────────────────────────────────────
      // ZAR SCREENS — South Africa bank transfer via PCXPay
      // ─────────────────────────────────────────────────────────────

      case "ZAR_DETAILS": {
        const {
          crypto_asset: zarAssetRaw,
          crypto_network: zarNetworkRaw,
          bank_code: zarBankCode,
          account_number: zarAccountNumber,
          sell_amount: zarSellAmount,
        } = data as {
          crypto_asset?: string;
          crypto_network?: string;
          bank_code?: string;
          account_number?: string;
          sell_amount?: string;
        };

        // Validation helper — refetches banks on error
        const zarBanksOnError = async () => {
          let b: { id: string; title: string }[] = [];
          try {
            const raw = await fetchPcxPayNetworks("ZA");
            const seen = new Set<string>();
            b = raw
              .filter((n) => { if (seen.has(n.id)) return false; seen.add(n.id); return true; })
              .map((n) => ({ id: n.id, title: n.title }));
          } catch { /* use empty */ }
          return b;
        };

        if (!zarAssetRaw || !zarNetworkRaw || !zarBankCode || !zarAccountNumber || !zarSellAmount) {
          return {
            screen: "ZAR_DETAILS",
            data: { banks: await zarBanksOnError(), has_error: true, error_message: "Please fill in all required fields." },
          };
        }

        const zarFiatInput = parseFloat(zarSellAmount);
        if (isNaN(zarFiatInput) || zarFiatInput < 100) {
          return {
            screen: "ZAR_DETAILS",
            data: { banks: await zarBanksOnError(), has_error: true, error_message: "Minimum withdrawal amount is ZAR 100." },
          };
        }

        // Validate asset + chain combination
        const zarAsset = zarAssetRaw.toUpperCase();
        const zarChainKey = zarNetworkRaw.toLowerCase();
        // USDC: BASE, ERC20, POLYGON, OPTIMISM, ARBITRUM, SOL, AVALANCHE
        // USDT: ERC20, POLYGON, SOL, AVALANCHE
        const zarUsdcChains = ["base", "erc20", "polygon", "optimism", "arbitrum", "sol", "solana", "avalanche"];
        const zarUsdtChains = ["erc20", "polygon", "sol", "solana", "avalanche"];
        const zarSupported =
          (zarAsset === "USDC" && zarUsdcChains.includes(zarChainKey)) ||
          (zarAsset === "USDT" && zarUsdtChains.includes(zarChainKey));

        if (!zarSupported) {
          return {
            screen: "ZAR_DETAILS",
            data: {
              banks: await zarBanksOnError(),
              has_error: true,
              error_message: `${zarAsset} is not supported on ${zarNetworkRaw}. USDC: BASE/ERC20/POLYGON/OPTIMISM/ARBITRUM/SOL/AVALANCHE. USDT: ERC20/POLYGON/SOL/AVALANCHE`,
            },
          };
        }

        // Fetch live USD→ZAR rate
        let zarRate: number;
        let zarOrgRateId: string;
        try {
          const rateData = await fetchPcxPayUsdRate("ZAR");
          zarRate = rateData.rate;
          zarOrgRateId = rateData.orgRateId;
          logger.info(`[OFFRAMP-ZAR] Live rate: 1 USD = ${zarRate} ZAR`);
        } catch (rateError) {
          logger.error("[OFFRAMP-ZAR] Rate fetch failed: " + (rateError as Error).message);
          return {
            screen: "ZAR_DETAILS",
            data: { banks: await zarBanksOnError(), has_error: true, error_message: "Could not fetch current exchange rate. Please try again." },
          };
        }

        // ZAR fiat → USD crypto cost
        const zarCryptoCostUsd = zarFiatInput / zarRate;
        const zarFormattedCryptoCost = zarCryptoCostUsd.toFixed(6).replace(/\.?0+$/, "") || "0.00";

        // Resolve bank name from code
        let zarBankName = zarBankCode;
        try {
          const allBanks = await fetchPcxPayNetworks("ZA");
          const found = allBanks.find((b) => b.id === zarBankCode);
          if (found) zarBankName = found.title;
        } catch { /* keep code as name */ }

        // Resolve account name via Paystack
        let zarAccountName: string;
        try {
          const resolved = await resolvePaystackAccount(zarAccountNumber, zarBankCode);
          zarAccountName = resolved.accountName;
          logger.info(`[OFFRAMP-ZAR] Resolved account: ${zarAccountName}`);
        } catch (resolveErr: any) {
          logger.error("[OFFRAMP-ZAR] Paystack resolution failed: " + resolveErr.message);
          return {
            screen: "ZAR_DETAILS",
            data: {
              banks: await zarBanksOnError(),
              has_error: true,
              error_message: resolveErr.message || "Could not verify account. Please check the account number and bank.",
            },
          };
        }

        return {
          screen: "ZAR_REVIEW",
          data: {
            crypto_asset: zarAsset,
            crypto_network: zarNetworkRaw.toUpperCase(),
            bank_code: zarBankCode,
            bank_name: zarBankName,
            account_number: zarAccountNumber,
            account_name: zarAccountName,
            sell_amount: zarFiatInput.toLocaleString("en-ZA", { maximumFractionDigits: 2 }),
            crypto_cost: zarFormattedCryptoCost,
            rate: zarRate.toFixed(2),
            org_rate_id: zarOrgRateId,
            has_error: false,
            error_message: "",
          },
        };
      }

      case "ZAR_REVIEW": {
        const {
          crypto_asset: zarRevAsset,
          crypto_network: zarRevNetwork,
          bank_code: zarRevBankCode,
          bank_name: zarRevBankName,
          account_number: zarRevAccountNumber,
          account_name: zarRevAccountName,
          sell_amount: zarRevSellAmount,
          crypto_cost: zarRevCryptoCost,
          rate: zarRevRate,
          org_rate_id: zarRevOrgRateId,
        } = data as Record<string, string | undefined>;

        const flatFeeUsd = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
        const zarCostNum = parseFloat(zarRevCryptoCost || "0");
        const zarTotal = (zarCostNum + flatFeeUsd).toFixed(6).replace(/\.?0+$/, "") || "0.00";

        return {
          screen: "ZAR_AUTHORIZE",
          data: {
            crypto_asset: zarRevAsset || "USDC",
            crypto_network: zarRevNetwork || "",
            bank_code: zarRevBankCode || "",
            bank_name: zarRevBankName || "",
            account_number: zarRevAccountNumber || "",
            account_name: zarRevAccountName || "",
            sell_amount: zarRevSellAmount || "0",
            crypto_cost: zarRevCryptoCost || "0",
            rate: zarRevRate || "0",
            org_rate_id: zarRevOrgRateId || "",
            total_crypto_usd: zarTotal,
            has_error: false,
            error_message: "",
          },
        };
      }

      case "ZAR_AUTHORIZE": {
        const {
          pin: zarPin,
          crypto_asset: zarFinAsset,
          crypto_network: zarFinNetwork,
          bank_code: zarFinBankCode,
          bank_name: zarFinBankName,
          account_number: zarFinAccountNumber,
          account_name: zarFinAccountName,
          sell_amount: zarFinSellAmount,
          total_crypto_usd: zarFinTotal,
          rate: zarFinRate,
          org_rate_id: zarFinOrgRateId,
        } = data as Record<string, string | undefined>;

        if (!zarPin || !zarFinAsset || !zarFinNetwork || !zarFinBankCode || !zarFinAccountNumber || !zarFinAccountName || !zarFinSellAmount) {
          return { screen: "ZAR_AUTHORIZE", data: { ...data, error_message: "Missing required transaction details.", has_error: true } };
        }
        return executePcxOfframp({
          screenId: "ZAR_AUTHORIZE", tag: "[OFFRAMP-ZAR]",
          data: data as Record<string, unknown>, phone,
          pin: zarPin, cryptoAsset: zarFinAsset, cryptoNetwork: zarFinNetwork,
          totalCryptoUsd: zarFinTotal || "0", fiatCurrency: "ZAR",
          fiatAmount: zarFinSellAmount, clientRate: zarFinRate || "0",
          orgRateId: zarFinOrgRateId || "", country: "ZA",
          paymentMethod: "bank_transfer",
          beneficiaryName: zarFinAccountName,
          destination: { accountNumber: zarFinAccountNumber, bankCode: zarFinBankCode, bankName: zarFinBankName || zarFinBankCode } as PCXBankTransferDestination,
          idempKeySuffix: `${zarFinSellAmount}:${zarFinBankCode}:${zarFinAccountNumber}`,
          displayAmount: `ZAR ${zarFinSellAmount}`,
          displayAccount: zarFinAccountNumber,
        });
      }

      default:
        break;
    }
  }

  logger.error("Unhandled request body: " + JSON.stringify(decryptedBody));
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
  );
};
