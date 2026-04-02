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
      const { pin, accountNumber, accountName, bankName, bankCode, amount, currency } = data;

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
          },
        };
      }

      // Check balance
      const balanceNGN = await toronetService.getBalanceNGN(wallet.publicKey);
      if (+balanceNGN.balance < +amount) {
        return {
          screen: "PIN",
          data: {
            ...data,
            error_message: `Insufficient balance. Available: ₦${balanceNGN.balance.toFixed(2)}`,
          },
        };
      }

      const chainpayeCharge = Number(amount) * 0.015; // 1.5% fee
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
            // Collect platform fee
            toronetService
              .transferNGN(
                wallet.publicKey,
                "0xbdb182ac6b38fd8f4581ab21d29a50287d47a93c",
                chainpayeCharge.toString(),
                wallet.password,
              )
              .catch((err) => console.error("Error sending fees:", err));

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
    }
  }

  console.error("Unhandled image payment flow request:", decryptedBody);
  throw new Error("Unhandled image payment flow request.");
}
