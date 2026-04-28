import { Types } from "mongoose";
import { nanoid } from "nanoid";
import { TransactionStatus } from "../../models/Transaction";
import { redisClient } from "../../services/redis";
import { DexPayService } from "../../services/DexPayService";
import { TransactionService } from "../../services/TransactionService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { sendOfframpReceipt } from "../../utils/sendOfframpReceipt";
import { logger } from "../../utils/logger";

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

  // INIT: the flow was opened with pre-populated data from image recognition
  if (action === "INIT") {
    return {
      screen: "CONFIRM_BANK_DETAILS",
      data: {
        accountNumber: data.accountNumber || "",
        accountName: data.accountName || "",
        bankName: data.bankName || "",
        bankCode: data.bankCode || "",
        amount: data.amount || "",
      },
    };
  }

  if (action === "data_exchange") {
    const userPhone = await redisClient.get(flow_token);
    if (!userPhone) {
      return {
        screen: "CONFIRM_BANK_DETAILS",
        data: { error_message: "Session expired. Please send the image again." },
      };
    }

    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    // Screen 1: User confirmed bank details, now select asset & chain
    if (screen === "CONFIRM_BANK_DETAILS") {
      return {
        screen: "SELECT_ASSET_CHAIN",
        data: {
          accountNumber: data.accountNumber,
          accountName: data.accountName,
          bankName: data.bankName,
          bankCode: data.bankCode,
          amount: data.amount,
        },
      };
    }

    // Screen 2: User selected asset & chain, get rates and show review
    if (screen === "SELECT_ASSET_CHAIN") {
      const { accountNumber, accountName, bankName, bankCode, amount, currency, network } = data;

      const dexPayService = new DexPayService();

      try {
        // Get current rates from DexPay
        const rateData = await dexPayService.getCurrentRates(
          currency,
          network.toLowerCase(),
          parseFloat(amount),
        );

        // Calculate amounts
        const flatFeeUsd = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
        const spreadNgn = parseFloat(process.env.OFFRAMP_SPREAD_NGN || "60");
        
        const spreadRate = rateData.rate - spreadNgn;
        const sellAmountUsd = parseFloat(amount) / spreadRate;
        const totalAmountUsd = sellAmountUsd + flatFeeUsd;

        return {
          screen: "REVIEW_DETAILS",
          data: {
            accountNumber,
            accountName,
            bankName,
            bankCode,
            amount: parseFloat(amount).toLocaleString(),
            currency,
            network,
            sellAmountUsd: sellAmountUsd.toFixed(2),
            rate: `₦${spreadRate.toFixed(2)}`,
          },
        };
      } catch (error: any) {
        logger.error("Error getting rates:", error);
        return {
          screen: "SELECT_ASSET_CHAIN",
          data: {
            ...data,
            error_message: "Failed to get current rates. Please try again.",
          },
        };
      }
    }

    // Screen 3: User reviewed details, now authorize with PIN
    if (screen === "REVIEW_DETAILS") {
      const { accountNumber, accountName, bankName, bankCode, amount, currency, network, sellAmountUsd, rate } = data;

      const flatFeeUsd = parseFloat(process.env.OFFRAMP_FLAT_FEE_USD || "0.75");
      const totalAmountUsd = (parseFloat(sellAmountUsd) + flatFeeUsd).toFixed(2);

      return {
        screen: "AUTHORIZE_PAYMENT",
        data: {
          accountNumber,
          accountName,
          bankName,
          bankCode,
          amount,
          currency,
          network,
          sellAmountUsd,
          totalAmountUsd,
          has_error: false,
          error_message: "",
        },
      };
    }

    // Screen 4: User entered PIN, process the payment
    if (screen === "AUTHORIZE_PAYMENT") {
      const { pin, accountNumber, accountName, bankName, bankCode, amount, currency, network, sellAmountUsd, totalAmountUsd } = data;

      const userService = new UserService();
      const dexPayService = new DexPayService();
      const whatsappBusinessService = new WhatsAppBusinessService();

      try {
        const { user, wallet } = await userService.getUserToroWallet(phone, true, true);

        // Verify PIN
        const isValidPin = await user.comparePin(pin);
        if (!isValidPin) {
          return {
            screen: "AUTHORIZE_PAYMENT",
            data: {
              ...data,
              has_error: true,
              error_message: "Incorrect PIN. Please try again.",
            },
          };
        }

        // Create quote with DexPay
        const amountNgn = parseFloat(amount.replace(/,/g, ""));
        const quote = await dexPayService.createQuote({
          fiatAmount: amountNgn,
          asset: currency,
          chain: network.toLowerCase(),
          type: "SELL",
          bankCode,
          accountName,
          accountNumber,
        });

        // Store quote ID for async processing
        const quoteKey = `image_payment_quote:${flow_token}`;
        await redisClient.setex(quoteKey, 900, JSON.stringify({
          quoteId: quote.id,
          phone,
          userId: user._id.toString(),
          walletId: wallet._id.toString(),
          accountNumber,
          accountName,
          bankName,
          bankCode,
          amount: amountNgn,
          currency,
          network,
        }));

        // Process payment asynchronously
        processImagePayment(quote.id, phone, user._id as Types.ObjectId, wallet._id as Types.ObjectId, {
          accountNumber,
          accountName,
          bankName,
          bankCode,
          amount: amountNgn,
          currency,
          network,
        }).catch((err) => console.error("Error processing image payment:", err));

        return { screen: "PROCESSING", data: {} };
      } catch (error: any) {
        logger.error("Error processing payment:", error);
        return {
          screen: "AUTHORIZE_PAYMENT",
          data: {
            ...data,
            has_error: true,
            error_message: error.message || "Payment failed. Please try again.",
          },
        };
      }
    }
  }

  console.error("Unhandled image payment flow request:", decryptedBody);
  throw new Error("Unhandled image payment flow request.");
}

async function processImagePayment(
  quoteId: string,
  phone: string,
  userId: Types.ObjectId,
  walletId: Types.ObjectId,
  details: {
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
    amount: number;
    currency: string;
    network: string;
  }
) {
  const dexPayService = new DexPayService();
  const whatsappBusinessService = new WhatsAppBusinessService();

  try {
    // Finalize the quote
    const result = await dexPayService.finalizeQuote(quoteId);

    if (!result.success) {
      await whatsappBusinessService.sendNormalMessage(
        `❌ Payment failed: ${result.error}`,
        phone,
      );

      // Record failed transaction
      const tx = await TransactionService.recordOfframp({
        fromUser: userId,
        fromWallet: walletId,
        amount: details.amount,
        status: TransactionStatus.FAILED,
        refId: quoteId,
        currency: "NGN",
        failureReason: result.error,
        bankDetails: {
          accountName: details.accountName,
          bankName: details.bankName,
          accountNumber: details.accountNumber,
          routingNumber: details.bankCode,
        },
        cryptoDetails: {
          asset: details.currency,
          chain: details.network,
        },
      });

      await sendOfframpReceipt((tx._id as Types.ObjectId).toString(), phone);
      return;
    }

    // Record successful transaction
    const tx = await TransactionService.recordOfframp({
      fromUser: userId,
      fromWallet: walletId,
      amount: details.amount,
      status: TransactionStatus.COMPLETED,
      refId: result.orderId || quoteId,
      currency: "NGN",
      bankDetails: {
        accountName: details.accountName,
        bankName: details.bankName,
        accountNumber: details.accountNumber,
        routingNumber: details.bankCode,
      },
      cryptoDetails: {
        asset: details.currency,
        chain: details.network,
      },
    });

    await sendOfframpReceipt((tx._id as Types.ObjectId).toString(), phone);
  } catch (error: any) {
    logger.error("Error in processImagePayment:", error);
    await whatsappBusinessService.sendNormalMessage(
      `❌ Payment failed: ${error.message}`,
      phone,
    );
  }
}
