import { redisClient } from "../../services/redis";
import { WalletService } from "../../services/WalletService";
import { User } from "../../models/User";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { CrossmintService, BlockchainType as CrossmintBlockchainType } from "../../services/CrossmintService";
import { DexpayService, BlockchainType as DexpayBlockchainType } from "../../services/DexpayService";
import { computeOfframpCosts } from "../../utils/offrampMath"; 
import { acquireQuoteLock, releaseQuoteLock } from "../../services/redisLock";
import { OfframpExecutionService } from "../../services/OfframpExecutionService"; 

export const getOfframpScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;
  const walletService = new WalletService();
  const whatsappBusinessService = new WhatsAppBusinessService();
  const crossmintService = new CrossmintService();
  const dexpayService = new DexpayService();
  const offExecutionService = new OfframpExecutionService();

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

  try {
    // Get user phone number from Redis using flow_token
    const userPhone = await redisClient.get(flow_token);

    // New strict order: INIT -> AMOUNT_ENTER -> BANK_SELECT -> ACCOUNT_NUMBER -> BLOCKCHAIN_SELECT -> QUOTE_SELECT -> COST_BREAKDOWN -> PIN -> PROCESSING

    if (action === "INIT") {
      // Ask NGN amount first per rules
      return {
        screen: "AMOUNT_ENTER",
        data: {
          message: "How much NGN would you like to receive?",
        },
      };
    }

    if (action === "data_exchange") {
      switch (screen) {
        case "AMOUNT_ENTER": {
          const ngnAmount = data.ngnAmount || data.amount || data.value;
          if (!ngnAmount || isNaN(Number(ngnAmount)) || Number(ngnAmount) <= 0) {
            return {
              screen: "AMOUNT_ENTER",
              data: {
                error_message: "Please enter a valid NGN amount",
              },
            };
          }

          // Store NGN amount
          await redisClient.set(`${flow_token}:ngn_amount`, ngnAmount.toString(), "EX", 600);

          // Fetch banks from DexPay
          try {
            const banks = await dexpayService.getBanks();
            if (!banks || banks.length === 0) {
              return {
                screen: "AMOUNT_ENTER",
                data: {
                  error_message: "No banks available at the moment. Please try again later.",
                },
              };
            }
            const formattedBanks = banks.map((b: any) => ({ id: b.code, title: b.name }));
            return {
              screen: "BANK_SELECT",
              data: {
                banks: formattedBanks,
              },
            };
          } catch (err: any) {
            console.error("Error fetching banks:", err);
            return {
              screen: "AMOUNT_ENTER",
              data: {
                error_message: `Failed to fetch banks: ${err.message}`,
              },
            };
          }
        }

        case "BANK_SELECT": {
          const bankCode = data.bankCode;
          if (!bankCode) {
            return {
              screen: "BANK_SELECT",
              data: { error_message: "Please select a bank" },
            };
          }
          await redisClient.set(`${flow_token}:bank_code`, bankCode, "EX", 600);
          return {
            screen: "ACCOUNT_NUMBER",
            data: { message: "Please enter the account number" },
          };
        }

        case "ACCOUNT_NUMBER": {
          const accountNumber = data.accountNumber;
          if (!accountNumber || accountNumber.trim() === "") {
            return {
              screen: "ACCOUNT_NUMBER",
              data: { error_message: "Please enter a valid account number" },
            };
          }
          const bankCode = await redisClient.get(`${flow_token}:bank_code`);
          if (!bankCode) {
            return {
              screen: "BANK_SELECT",
              data: { error_message: "Bank selection expired. Please select bank again." },
            };
          }
          try {
            const resolveResult = await dexpayService.resolveAccount(bankCode, accountNumber.trim());
            if (!resolveResult.accountExists) {
              return {
                screen: "ACCOUNT_NUMBER",
                data: { error_message: resolveResult.message || "Account does not exist. Please verify." },
              };
            }
            await redisClient.set(
              `${flow_token}:account_details`,
              JSON.stringify({ bankCode, accountNumber: accountNumber.trim(), accountName: resolveResult.accountName }),
              "EX",
              600
            );
            // Ask blockchain next
            return {
              screen: "BLOCKCHAIN_SELECT",
              data: {
                blockchains: [
                  { id: "SOL", title: "Solana (SOL)" },
                  { id: "BSC", title: "Binance Smart Chain (BSC)" },
                ],
              },
            };
          } catch (err: any) {
            console.error("Error resolving account:", err);
            return {
              screen: "ACCOUNT_NUMBER",
              data: { error_message: err.message || "Failed to resolve account" },
            };
          }
        }

        case "BLOCKCHAIN_SELECT": {
          const blockchain = data.blockchain;
          if (!blockchain || (blockchain !== "SOL" && blockchain !== "BSC")) {
            return {
              screen: "BLOCKCHAIN_SELECT",
              data: { error_message: "Please select a valid blockchain" },
            };
          }

          if (!userPhone) {
            return {
              screen: "BLOCKCHAIN_SELECT",
              data: { error_message: "User flow session not found" },
            };
          }

          const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;
          const user = await User.findOne({ whatsappNumber: phone });
          if (!user) {
            return {
              screen: "BLOCKCHAIN_SELECT",
              data: { error_message: "User not found. Please try again." },
            };
          }

          // Ensure custodial wallet for this blockchain exists
          let custodialWalletAddress: string | null = null;
          // Check existing user wallet mapping (assumes user.toronetWallet or wallet model)
          // Use Crossmint if needed
          const userWalletRecord = await walletService.findCustodialWalletForUser(user.userId, blockchain).catch(() => null);
          if (userWalletRecord) {
            custodialWalletAddress = userWalletRecord.address;
          } else {
            // create via crossmint
            try {
              const created = await crossmintService.createCustodialWallet(user.userId, blockchain as CrossmintBlockchainType);
              custodialWalletAddress = created?.address;
            } catch (err: any) {
              console.error("Error creating custodial wallet:", err);
              return {
                screen: "BLOCKCHAIN_SELECT",
                data: { error_message: "Failed to create custodial wallet. Please try again later." },
              };
            }
          }

          // persist custodial wallet
          await redisClient.set(`${flow_token}:custodial_wallet`, JSON.stringify({ address: custodialWalletAddress, blockchain }), "EX", 3600);

          // Fetch quotes from DexPay
          const ngnAmountStr = await redisClient.get(`${flow_token}:ngn_amount`);
          if (!ngnAmountStr) {
            return {
              screen: "AMOUNT_ENTER",
              data: { error_message: "NGN amount expired. Please enter amount again." },
            };
          }
          const ngnAmount = Number(ngnAmountStr);

          try {
            const accountDetails = JSON.parse(await redisClient.get(`${flow_token}:account_details`) || "{}");
            const quotes = await dexpayService.getQuotes("DUSD", blockchain as DexpayBlockchainType, ngnAmount, "SELL", accountDetails.bankCode, accountDetails.accountNumber, accountDetails.accountName, custodialWalletAddress?.toString());
            if (!quotes || quotes.length === 0) {
              return {
                screen: "BLOCKCHAIN_SELECT",
                data: { error_message: "No quotes available. Try another chain or try again later." },
              };
            }
            await redisClient.set(`${flow_token}:quotes`, JSON.stringify(quotes), "EX", 300);

            const formatted = quotes.map((q: any) => ({
              id: q.quoteId,
              title: `Receive NGN ${ngnAmount} — Rate ${q.rate}`,
              details: q,
            }));

            return {
              screen: "QUOTE_SELECT",
              data: { quotes: formatted },
            };
          } catch (err: any) {
            console.error("Error fetching quotes:", err);
            return {
              screen: "BLOCKCHAIN_SELECT",
              data: { error_message: "Failed to fetch quotes. Please try again later." },
            };
          }
        }

        case "QUOTE_SELECT": {
          const quoteId = data.quoteId;
          if (!quoteId) {
            return { screen: "QUOTE_SELECT", data: { error_message: "Please select a quote" } };
          }

          const quotesJson = await redisClient.get(`${flow_token}:quotes`);
          if (!quotesJson) {
            return { screen: "BLOCKCHAIN_SELECT", data: { error_message: "Quote session expired. Please select blockchain again." } };
          }
          const quotes = JSON.parse(quotesJson);
          const selectedQuote = quotes.find((q: any) => (q.quoteId || q.id) === quoteId);
          if (!selectedQuote) {
            return { screen: "QUOTE_SELECT", data: { error_message: "Invalid quote selected" } };
          }

          // Acquire quote lock
          const lockAcquired = await acquireQuoteLock(quoteId, flow_token, 300);
          if (!lockAcquired) {
            return { screen: "QUOTE_SELECT", data: { error_message: "Quote no longer available. Please select another quote." } };
          }

          await redisClient.set(`${flow_token}:selected_quote`, JSON.stringify(selectedQuote), "EX", 300);

          // Compute cost breakdown (USD-based)
          const ngnAmountStr = await redisClient.get(`${flow_token}:ngn_amount`);
          const quoteRate = selectedQuote.rate || selectedQuote.quoteRate || selectedQuote.ratePerUsd;
          const costs = computeOfframpCosts(Number(ngnAmountStr), Number(quoteRate));

          return {
            screen: "COST_BREAKDOWN",
            data: {
              ngnAmount: Number(ngnAmountStr),
              quoteRate,
              usd: costs.totalUsd,
              platformFee: costs.platformFeeNgn,
              dexpayFee: costs.dexpayFeeNgn,
              totalUsd: costs.totalUsd,
              totalNgn: costs.totalNgn,
              message: "Confirm to proceed. You will be asked to enter your 4-digit PIN.",
            },
          };
        }

        case "PIN": {
          const { pin } = data;
          if (!pin) {
            return { screen: "PIN", data: { error_message: "Please enter your PIN" } };
          }

          // Validate PIN
          const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;
          const user = await User.findOne({ whatsappNumber: phone }).select("+pin");
          if (!user?.pin) {
            return { screen: "PIN", data: { error_message: "You have to set a pin to proceed. Use the /setup pin command in the chat." } };
          }
          if (user.pin !== pin) {
            return { screen: "PIN", data: { error_message: "Invalid PIN. Please try again." } };
          }

          // All validations passed. Start execution asynchronously and return PROCESSING immediately.
          const selectedQuoteJson = await redisClient.get(`${flow_token}:selected_quote`);
          const selectedQuote = JSON.parse(selectedQuoteJson!);
          const custodialJson = await redisClient.get(`${flow_token}:custodial_wallet`);
          const { address: custodialWalletAddress, blockchain } = JSON.parse(custodialJson!);
          const accountDetailsJson = await redisClient.get(`${flow_token}:account_details`);
          const accountDetails = JSON.parse(accountDetailsJson!);
          const ngnAmountStr = await redisClient.get(`${flow_token}:ngn_amount`);
          const userRecord = await User.findOne({ whatsappNumber: phone });

          // Run async (no await) — OfframpExecutionService handles persistence and notification
          (async () => {
            try {
              await offExecutionService.execute({
                userId: userRecord!.userId,
                userPhone: phone!,
                flowToken: flow_token,
                ngnAmount: Number(ngnAmountStr),
                bankCode: accountDetails.bankCode,
                accountNumber: accountDetails.accountNumber,
                accountName: accountDetails.accountName,
                blockchain,
                custodialWalletAddress,
                quote: selectedQuote,
                quoteRate: selectedQuote.rate || selectedQuote.quoteRate || selectedQuote.ratePerUsd,
              });
            } catch (err) {
              console.error("Offramp async execution error:", err);
            }
          })();

          return {
            screen: "PROCESSING",
            data: {},
          };
        }

        default:
          break;
      }
    }

    console.error("Unhandled request body:", decryptedBody);
    throw new Error("Unhandled endpoint request. Make sure you handle the request action & screen logged above.");
  } catch (error) {
    console.error("An error occurred", error);
    throw new Error((error as { message: string }).message);
  }
};