import axios from "axios";
import { User } from "../../models/User";
import { redisClient } from "../../services/redis";
import { logger } from "../../utils/logger";
import { crossmintService } from "../../services/CrossmintService";

const LINKIO_BASE_URL = "https://api.linkio.world";
const LINKIO_SEC_KEY = process.env.LINKIO_SEC_KEY || "ngnc_s_lk_0cd3b9819b72a06fb4d5f28ded9accc4b434262b8d30620e12e8f932249bf3a2";

function getLinkioHeaders() {
  return {
    "ngnc-sec-key": LINKIO_SEC_KEY,
    "Content-Type": "application/json",
  };
}

function getPaymentMethod(currency: string): string {
  if (currency === "GHS") return "bank_transfer_gh";
  if (currency === "KES") return "bank_transfer_kenya";
  return "";
}

function getPayoutCurrency(currency: string): string {
  if (currency === "GHS") return "GHS";
  if (currency === "KES") return "KES";
  return "";
}

async function getRateQuote(params: {
  customerId: string;
  asset: string;
  amount: string;
  paymentMethod: string;
}): Promise<{
  quoteId: string;
  rate: string;
  payoutAmount: string;
  validity: string;
}> {
  const url = `${LINKIO_BASE_URL}/transactions/v2/direct_ramp/rate_quote?customer_id=${params.customerId}&asset=${params.asset}&amount=${params.amount}&trx_type=offramp&payment_method=${params.paymentMethod}`;

  try {
    const response = await axios.get(url, { headers: getLinkioHeaders() });

    if (response.data?.status !== "Success") {
      throw new Error(response.data?.message || "Failed to get rate quote");
    }

    const data = response.data.data;
    return {
      quoteId: data.quoteId,
      rate: data.rate,
      payoutAmount: data.payoutAmount,
      validity: data.validity,
    };
  } catch (err: any) {
    logger.error("Error getting rate quote from Linkio", err);
    throw new Error(err.response?.data?.message || "Failed to get rate quote. Please try again.");
  }
}

async function processWithdrawal(params: {
  payoutCurrency: string;
  quoteId: string;
  payoutId: string;
  stables: string;
  offrampAmount: string;
  senderAddress: string;
  network: string;
}): Promise<{ success: boolean; message: string; data?: any }> {
  const url = `${LINKIO_BASE_URL}/transactions/v2/direct_ramp/withdraw?payout_currency=${params.payoutCurrency}&quoteId=${params.quoteId}&payout_id=${params.payoutId}&stables=${params.stables}&offramp_amount=${params.offrampAmount}&sender_address=${encodeURIComponent(params.senderAddress)}&network=${params.network}`;

  try {
    const response = await axios.post(url, {}, { headers: getLinkioHeaders() });

    if (response.data?.status !== "Success") {
      throw new Error(response.data?.message || "Withdrawal failed");
    }

    return {
      success: true,
      message: "Withdrawal successful",
      data: response.data.data,
    };
  } catch (err: any) {
    logger.error("Error processing withdrawal via Linkio", err);
    return {
      success: false,
      message: err.response?.data?.message || "Withdrawal failed. Please try again.",
    };
  }
}

export async function getPanAfricanOfframpFlowScreen(decryptedBody: {
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
    logger.warn("Pan African offramp flow received error action", { data });
    return { data: { status: "Error", acknowledged: true } };
  }

  if (action === "INIT") {
    return {
      screen: "SELECT_CURRENCY",
      data: { error_message: "", has_error: false },
    };
  }

  if (action === "data_exchange") {
    const userPhone = await redisClient.get(flow_token);
    if (!userPhone) {
      return {
        screen,
        data: { error_message: "Session expired. Please start again.", has_error: true },
      };
    }
    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    switch (screen) {
      // ── SCREEN 1: Currency selected → go to ASSET_DETAILS ──
      case "SELECT_CURRENCY": {
        const { currency } = data;
        if (!currency) {
          return {
            screen: "SELECT_CURRENCY",
            data: { error_message: "Please select a currency.", has_error: true },
          };
        }

        // If NGN selected, close flow and user will be redirected to normal offramp
        if (currency === "NGN") {
          // Send a message to the user explaining they'll use the normal flow
          const user = await User.findOne({ whatsappNumber: phone });
          if (user) {
            const { whatsappBusinessService } = await import("../../services");
            await whatsappBusinessService.sendNormalMessage(
              "🇳🇬 *Nigerian Naira Selected*\n\nFor NGN transactions, please use our standard offramp flow.\n\nYou can access it by:\n• Typing your wallet details (e.g., 'USDC Base')\n• Or check your wallets by typing 'wallet'",
              phone
            );
          }
          
          // Return terminal screen to close the flow
          return {
            screen: "SELECT_CURRENCY",
            data: {
              error_message: "NGN transactions use a different flow. Please check your messages for instructions.",
              has_error: true,
            },
          };
        }

        return {
          screen: "ASSET_DETAILS",
          data: {
            currency,
            error_message: "",
            has_error: false,
          },
        };
      }

      // ── SCREEN 2: Asset details submitted → go to SELECT_BENEFICIARY ──
      case "ASSET_DETAILS": {
        const { currency, asset, amount, chain } = data;

        // Validate inputs
        if (!asset || !amount || !chain) {
          return {
            screen: "ASSET_DETAILS",
            data: {
              currency,
              error_message: "Please fill in all fields.",
              has_error: true,
            },
          };
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount < 15) {
          return {
            screen: "ASSET_DETAILS",
            data: {
              currency,
              error_message: "Minimum amount is $15 USD.",
              has_error: true,
            },
          };
        }

        // Get user and their beneficiaries
        const user = await User.findOne({ whatsappNumber: phone });
        if (!user) {
          return {
            screen: "ASSET_DETAILS",
            data: {
              currency,
              error_message: "User not found. Please restart.",
              has_error: true,
            },
          };
        }

        // Filter beneficiaries by country
        const countryFilter = currency === "GHS" ? "ghana" : currency === "KES" ? "kenya" : "";
        const beneficiaries = (user.payoutAccounts || [])
          .filter((acc) => acc.country === countryFilter)
          .map((acc) => ({
            id: acc.payoutId,
            title: acc.accountName,
          }));

        if (beneficiaries.length === 0) {
          return {
            screen: "ASSET_DETAILS",
            data: {
              currency,
              error_message: `No beneficiaries found for ${currency}. Please add a beneficiary first.`,
              has_error: true,
            },
          };
        }

        return {
          screen: "SELECT_BENEFICIARY",
          data: {
            currency,
            asset,
            amount,
            chain,
            beneficiaries,
            error_message: "",
            has_error: false,
          },
        };
      }

      // ── SCREEN 3: Beneficiary selected → get quote → go to PREVIEW_QUOTE ──
      case "SELECT_BENEFICIARY": {
        const { currency, asset, amount, chain, beneficiary_id } = data;

        if (!beneficiary_id) {
          const user = await User.findOne({ whatsappNumber: phone });
          const countryFilter = currency === "GHS" ? "ghana" : currency === "KES" ? "kenya" : "";
          const beneficiaries = (user?.payoutAccounts || [])
            .filter((acc) => acc.country === countryFilter)
            .map((acc) => ({
              id: acc.payoutId,
              title: acc.accountName,
            }));

          return {
            screen: "SELECT_BENEFICIARY",
            data: {
              currency,
              asset,
              amount,
              chain,
              beneficiaries,
              error_message: "Please select a beneficiary.",
              has_error: true,
            },
          };
        }

        // Get user and verify linkio customer ID
        const user = await User.findOne({ whatsappNumber: phone });
        if (!user || !user.linkioCustomerId) {
          return {
            screen: "SELECT_BENEFICIARY",
            data: {
              currency,
              asset,
              amount,
              chain,
              beneficiaries: [],
              error_message: "Your account is not fully set up. Please contact support.",
              has_error: true,
            },
          };
        }

        // Get beneficiary details
        const beneficiary = user.payoutAccounts?.find((acc) => acc.payoutId === beneficiary_id);
        if (!beneficiary) {
          return {
            screen: "SELECT_BENEFICIARY",
            data: {
              currency,
              asset,
              amount,
              chain,
              beneficiaries: [],
              error_message: "Beneficiary not found.",
              has_error: true,
            },
          };
        }

        // Get rate quote from Linkio
        try {
          const paymentMethod = getPaymentMethod(currency);
          const quote = await getRateQuote({
            customerId: user.linkioCustomerId,
            asset,
            amount,
            paymentMethod,
          });

          return {
            screen: "PREVIEW_QUOTE",
            data: {
              currency,
              asset,
              amount,
              chain,
              beneficiary_id,
              beneficiary_name: beneficiary.accountName,
              rate: quote.rate,
              payout_amount: quote.payoutAmount,
              quote_id: quote.quoteId,
              validity: quote.validity,
              error_message: "",
              has_error: false,
            },
          };
        } catch (err: any) {
          logger.error("Error getting quote", err);
          return {
            screen: "SELECT_BENEFICIARY",
            data: {
              currency,
              asset,
              amount,
              chain,
              beneficiaries: [],
              error_message: err.message || "Failed to get quote. Please try again.",
              has_error: true,
            },
          };
        }
      }

      // ── SCREEN 5 (PIN): verify PIN → check balance → process withdrawal ──
      case "PIN_CONFIRMATION": {
        const {
          pin,
          currency,
          asset,
          amount,
          chain,
          beneficiary_id,
          beneficiary_name,
          rate,
          payout_amount,
          quote_id,
        } = data;

        const user = await User.findOne({ whatsappNumber: phone }).select("+pin");
        if (!user) {
          return {
            screen: "PIN_CONFIRMATION",
            data: {
              ...data,
              error_message: "User not found. Please restart.",
              has_error: true,
            },
          };
        }

        // Verify PIN
        const isValidPin = await user.comparePin(pin);
        if (!isValidPin) {
          return {
            screen: "PIN_CONFIRMATION",
            data: {
              ...data,
              error_message: "Incorrect PIN. Please try again.",
              has_error: true,
            },
          };
        }

        // Check balance
        try {
          const userId = user.userId;
          const chainType = crossmintService.getChainType(chain);
          
          let balances: any[] = [];
          if (chainType === "solana") {
            balances = await crossmintService.getBalancesByChain(userId, chain, ["usdc", "usdt"]);
          } else {
            balances = await crossmintService.getBalancesByChain(userId, chain, ["usdc", "usdt"]);
          }

          const assetBalance = balances.find(
            (b) => (b.symbol?.toLowerCase() || b.token?.toLowerCase()) === asset.toLowerCase()
          );
          const walletBalance = assetBalance ? parseFloat(assetBalance.amount) : 0;

          if (walletBalance < parseFloat(amount)) {
            return {
              screen: "PIN_CONFIRMATION",
              data: {
                ...data,
                error_message: `Insufficient balance. Available: ${walletBalance.toFixed(2)} ${asset}`,
                has_error: true,
              },
            };
          }

          // Get wallet address
          const wallets = await crossmintService.listWallets(userId);
          const wallet = wallets.find((w) => w.chainType === chainType);
          if (!wallet) {
            return {
              screen: "PIN_CONFIRMATION",
              data: {
                ...data,
                error_message: "Wallet not found. Please contact support.",
                has_error: true,
              },
            };
          }

          // Process withdrawal via Linkio
          const payoutCurrency = getPayoutCurrency(currency);
          const withdrawalResult = await processWithdrawal({
            payoutCurrency,
            quoteId: quote_id,
            payoutId: beneficiary_id,
            stables: asset,
            offrampAmount: amount,
            senderAddress: wallet.address,
            network: chain,
          });

          if (!withdrawalResult.success) {
            return {
              screen: "PIN_CONFIRMATION",
              data: {
                ...data,
                error_message: withdrawalResult.message,
                has_error: true,
              },
            };
          }

          logger.info(`Pan African offramp successful for ${phone}: ${amount} ${asset} to ${currency}`);

          return {
            screen: "PROCESSING",
            data: {},
          };
        } catch (err: any) {
          logger.error("Error processing Pan African offramp", err);
          return {
            screen: "PIN_CONFIRMATION",
            data: {
              ...data,
              error_message: "Transaction failed. Please try again.",
              has_error: true,
            },
          };
        }
      }

      default:
        break;
    }
  }

  logger.error("Unhandled Pan African offramp flow request", decryptedBody);
  throw new Error("Unhandled flow request.");
}
