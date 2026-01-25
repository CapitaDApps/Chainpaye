import { mongo, Types } from "mongoose";
import { toronetService, userService } from ".";
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from "../models/Transaction";
import { User } from "../models/User";
import { Wallet } from "../models/Wallet";
import { CoinType, CurrencyType } from "../types/toronetService.types";
import { sendTransferReceipts } from "../utils/sendReceipt";
import { TransactionService } from "./TransactionService";

export class WalletService {
  async addWallet(
    { userId, country }: { userId: string; country: string },
    session: mongo.ClientSession,
  ): Promise<void> {
    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      const toronetWallet = await toronetService.createWallet();
      console.log({ toronetWallet });
      await Wallet.create(
        [
          {
            userId,
            publicKey: toronetWallet.walletAddress,
            password: toronetWallet.password,
          },
        ],
        { session },
      );
    }
  }

  async transfer(
    from: string,
    to: string,
    amount: number,
    currency: CurrencyType,
  ) {
    console.log("WalletService.transfer called", {
      from,
      to,
      amount,
      currency,
    });
    const user = await User.findOne({ whatsappNumber: from });
    if (!user) throw new Error(`User with phone number - [${from}] not found`);
    console.log("Sender user found:", { userId: user._id, phone: from });

    const fromWallet = await Wallet.findOne({ userId: user.userId }).select(
      "+password",
    );

    console.log("Sender wallet found:", { walletId: fromWallet?._id });

    if (!fromWallet)
      throw new Error(
        `User with phone number - [${from}] does not have a wallet`,
      );

    const toUser = await User.findOne({ whatsappNumber: to });
    console.log("Recipient user search result:", {
      toUserFound: !!toUser,
      toPhone: to,
    });
    if (!toUser)
      return {
        success: false,
        type: "no user data",
        message: `user with phone number - [${to}] not on chainpaye`,
        data: to,
      };
    const toWallet = await Wallet.findOne({ userId: toUser.userId }).select(
      "+password",
    );
    console.log("Recipient wallet search result:", {
      toWalletFound: !!toWallet,
    });
    if (!toWallet)
      throw new Error(
        `Could not find wallet for user with phone number - [${to}]`,
      );

    const senderFullName = `${user.firstName} ${user.lastName}`;
    const fullName = `${toUser.firstName} ${toUser.lastName}`;

    switch (currency) {
      case "USD":
        const respUSD = await toronetService.getBalanceUSD(
          fromWallet.publicKey,
        );

        console.log({ respUSD });

        if (!respUSD.result) throw new Error("Error fetching USD balance");

        if (respUSD.balance < amount)
          return {
            success: false,
            type: "Insufficient balance",
            message: "Insufficient balance to make transfer",
          };

        const transferRespUSD = await toronetService.transferUSD(
          fromWallet.publicKey,
          toWallet.publicKey,
          amount.toString(),
          fromWallet.password,
        );

        if (transferRespUSD.result) {
          const txResult = await TransactionService.recordTransfer({
            refId: transferRespUSD.transactionHash,
            toronetTxId: transferRespUSD.transactionHash,
            amount: amount,
            fromUser: user._id as Types.ObjectId,
            toUser: toUser._id as Types.ObjectId,
            currency: "USD",
            status: TransactionStatus.COMPLETED,
          });

          // Send receipts asynchronously
          sendTransferReceipts(
            (txResult.debit._id as Types.ObjectId).toString(),
            (txResult.credit._id as Types.ObjectId).toString(),
            from,
            to,
          ).catch((err) => console.log("Error sending receipt", err));

          return {
            success: true,
            type: "transfer success",
            message: `Transfer of ${amount} USD to ${fullName} was successful`,
            messageTo: `You've received ${amount} USD from ${senderFullName}`,
          };
        } else {
          const txResult = await TransactionService.recordTransfer({
            refId: transferRespUSD.transactionHash,
            toronetTxId: transferRespUSD.transactionHash,
            amount: amount,
            fromUser: user._id as Types.ObjectId,
            toUser: toUser._id as Types.ObjectId,
            currency: "USD",
            status: TransactionStatus.FAILED,
            failureReason: transferRespUSD.message,
          });

          // Send receipts asynchronously for failed transaction
          sendTransferReceipts(
            (txResult.debit._id as Types.ObjectId).toString(),
            (txResult.credit._id as Types.ObjectId).toString(),
            from,
            to,
          ).catch((err) => console.log("Error sending receipt", err));

          return {
            success: false,
            type: "transfer failed",
            message: `Transfer of ${amount}USD to ${fullName} was unsuccessful`,
          };
        }

      case "NGN":
        const respNGN = await toronetService.getBalanceNGN(
          fromWallet.publicKey,
        );

        if (!respNGN.result) throw new Error("Error fetching NGN balance");

        if (+respNGN.balance < +amount)
          return {
            success: false,
            type: "Insufficient balance",
            message: "Insufficient balance to make transfer",
          };

        const transferRespNGN = await toronetService.transferNGN(
          fromWallet.publicKey,
          toWallet.publicKey,
          amount.toString(),
          fromWallet.password,
        );

        if (transferRespNGN.result) {
          const txResult = await TransactionService.recordTransfer({
            refId: transferRespNGN.transactionHash,
            toronetTxId: transferRespNGN.transactionHash,
            amount: amount,
            fromUser: user._id as Types.ObjectId,
            toUser: toUser._id as Types.ObjectId,
            currency: "NGN",
            status: TransactionStatus.COMPLETED,
          });

          // Send receipts asynchronously
          sendTransferReceipts(
            (txResult.debit._id as Types.ObjectId).toString(),
            (txResult.credit._id as Types.ObjectId).toString(),
            from,
            to,
          ).catch((err) => console.log("Error sending receipt", err));

          return {
            success: true,
            type: "transfer success",
            message: `Transfer of ${amount} NGN to ${fullName} was successful`,
            messageTo: `You've received ${amount} NGN from ${senderFullName}`,
          };
        } else {
          const txResult = await TransactionService.recordTransfer({
            refId: transferRespNGN.transactionHash,
            toronetTxId: transferRespNGN.transactionHash,
            amount: amount,
            fromUser: user._id as Types.ObjectId,
            toUser: toUser._id as Types.ObjectId,
            currency: "NGN",
            status: TransactionStatus.FAILED,
            failureReason: transferRespNGN.message,
          });

          // Send receipts asynchronously for failed transaction
          sendTransferReceipts(
            (txResult.debit._id as Types.ObjectId).toString(),
            (txResult.credit._id as Types.ObjectId).toString(),
            from,
            to,
          ).catch((err) => console.log("Error sending receipt", err));

          return {
            success: false,
            type: "transfer failed",
            message: `Transfer of ${amount}NGN to ${fullName} was unsuccessful`,
          };
        }

      default:
        break;
    }
  }

  async deposit(phoneNumber: string, amount: string, currency: CurrencyType) {
    console.log({ phoneNumber });
    phoneNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    console.log({ phoneNumber });
    const user = await User.findOne({ whatsappNumber: phoneNumber });
    if (!user)
      throw new Error(`User with phone number - [${phoneNumber}] not found`);

    const wallet = await Wallet.findOne({ userId: user.userId });

    if (!wallet)
      throw new Error(
        `User with phone number - [+${phoneNumber}] does not have a wallet`,
      );

    const data = await toronetService.initializeDeposit({
      receiverAddress: wallet.publicKey,
      amount,
      currency,
    });

    console.log(data);

    await TransactionService.recordDeposit({
      refId: data.refId,
      toronetTxId: data.transactionId,
      currency,
      status: TransactionStatus.PENDING,
      amount: +amount,
      fromUser: user._id as Types.ObjectId,
    });
    return data;
  }

  async depositCrypto(phoneNumber: string, amount: string, currency: CoinType) {
    console.log({ phoneNumber });
    phoneNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    console.log({ phoneNumber });

    const { wallet: userToroWallet, user } =
      await userService.getUserToroWallet(phoneNumber, true);

    const data = await toronetService.initCryptoDeposit({
      receiverAddress: userToroWallet.publicKey,
      amount,
      currency,
      password: userToroWallet.password,
    });

    console.log(data);

    // console.log("deposit crypto result", result);
    const estimatedFees = Number(data.totalAmount) - Number(amount);

    TransactionService.recordCryptoDeposit({
      refId: data.refId,
      toronetTxId: data.transactionId,
      currency,
      status: TransactionStatus.PENDING,
      amount: +amount,
      fromUser: user._id as Types.ObjectId,
      fees: estimatedFees,
    }).catch((error) =>
      console.log("Error recording crypto transaction", error),
    );
    return data;
  }

  async checkTransactionStatus(transactionId: string) {
    const transaction = await Transaction.findOne({
      toronetTransactionId: transactionId,
    });

    if (!transaction)
      return {
        success: false,
        message: `Transaction with id - [${transactionId}] was not found`,
      };

    if (transaction.status == TransactionStatus.COMPLETED) {
      return {
        success: true,
        message: `Transaction with id - [${transactionId}] has been processed successfully`,
      };
    }

    let statusResult = await toronetService.getTransactionStatus(
      transaction.toronetTransactionId!,
    );

    let result: any;

    if (+statusResult.status == 0) {
      result = await toronetService.recordTransaction(
        transaction.toronetTransactionId!,
        transaction.currency,
      );
      if (result.result) {
        const st = await toronetService.getTransactionStatus(
          transaction.toronetTransactionId!,
        );
        if (st.status === 2) {
          const data = st.data[0];
          await Transaction.updateOne(
            { toronetTransactionId: transactionId },
            { amount: data.TX_Amount, totalAmount: data.TX_TotalAmount },
          );
        }
      }
    } else {
      transaction.markAsCompleted();
      transaction.save();
      return {
        success: true,
        message: `Transaction with id - [${transactionId}] has been processed successfully`,
      };
    }

    if (result.result) {
      transaction.markAsCompleted();
      transaction.save();

      return {
        success: true,
        message: `Deposit amount of ${transaction.amount} ${transaction.currency} has been processed successfully`,
      };
    } else {
      return {
        success: false,
        message: `Transaction with id - [${transactionId}] still pending`,
      };
    }
  }

  async checkCryptoTransactionStatus(transactionId: string) {
    const transaction = await Transaction.findOne({
      toronetTransactionId: transactionId,
    });

    if (!transaction)
      return {
        success: false,
        message: `Transaction with id - [${transactionId}] was not found`,
      };

    if (transaction.status == TransactionStatus.COMPLETED) {
      return {
        success: true,
        message: `Transaction with id - [${transactionId}] has been processed successfully`,
      };
    }

    let statusResult = await toronetService.getTransactionStatus(
      transaction.toronetTransactionId!,
    );

    let result: any;

    if (+statusResult.status == 0) {
      result = await toronetService.recordCryptoTransaction(
        transaction.toronetTransactionId!,
        transaction.currency,
      );
      if (result.result) {
        const st = await toronetService.getTransactionStatus(
          transaction.toronetTransactionId!,
        );
        if (st.status === 2) {
          const data = st.data[0];
          await Transaction.updateOne(
            { toronetTransactionId: transactionId },
            { amount: data.TX_Amount, totalAmount: data.TX_TotalAmount },
          );
        }
      }
    } else {
      transaction.markAsCompleted();
      transaction.save();
      return {
        success: true,
        message: `Transaction with id - [${transactionId}] has been processed successfully`,
      };
    }

    if (result.result) {
      transaction.markAsCompleted();
      transaction.save();

      return {
        success: true,
        message: `Deposit amount of ${transaction.amount} ${transaction.currency} has been processed successfully`,
      };
    } else {
      return {
        success: false,
        message: `Transaction with id - [${transactionId}] still pending`,
      };
    }
  }

  async ngnBalance(address: string) {
    const bal = await toronetService.getBalanceNGN(address);
    return bal;
  }

  async usdBalance(address: string) {
    const bal = await toronetService.getBalanceUSD(address);
    return bal;
  }

  // TODO update wallet PIN
  async updatePin() {
    //  1. old and new pin. Old pin must be valid
    // 2. Email verification to update pin
  }

  // TODO: Reset pin
  async resetPin() {
    // 1. Email verification to process the user owns the account
    // 2. Reset pin
  }

  // TODO Get Wallet INFO

  async getUserRecentTransactions(phone: string, limit: number = 10) {
    const user = await User.findOne({ whatsappNumber: phone });
    if (!user) {
      throw new Error(`User with phone number - [${phone}] not found`);
    }

    const transactions = await Transaction.find({
      $or: [
        // For TRANSFER transactions:
        // Show DEBIT entries where user is the sender
        {
          type: TransactionType.TRANSFER,
          entryType: "DEBIT",
          fromUser: user._id,
        },
        // Show CREDIT entries where user is the receiver
        {
          type: TransactionType.TRANSFER,
          entryType: "CREDIT",
          toUser: user._id,
        },
        // For other transaction types (DEPOSIT, WITHDRAWAL, CONVERSION):
        // Show all where user is the fromUser
        {
          type: {
            $in: [
              TransactionType.DEPOSIT,
              TransactionType.WITHDRAWAL,
              TransactionType.CONVERSION,
              TransactionType.DIRECT_TRANSFER,
            ],
          },
          fromUser: user._id,
        },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("fromUser toUser", "firstName lastName whatsappNumber");

    return transactions;
  }
}
