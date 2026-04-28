import { Types } from "mongoose";
import { nanoid } from "nanoid";
import { TransactionStatus } from "../../models/Transaction";
import { redisClient } from "../../services/redis";
import { ToronetService } from "../../services/ToronetService";
import { TransactionService } from "../../services/TransactionService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { sendTransactionReceipt } from "../../utils/sendReceipt";

export async function getImagePaymentFlowScreen(decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) {
  const { screen, data, action, flow_token } = decryptedBody;

  if (action === "ping") {
    return { data: { status: "active" } };
  }

  if (data?.error) {
    console.warn("Received client error:", data);
    return { data: { status: "Error", acknowledged: true } };
  }

  // INIT: the flow was opened with pre-populated data injected via flow_action_payload.data
  // WhatsApp passes that data back on INIT so we just forward to CONFIRM_DETAILS
  if (action === "INIT") {
    return {
      screen: "CONFIRM_DETAILS",
      data: {
        accountNumber: data.accountNumber || "",
        accountName: data.accountName || "",
        bankName: data.bankName || "",
        bankCode: data.bankCode || "",
        amount: data.amount || "",
        currency: data.currency || "NGN",
      },
    };
  }

  if (action === "data_exchange") {
    const userPhone = await redisClient.get(flow_token);
    if (!userPhone) {
      return {
        screen: "PIN",
        data: { error_message: "Session expired. Please send the image again." },
      };
    }

    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    // Handle payment method selection
    if (screen === "SELECT_METHOD") {
      const { paymentMethod, accountNumber, accountName, bankName, bankCode, amount, currency } = data;

      if (paymentMethod === "transfer") {
        // Go directly to PIN for transfer
        return {
          screen: "PIN",
          data: {
            accountNumber,
            accountName,
            bankName,
            bankCode,
            amount,
            currency,
            paymentMethod: "transfer",
            pinMessage: `Enter PIN to send ₦${amount} to ${accountName} at ${bankName}`,
          },
        };
      } else if (paymentMethod === "offramp") {
        // Go to crypto selection screen
        return {
          screen: "SELECT_CRYPTO",
          data: {
            accountNumber,
            accountName,
            bankName,
            bankCode,
            amount,
            currency,
          },
        };
      }
    }

    // Handle crypto selection and rate fetching
    if (screen === "SELECT_CRYPTO") {
      const { asset, network, accountNumber, accountName, bankName, bankCode, amount, currency } = data;

      if (!asset || !network) {
        return {
          screen: "SELECT_CRYPTO",
          data: {
            ...data,
            error_message: "Please select both asset and network.",
            has_error: true,
          },
        };
      }

      // Validate asset-network combination
      const normalizedAsset = asset.toUpperCase();
      const chainKey = network.toLowerCase();
      let isSupportedCombination = false;

      if (normalizedAsset === "USDC") {
        if (["sol", "bsc", "base", "arbitrum", "bep20", "stellar"].includes(chainKey)) {
          isSupportedCombination = true;
        }
      } else if (normalizedAsset === "USDT") {
        // USDT is NOT supported on Stellar
        if (["sol", "bsc", "bep20", "arbitrum"].includes(chainKey)) {
          isSupportedCombination = true;
        }
      }

      if (!isSupportedCombination) {
        return {
          screen: "SELECT_CRYPTO",
          data: {
            ...data,
            error_message: `${normalizedAsset} is not supported on ${network}. Stellar only supports USDC. Other networks support USDC/USDT.`,
            has_error: true,
          },
        };
      }

      // Map network to DexPay chain format
      const chainMapping: Record<string, string> = {
        sol: "solana",
        bsc: "bep20",
        base: "base",
        arbitrum: "arbitrum",
        stellar: "stellar",
        bep20: "bep20",
        solana: "solana",
      };

      const dexPayChain = chainMapping[chainKey];
      
      if (!dexPayChain) {
        return {
          screen: "SELECT_CRYPTO",
          data: {
            ...data,
            error_message: `Unsupported network: ${network}. Please select a valid network.`,
            has_error: true,
          },
        };
      }

      // For Stellar: rate fetch uses USDT on BSC since that's what DexPay will quote
      const isStellar = dexPayChain === "stellar";
      const rateQueryAsset = isStellar ? "USDT" : (asset || "USDC");
      const rateQueryChain = isStellar ? "bep20" : dexPayChain;

      // Get exchange rate from DexPay
      const dexPayService = new (await import("../../services/DexPayService")).DexPayService();
      
      try {
        const ngnAmount = parseFloat(amount);
        const rateData = await dexPayService.getCurrentRates(rateQueryAsset, rateQueryChain, ngnAmount);
        
        if (!rateData || !rateData.rate || rateData.rate <= 0) {
          return {
            screen: "SELECT_CRYPTO",
            data: {
              ...data,
              error_message: "Could not fetch exchange rate. Please try again.",
              has_error: true,
            },
          };
        }

        // Apply spread to the rate
        const spreadNgn = parseFloat(process.env.OFFRAMP_SPREAD_NGN || "60");
        const spreadRate = rateData.rate - spreadNgn;
        
        // Calculate USD amount (excluding fees) using spread rate
        const usdAmount = ngnAmount / spreadRate;
        const sellAmountUsd = usdAmount.toFixed(6).replace(/\.?0+$/, '');
        
        // Format rate with comma separators and Naira symbol
        const rateDisplay = `₦${spreadRate.toLocaleString("en-NG", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })}`;

        return {
          screen: "REVIEW_CRYPTO",
          data: {
            accountNumber,
            accountName,
            bankName,
            bankCode,
            amount,
            currency,
            asset: normalizedAsset,
            network,
            sellAmount: sellAmountUsd,
            rate: rateDisplay,
          },
        };
      } catch (error) {
        console.error("Error fetching rate:", error);
        return {
          screen: "SELECT_CRYPTO",
          data: {
            ...data,
            error_message: "Failed to fetch exchange rate. Please try again.",
            has_error: true,
          },
        };
      }
    }

    // Handle review crypto confirmation - go to PIN screen
    if (screen === "REVIEW_CRYPTO") {
      const { accountNumber, accountName, bankName, bankCode, amount, currency, asset, network, sellAmount, rate } = data;

      return {
        screen: "PIN",
        data: {
          accountNumber,
          accountName,
          bankName,
          bankCode,
          amount,
          currency,
          asset,
          network,
          sellAmount,
          rate,
          paymentMethod: "offramp",
          pinMessage: `Enter PIN to sell ${sellAmount} ${asset} and send ₦${amount} to ${accountName}`,
        },
      };
    }

    if (screen === "PIN") {
      const { pin, accountNumber, accountName, bankName, bankCode, amount, currency, paymentMethod, asset, network, sellAmount, rate } = data;

      // Validate required fields
      if (!pin || !accountNumber || !accountName || !bankName || !bankCode || !amount || !paymentMethod) {
        return {
          screen: "PIN",
          data: {
            ...data,
            error_message: "Missing required payment information. Please try again.",
            has_error: true,
          },
        };
      }

      // Validate amount is a positive number
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        return {
          screen: "PIN",
          data: {
            ...data,
            error_message: "Invalid amount. Please enter a valid positive number.",
            has_error: true,
          },
        };
      }

      // Validate account number format (10 digits for Nigerian banks)
      if (!/^\d{10}$/.test(accountNumber)) {
        return {
          screen: "PIN",
          data: {
            ...data,
            error_message: "Invalid account number. Must be 10 digits.",
            has_error: true,
          },
        };
      }

      const userService = new UserService();
      const toronetService = new ToronetService();
      const whatsappBusinessService = new WhatsAppBusinessService();

      const { user, wallet } = await userService.getUserToroWallet(phone, true, true);

      // Verify PIN
      const isValidPin = await user.comparePin(pin);
      if (!isValidPin) {
        return {
          screen: "PIN",
          data: {
            ...data,
            error_message: "Incorrect PIN. Please try again.",
            has_error: true,
          },
        };
      }

      if (paymentMethod === "transfer") {
        // Check balance
        const balanceNGN = await toronetService.getBalanceNGN(wallet.publicKey);
        if (+balanceNGN.balance < +amount) {
          return {
            screen: "PIN",
            data: {
              ...data,
              error_message: `Insufficient balance. Available: ₦${balanceNGN.balance.toFixed(2)}`,
              has_error: true,
            },
          };
        }

        const withdrawalNanoId = nanoid();

        // Process withdrawal asynchronously — return success screen immediately
        toronetService
          .withdraw({
            userAddress: wallet.publicKey,
            password: wallet.password,
            bankName,
            routingNo: bankCode,
            accountName,
            accoountNo: accountNumber,
            phoneNumber: phone,
            amount,
            currency: currency || "NGN",
            fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          })
          .then(async (withdrawalResp) => {
            if (withdrawalResp.success) {
              const tx = await TransactionService.recordWithdrawal({
                fromUser: user._id as Types.ObjectId,
                amount,
                status: TransactionStatus.COMPLETED,
                refId: withdrawalResp.data?.paymentReference!,
                toronetTxId: `TXID_${withdrawalResp.hash}`,
                currency: "NGN",
                bankDetails: { accountName, bankName, accountNumber, routingNumber: bankCode },
              });

              await sendTransactionReceipt((tx._id as Types.ObjectId).toString(), phone);
            } else {
              const tx = await TransactionService.recordWithdrawal({
                fromUser: user._id as Types.ObjectId,
                amount,
                status: TransactionStatus.FAILED,
                refId: withdrawalNanoId,
                toronetTxId: `TXID_${withdrawalNanoId}`,
                currency: "NGN",
                failureReason: withdrawalResp.message,
                bankDetails: { accountName, bankName, accountNumber, routingNumber: bankCode },
              });

              whatsappBusinessService.sendNormalMessage(
                `❌ Payment failed: ${withdrawalResp.message}`,
                phone,
              );

              await sendTransactionReceipt((tx._id as Types.ObjectId).toString(), phone);
            }
          })
          .catch((err) => console.error("Error processing image payment:", err));

        return { screen: "PROCESSING", data: {} };
      } else if (paymentMethod === "offramp") {
        // Process crypto offramp payment
        const userService = new UserService();
        const toronetService = new ToronetService();
        const whatsappBusinessService = new WhatsAppBusinessService();

        const { user } = await userService.getUserToroWallet(phone, true, true);

        // Verify PIN
        const isValidPin = await user.comparePin(pin);
        if (!isValidPin) {
          return {
            screen: "PIN",
            data: {
              ...data,
              error_message: "Incorrect PIN. Please try again.",
              has_error: true,
            },
          };
        }

        // Import required services
        const { DexPayService } = await import("../../services/DexPayService");
        const { crossmintService } = await import("../../services/CrossmintService");
        const { financialService } = await import("../../services/crypto-off-ramp/FinancialService");
        
        const dexPayService = new DexPayService();

        try {
          // Normalize chain names
          const chainMapping: Record<string, { dexPay: string; crossmint: string }> = {
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
              screen: "PIN",
              data: {
                ...data,
                error_message: `Unsupported network: ${network}`,
                has_error: true,
              },
            };
          }

          const dexPayChain = normalizedChain.dexPay;
          const crossmintChain = normalizedChain.crossmint;
          const normalizedAsset = asset.toUpperCase();

          // For Stellar: USDC is received on Stellar, but DexPay quote uses USDT on BSC
          const isStellar = crossmintChain === "stellar";
          const dexPayQuoteChain = isStellar ? "bep20" : dexPayChain;
          const dexPayQuoteAsset = isStellar ? "USDT" : normalizedAsset;

          // Get current exchange rate
          const ngnAmount = parseFloat(amount);
          const rateData = await dexPayService.getCurrentRates(
            isStellar ? dexPayQuoteAsset : (asset || "USDC"),
            dexPayQuoteChain,
            ngnAmount
          );
          const nairaRate = rateData.rate;

          if (!nairaRate || nairaRate <= 0) {
            return {
              screen: "PIN",
              data: {
                ...data,
                error_message: "Exchange rate unavailable. Please try again.",
                has_error: true,
              },
            };
          }

          // Calculate transfer amount using financial service
          const financials = financialService.calculateTransactionFinancials(ngnAmount, nairaRate);
          const totalCryptoRequired = financials.totalInUsd;

          // Get wallet balance and check sufficiency
          const chainType = crossmintService.getChainType(crossmintChain);
          const balances = await crossmintService.getBalancesByChain(
            user.userId,
            crossmintChain,
            ["usdc", "usdt"],
          );

          const assetBalance = balances.find(
            (b) => (b.symbol?.toLowerCase() || b.token?.toLowerCase()) === normalizedAsset.toLowerCase(),
          );

          let currentBalance = 0;
          if (assetBalance) {
            const decimals = assetBalance.decimals ?? 6;
            const rawAmount = parseFloat(assetBalance.amount) || 0;
            if (rawAmount >= Math.pow(10, decimals) && decimals > 0) {
              currentBalance = rawAmount / Math.pow(10, decimals);
            } else {
              currentBalance = rawAmount;
            }
          }

          if (currentBalance < totalCryptoRequired) {
            const shortfall = totalCryptoRequired - currentBalance;
            return {
              screen: "PIN",
              data: {
                ...data,
                error_message: `Insufficient balance. You need ${totalCryptoRequired.toFixed(4)} ${asset} but have ${currentBalance.toFixed(4)}. Please deposit ${shortfall.toFixed(4)} more.`,
                has_error: true,
              },
            };
          }

          // Get receiving address
          const receivingAddress = dexPayService.getReceivingAddress(dexPayChain);

          // Get user's wallet
          const wallets = await crossmintService.getUserWallets(user.userId);
          const wallet = wallets.find((w) => w.chainType === chainType);

          if (!wallet) {
            return {
              screen: "PIN",
              data: {
                ...data,
                error_message: `No wallet found for ${chainType}`,
                has_error: true,
              },
            };
          }

          // Generate unique idempotency key for transfer
          const transferIdempotencyKey = `image-offramp-${user.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Round amount to appropriate decimal places based on chain
          // Stellar USDC supports max 7 decimals, others typically support more
          const decimals = isStellar ? 7 : 6;
          const roundedAmount = parseFloat(totalCryptoRequired.toFixed(decimals));

          // Transfer crypto to main wallet
          const transferResult = await crossmintService.transferTokens({
            walletAddress: wallet.address,
            token: `${crossmintChain}:${normalizedAsset.toLowerCase()}`,
            recipient: receivingAddress,
            amount: roundedAmount.toString(),
            idempotencyKey: transferIdempotencyKey,
          });

          if (!transferResult.success) {
            return {
              screen: "PIN",
              data: {
                ...data,
                error_message: `Transfer failed: ${transferResult.error || "Please try again."}`,
                has_error: true,
              },
            };
          }

          // Process DexPay quote and completion in background
          const { processOfframpInBackground } = await import("../services/cryptoTopUp.service");
          
          processOfframpInBackground(
            user.userId,
            phone,
            ngnAmount,
            dexPayQuoteAsset, // Use USDT for Stellar, otherwise use selected asset
            dexPayQuoteChain, // Use bep20 for Stellar, otherwise use selected chain
            bankCode,
            accountName,
            accountNumber,
            asset, // Original asset for display
            bankName,
            financials.totalInUsd,
            dexPayService,
            transferIdempotencyKey,
          ).catch((err) => console.error("Background offramp processing error:", err));

          return { screen: "PROCESSING", data: {} };
        } catch (error) {
          console.error("Error processing offramp:", error);
          return {
            screen: "PIN",
            data: {
              ...data,
              error_message: `Payment failed: ${(error as Error).message}`,
              has_error: true,
            },
          };
        }
      } else {
        // Invalid payment method
        return {
          screen: "PIN",
          data: {
            ...data,
            error_message: "Invalid payment method selected. Please try again.",
            has_error: true,
          },
        };
      }
    }
  }

  console.error("Unhandled image payment flow request:", decryptedBody);
  throw new Error("Unhandled image payment flow request.");
}
