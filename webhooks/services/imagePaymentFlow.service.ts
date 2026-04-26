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

    if (screen === "PIN") {
      const { pin, accountNumber, accountName, bankName, bankCode, amount, currency, paymentMethod } = data;

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
        // Store offramp details in Redis for the offramp flow to pick up
        const offrampKey = `offramp:image_payment:${phone}`;
        await redisClient.set(
          offrampKey,
          JSON.stringify({
            accountNumber,
            accountName,
            bankName,
            bankCode,
            amount,
            currency: currency || "NGN",
            userId: user._id.toString(),
          }),
          "EX",
          3600 // 1 hour expiry
        );

        // Automatically trigger the offramp flow
        // The sendCryptoDepositAddress method will handle fetching banks and launching the flow
        await whatsappBusinessService.sendCryptoDepositAddress(
          phone,
          "USDC", // Default token
          "base" as any, // Default network
          "" // Empty address since we're just triggering the flow
        );

        return { screen: "PROCESSING", data: {} };
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
