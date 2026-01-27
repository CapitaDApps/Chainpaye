import { sendOfframpSuccessNotification } from "../../commands/handlers/offrampHandler";
import { userService } from "../../services";
import { crossmintService } from "../../services/CrossmintService";
import { dexPayService } from "../../services/DexPayService";
import { redisClient } from "../../services/redis";

type Network = "bsc" | "sol" | "eth" | "poly" | "trx" | "base";

// Fallback banks in case API fails
const FALLBACK_BANKS = [
  { id: "000014", title: "Access Bank" },
  { id: "000013", title: "GTBank" },
  { id: "000015", title: "Zenith Bank" },
  { id: "999992", title: "Opay" },
  { id: "090267", title: "Kuda Bank" },
];

export const getCryptoTopUpScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;

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
    console.warn("Received client error:", data);
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
      console.log("DEBUG: Fetched banks from DexPay API:", banks.length);
    } catch (error) {
      console.error("DEBUG: Error fetching banks, using fallback:", error);
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
          console.error("Missing required fields", data);
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

        // Resolve bank name from bank code
        let bankName = "Bank";
        try {
          const dexPayBanks = await dexPayService.getBanks();
          const foundBank = dexPayBanks.find((b) => b.code === bank_code);
          if (foundBank) {
            bankName = foundBank.name;
          }
        } catch (error) {
          console.error("DEBUG: Error resolving bank name:", error);
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
        } catch (error: any) {
          console.error("DEBUG: Error resolving account name:", error);
          let banks = FALLBACK_BANKS;
          try {
            const dexPayBanks = await dexPayService.getBanks();
            if (dexPayBanks && dexPayBanks.length > 0) {
              banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
            }
          } catch {
            // Use fallback
          }

          const errorMsg = error.message?.includes("not found")
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

        return {
          screen: "OFFRAMP_FIAT_REVIEW",
          data: {
            currency,
            network,
            sell_amount,
            bank_name: bankName,
            bank_code,
            account_number,
            recipient_name: recipientName,
            recipientName: recipientName, // Store for next step
          },
        };
      }

      case "OFFRAMP_FIAT_REVIEW": {
        // Just transitioning to the next review screen
        // Echoing data back
        return {
          screen: "OFFRAMP_CRYPTO_REVIEW",
          data: {
            ...data,
          },
        };
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

        const user = await userService.getUser(phone, true);
        if (!user) {
          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              ...data,
              error_message: "User not found.",
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
            },
          };
        }

        try {
          // 1. NORMALIZE CHAIN NAMES
          // Map frontend network codes to proper format
          let dexPayChain = network.toLowerCase(); // Keep lowercase for DexPay
          let crossmintChain = network.toLowerCase();

          // Normalize chain names
          const chainMapping: Record<
            string,
            { dexPay: string; crossmint: string }
          > = {
            sol: { dexPay: "solana", crossmint: "solana" },
            bsc: { dexPay: "bep20", crossmint: "bsc" },
            eth: { dexPay: "ethereum", crossmint: "ethereum" },
            poly: { dexPay: "polygon", crossmint: "polygon" },
            matic: { dexPay: "polygon", crossmint: "polygon" },
            trx: { dexPay: "tron", crossmint: "tron" },
            base: { dexPay: "base", crossmint: "base" },
            arbitrum: { dexPay: "arbitrum", crossmint: "arbitrum" },
            hedera: { dexPay: "hedera", crossmint: "hedera" },
            apechain: { dexPay: "apechain", crossmint: "apechain" },
            lisk: { dexPay: "lisk", crossmint: "lisk" },
          };

          const normalizedChain = chainMapping[network.toLowerCase()];
          if (!normalizedChain) {
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `Unsupported network: ${network}`,
              },
            };
          }

          dexPayChain = normalizedChain.dexPay;
          crossmintChain = normalizedChain.crossmint;

          console.log(
            `Chain mapping: ${network} -> DexPay: ${dexPayChain}, Crossmint: ${crossmintChain}`,
          );

          // 2. VERIFY ASSET-CHAIN COMBINATION
          const normalizedAsset = currency.toLowerCase();
          if (
            !dexPayService.isSupportedAssetChain(normalizedAsset, dexPayChain)
          ) {
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `${currency.toUpperCase()} is not supported on ${dexPayChain.toUpperCase()}`,
              },
            };
          }

          // 3. GET WALLET BALANCE FIRST
          const chainType = crossmintService.getChainType(crossmintChain);
          let balances: any[] = [];

          if (chainType === "solana") {
            balances = await crossmintService.getBalancesByChain(
              user.userId,
              crossmintChain,
              ["usdc", "sol"],
            );
          } else {
            balances = await crossmintService.getBalancesByChain(
              user.userId,
              crossmintChain,
              ["usdc", "usdt"],
            );
          }

          console.log(
            `DEBUG: Balances for ${crossmintChain}:`,
            JSON.stringify(balances, null, 2),
          );

          const assetBalance = balances.find(
            (b) => b.token?.toLowerCase() === normalizedAsset,
          );
          const currentBalance = assetBalance
            ? parseFloat(assetBalance.amount)
            : 0;

          console.log(
            `Current balance for ${normalizedAsset} on ${crossmintChain}: ${currentBalance}`,
          );

          if (currentBalance === 0) {
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `No ${currency.toUpperCase()} balance found on ${network.toUpperCase()}. Please deposit first.`,
              },
            };
          }

          // 4. RESOLVE ACCOUNT NAME (if missing)
          let finalRecipientName = recipientName;
          if (
            !finalRecipientName ||
            finalRecipientName === "Beneficiary" ||
            finalRecipientName === "Account Holder"
          ) {
            try {
              console.log("Resolving account details for quote...");
              const resolved = await dexPayService.resolveAccount(
                account_number,
                bank_code,
              );
              finalRecipientName = resolved.accountName;
              console.log("Resolved account name:", finalRecipientName);
            } catch (resolveError) {
              console.error("Could not resolve account name:", resolveError);
              return {
                screen: "OFFRAMP_CRYPTO_REVIEW",
                data: {
                  ...data,
                  error_message:
                    "Could not verify account details. Please try again.",
                },
              };
            }
          }

          // Normalize name (remove extra spaces)
          finalRecipientName = finalRecipientName.trim().replace(/\s+/g, " ");

          // 5. GET RECEIVING ADDRESS
          const receivingAddress =
            dexPayService.getReceivingAddress(dexPayChain);
          console.log(
            `Receiving address for ${dexPayChain}: ${receivingAddress}`,
          );

          // 6. CREATE QUOTE REQUEST
          const ngnAmount = parseFloat(sell_amount);
          const quoteRequest = {
            fiatAmount: ngnAmount.toString(), // Send as string
            asset: normalizedAsset.toUpperCase(), // USDC, USDT
            chain: dexPayChain, // lowercase: solana, bep20, etc.
            type: "SELL" as const,
            bankCode: bank_code,
            accountName: finalRecipientName,
            accountNumber: account_number,
            receivingAddress: receivingAddress,
          };

          console.log("Quote request:", JSON.stringify(quoteRequest, null, 2));

          // 7. GET QUOTE
          const quote = await dexPayService.getQuote(quoteRequest);
          console.log("Quote received:", JSON.stringify(quote, null, 2));

          // 8. CALCULATE TOTAL FEES
          const fees = dexPayService.calculateFees(ngnAmount, quote.rate);
          const feesInCrypto = fees.totalFees / quote.rate;
          const networkFeeInCrypto = quote.fees?.networkFee || 0;
          const totalCryptoRequired =
            quote.cryptoAmount + feesInCrypto + networkFeeInCrypto;

          console.log(`Fee calculation:
      - NGN Amount: ${ngnAmount}
      - Quote Rate: ${quote.rate}
      - Crypto Amount: ${quote.cryptoAmount}
      - Platform Fees: ${fees.totalFees} NGN (${feesInCrypto} ${normalizedAsset})
      - Network Fee: ${networkFeeInCrypto} ${normalizedAsset}
      - Total Required: ${totalCryptoRequired} ${normalizedAsset}
      - Current Balance: ${currentBalance} ${normalizedAsset}
    `);

          // 9. CHECK IF SUFFICIENT BALANCE
          if (currentBalance < totalCryptoRequired) {
            const shortfall = totalCryptoRequired - currentBalance;
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `Insufficient balance. You need ${totalCryptoRequired.toFixed(6)} ${currency.toUpperCase()} but have ${currentBalance.toFixed(6)}. Please deposit ${shortfall.toFixed(6)} more ${currency.toUpperCase()}.`,
              },
            };
          }

          // 10. TRANSFER TOKENS
          console.log(
            `Transferring ${totalCryptoRequired} ${normalizedAsset} on ${crossmintChain}...`,
          );

          const transferResult = await crossmintService.transferTokens(
            user.userId,
            chainType,
            normalizedAsset,
            totalCryptoRequired.toString(),
            receivingAddress,
          );

          console.log(
            "Transfer successful:",
            JSON.stringify(transferResult, null, 2),
          );

          // 11. COMPLETE OFF-RAMP
          console.log(`Completing offramp for quote ${quote.id}...`);
          const offrampResult = await dexPayService.completeOfframp(quote.id);
          console.log(
            "Offramp completed:",
            JSON.stringify(offrampResult, null, 2),
          );

          // 12. SEND SUCCESS NOTIFICATION (non-blocking)
          sendOfframpSuccessNotification(
            phone,
            ngnAmount,
            quote.cryptoAmount,
            currency,
            bank_name,
            finalRecipientName,
            quote.id,
          ).catch((err) =>
            console.error("Error sending success notification:", err),
          );

          return {
            screen: "OFFRAMP_SUCCESS",
            data: {},
          };
        } catch (error: any) {
          console.error("Error processing crypto offramp:", error);
          console.error("Error stack:", error.stack);

          let errorMessage =
            error.message || "Transaction failed. Please try again.";

          // Better error messages
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
          }

          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              ...data,
              error_message: errorMessage,
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

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
  );
};
