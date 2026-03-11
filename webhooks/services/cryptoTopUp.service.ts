import { sendOfframpSuccessNotification } from "../../commands/handlers/offrampHandler";
import { userService } from "../../services";
import {
  CrossmintBalance,
  crossmintService,
} from "../../services/CrossmintService";
import { financialService } from "../../services/crypto-off-ramp/FinancialService";
import { dexPayService } from "../../services/DexPayService";
import { redisClient } from "../../services/redis";
import { logger } from "../../utils/logger";

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

/**
 * Process DexPay quote and completion in background after transfer succeeds
 * This allows us to return success screen immediately without waiting
 */
async function processOfframpInBackground(
  userId: string,
  phone: string,
  ngnAmount: number,
  normalizedAsset: string,
  dexPayChain: string,
  bank_code: string,
  finalRecipientName: string,
  account_number: string,
  receivingAddress: string,
  currency: string,
  bank_name: string,
  totalInUsd: number,
  dexPayService: any,
  idempotencyKey?: string,
): Promise<void> {
  try {
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
      receivingAddress: receivingAddress,
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

    logger.info("[OFFRAMP-BG] Background processing completed successfully!");
  } catch (error) {
    logger.error(
      "[OFFRAMP-BG] Background processing failed: " +
        (error as Error).message,
    );
    console.log("\n❌ [Background] Processing failed:");
    console.log((error as Error).message);
    console.log("========================================\n");
    
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
    // Fetch banks from backend with fallback
    let banks = FALLBACK_BANKS;
    try {
      const dexPayBanks = await dexPayService.getBanks();
      if (dexPayBanks && dexPayBanks.length > 0) {
        banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
      }
      logger.info("DEBUG: Fetched banks from DexPay API: " + banks.length);
    } catch (error) {
      logger.error(
        "DEBUG: Error fetching banks, using fallback: " +
          (error as Error).message,
      );
    }

    return {
      screen: "OFFRAMP_DETAILS",
      data: {
        banks: banks,
      },
    };
  }

  if (action === "data_exchange") {
    if (!userPhone) {
      // Fetch banks again for error screen
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
          error_message: "Session expired. Please restart the flow.",
        },
      };
    }

    // handle the request based on the current screen
    switch (screen) {
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
          // Aliases
          bep20: "bep20",
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
              error_message: `Unsupported network: ${network}. Supported: BSC, SOL, BASE, ARBITRUM`,
            },
          };
        }

        // Validate Asset + Chain Combinations
        const normalizedAsset = currency.toUpperCase();
        const chainKey = network.toLowerCase();
        let isSupportedCombination = false;

        if (normalizedAsset === "USDC") {
          // USDC supported on all 4 chains
          if (["sol", "bsc", "base", "arbitrum", "bep20"].includes(chainKey)) {
            isSupportedCombination = true;
          }
        } else if (normalizedAsset === "USDT") {
          // USDT only supported on BSC and SOL
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
              error_message: `${normalizedAsset} is not supported on ${network}. Supported: BSC (USDC/USDT), SOL (USDC/USDT), BASE (USDC), ARBITRUM (USDC)`,
            },
          };
        }

        const ngnAmount = parseFloat(sell_amount) || 1000;
        let rateDisplay = "Current market rate"; // Fallback
        let sellAmountUsd = "0.00"; // Amount in USD (excluding fees)

        try {
          const rateData = await dexPayService.getCurrentRates(
            currency,
            dexPayChain,
            ngnAmount,
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
          };

          const normalizedChain = chainMapping[network.toLowerCase()];
          if (!normalizedChain) {
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `Unsupported network: ${network}. Supported: BEP20, SOL, BASE, ARBITRUM`,
                has_error: true,
              },
            };
          }

          // Validate Asset + Chain Combinations
          const normalizedAsset = currency.toUpperCase(); // Ensure uppercase for comparison
          const chainKey = network.toLowerCase();
          // Note: chainKey might be 'sol', 'solana', 'bsc', 'bep20', 'base', 'arbitrum'

          let isSupportedCombination = false;

          if (normalizedAsset === "USDC") {
            // USDC supported on all 4 chains
            if (
              ["sol", "solana", "bsc", "bep20", "base", "arbitrum"].includes(chainKey)
            ) {
              isSupportedCombination = true;
            }
          } else if (normalizedAsset === "USDT") {
            // USDT supported on BEP20, SOL, and ARBITRUM
            if (["sol", "solana", "bsc", "bep20", "arbitrum"].includes(chainKey)) {
              isSupportedCombination = true;
            }
          }

          if (!isSupportedCombination) {
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `${normalizedAsset} is not supported on ${network}. Supported: BEP20 (USDC/USDT), SOL (USDC/USDT), BASE (USDC), ARBITRUM (USDC/USDT)`,
                has_error: true,
              },
            };
          }

          const dexPayChain = normalizedChain.dexPay;
          const crossmintChain = normalizedChain.crossmint;

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
              currency,
              dexPayChain,
              ngnAmount,
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

          const transferResult = await crossmintService.transferTokens({
            walletAddress: wallet.address,
            token: `${crossmintChain}:${normalizedAsset.toLowerCase()}`,
            recipient: receivingAddress,
            amount: totalCryptoRequired.toString(),
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
            normalizedAsset,
            dexPayChain,
            bank_code,
            finalRecipientName || "Beneficiary",
            account_number,
            receivingAddress,
            currency || "USDT",
            bank_name || "Bank",
            financials.totalInUsd,
            dexPayService,
            idempotencyKey, // Pass idempotency key for completion tracking
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

      default:
        break;
    }
  }

  logger.error("Unhandled request body: " + JSON.stringify(decryptedBody));
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
  );
};
