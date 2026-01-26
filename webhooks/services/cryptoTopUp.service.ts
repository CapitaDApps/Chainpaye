import { sendOfframpSuccessNotification } from "../../commands/handlers/offrampHandler";
import { userService } from "../../services";
import { crossmintService } from "../../services/CrossmintService";
import { dexPayService } from "../../services/DexPayService";
import { redisClient } from "../../services/redis";
import { ToronetService } from "../../services/ToronetService";

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

  const localToronetService = new ToronetService();

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
      const ngnBanks = await localToronetService.getBankListNGN();
      if (ngnBanks && ngnBanks.length > 0) {
        banks = ngnBanks;
      }
      console.log("DEBUG: Fetched banks from API:", banks.length);
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
        banks = await localToronetService.getBankListNGN();
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
            banks = await localToronetService.getBankListNGN();
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
            banks = await localToronetService.getBankListNGN();
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
          const ngnBanks = await localToronetService.getBankListNGN();
          const foundBank = ngnBanks.find((b) => b.id === bank_code);
          if (foundBank) {
            bankName = foundBank.title;
          }
        } catch (error) {
          console.error("DEBUG: Error resolving bank name:", error);
        }

        // Resolve recipient name from account number
        let recipientName = "Account Holder";
        try {
          const resolvedName =
            await localToronetService.resolveBankAccountNameNGN(
              account_number,
              bank_code,
            );
          if (resolvedName) {
            recipientName = resolvedName;
          }
        } catch (error) {
          console.error("DEBUG: Error resolving account name:", error);
          // Don't fail, just use placeholder
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

        // Create quote request
        try {
          // 1. Get Quote
          const quoteRequest = {
            fiatAmount: sell_amount.toString(),
            asset: currency.toLowerCase(),
            chain: network.toLowerCase(),
            type: "SELL" as const,
            bankCode: bank_code,
            accountName: recipientName || "Beneficiary", // Use extracted name or fallback
            accountNumber: account_number,
            receivingAddress: dexPayService.getReceivingAddress(network),
          };

          console.log(`Getting quote for offramp logic...`, quoteRequest);
          const quote = await dexPayService.getQuote(quoteRequest);

          // 2. Calculate Fees
          const fees = dexPayService.calculateFees(
            parseFloat(sell_amount),
            quote.rate,
          );
          const feesInCrypto = fees.totalFees / quote.rate;
          const totalCryptoRequired =
            quote.cryptoAmount + feesInCrypto + (quote.fees?.networkFee || 0);

          // 3. Check Balance
          const chainType = crossmintService.getChainType(network);
          let balances: any[] = [];

          if (chainType === "solana") {
            balances = await crossmintService.getBalancesByChain(
              user.userId,
              network,
              ["usdc", "sol"],
            );
          } else {
            balances = await crossmintService.getBalancesByChain(
              user.userId,
              network,
              ["usdc", "usdt"],
            );
          }

          const assetBalance = balances.find(
            (b) => b.token.toLowerCase() === currency.toLowerCase(),
          );
          const currentBalance = assetBalance
            ? parseFloat(assetBalance.amount)
            : 0;

          console.log(
            `Balance check: Required ${totalCryptoRequired}, Available ${currentBalance}`,
          );

          if (currentBalance < totalCryptoRequired) {
            return {
              screen: "OFFRAMP_CRYPTO_REVIEW",
              data: {
                ...data,
                error_message: `Insufficient balance. You need ${totalCryptoRequired.toFixed(6)} ${currency} but have ${currentBalance.toFixed(6)}.`,
              },
            };
          }

          // 4. Transfer Tokens
          console.log(
            `Transferring ${totalCryptoRequired} ${currency} on ${network}...`,
          );
          const transferResult = await crossmintService.transferTokens(
            user.userId,
            chainType,
            currency,
            totalCryptoRequired.toString(),
            quoteRequest.receivingAddress,
          );
          console.log(`Transfer successful:`, transferResult);

          // 5. Complete Off-ramp
          console.log(`Completing offramp for quote ${quote.id}...`);
          const offrampResult = await dexPayService.completeOfframp(quote.id);
          console.log(`Offramp completed:`, offrampResult);

          // 6. Send Notification
          // We don't await this to avoid delaying the UI response
          sendOfframpSuccessNotification(
            phone,
            parseFloat(sell_amount),
            quote.cryptoAmount,
            currency,
            bank_name,
            recipientName || "Beneficiary",
            quote.id,
          ).catch((err) =>
            console.error("Error sending success notification:", err),
          );

          return {
            screen: "OFFRAMP_SUCCESS",
            data: {},
          };
        } catch (error: any) {
          console.error("Error processing crypto top-up offramp:", error);
          return {
            screen: "OFFRAMP_CRYPTO_REVIEW",
            data: {
              ...data,
              error_message:
                error.message || "Transaction failed. Please try again.",
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
