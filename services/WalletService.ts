import { ClientSession, Document, mongo, Types } from "mongoose";
import { Wallet } from "../models/Wallet";
import { IUser, User } from "../models/User";
import { ToronetService } from "./ToronetService";
import { CurrencyType } from "../types/toronetService.types";
import { TransactionService } from "./TransactionService";
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from "../models/Transaction";

export class WalletService {
  private toronetService: ToronetService;
  constructor() {
    this.toronetService = new ToronetService();
  }

  async addWallet(
    { fullName, userId }: { userId: string; fullName: string },
    session: mongo.ClientSession
  ): Promise<void> {
    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      const toronetWallet = await this.toronetService.createWallet();
      console.log({ toronetWallet });
      await Wallet.create(
        [
          {
            userId,
            publicKey: toronetWallet.walletAddress,
            password: toronetWallet.password,
          },
        ],
        { session }
      );

      await this.toronetService.createVirtualWalletNGN({
        address: toronetWallet.walletAddress,
        fullName,
      });
    }
  }

  async transfer(
    from: string,
    to: string,
    amount: number,
    currency: CurrencyType
  ) {
    const user = await User.findOne({ whatsappNumber: `+${from}` });
    if (!user) throw new Error(`User with phone number - [+${from}] not found`);
    const fromWallet = await Wallet.findOne({ userId: user.userId }).select(
      "+password"
    );

    if (!fromWallet)
      throw new Error(
        `User with phone number - [+${from}] does not have a wallet`
      );

    const toUser = await User.findOne({ whatsappNumber: to });
    if (!toUser)
      return {
        success: false,
        type: "no user data",
        message: `user with phone number - [${to}] not on chainpaye`,
        data: to,
      };
    const toWallet = await Wallet.findOne({ userId: toUser.userId }).select(
      "+password"
    );
    if (!toWallet)
      throw new Error(
        `Could not find wallet for user with phone number - [${to}]`
      );

    switch (currency) {
      case "USD":
        const respUSD = await this.toronetService.getBalanceUSD(
          fromWallet.publicKey
        );

        console.log({ respUSD });

        if (!respUSD.result) throw new Error("Error fetching USD balance");

        if (respUSD.balance < amount)
          return {
            success: false,
            type: "Insufficient balance",
            message: "Insufficient balance to make transfer",
          };

        const transferRespUSD = await this.toronetService.transferUSD(
          fromWallet.publicKey,
          toWallet.publicKey,
          amount.toString(),
          fromWallet.password
        );

        if (transferRespUSD.result) {
          return {
            success: true,
            type: "transfer success",
            message: `Transfer of ${amount}USD to ${to} was successful`,
          };
        } else {
          return {
            success: false,
            type: "transfer failed",
            message: `Transfer of ${amount}USD to ${to} was unsuccessful`,
          };
        }

      case "NGN":
        const respNGN = await this.toronetService.getBalanceNGN(
          fromWallet.publicKey
        );

        if (!respNGN.result) throw new Error("Error fetching NGN balance");

        if (+respNGN.balance < +amount)
          return {
            success: false,
            type: "Insufficient balance",
            message: "Insufficient balance to make transfer",
          };

        const transferRespNGN = await this.toronetService.transferNGN(
          fromWallet.publicKey,
          toWallet.publicKey,
          amount.toString(),
          fromWallet.password
        );

        if (transferRespNGN.result) {
          return {
            success: true,
            type: "transfer success",
            message: `Transfer of ${amount}NGN to ${to} was successful`,
          };
        } else {
          return {
            success: false,
            type: "transfer failed",
            message: `Transfer of ${amount}NGN to ${to} was unsuccessful`,
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
        `User with phone number - [+${phoneNumber}] does not have a wallet`
      );

    const data = await this.toronetService.initializeDeposit({
      receiverAddress: wallet.publicKey,
      amount,
      currency,
    });

    console.log(data);

    await TransactionService.recordTransaction({
      refId: data.refId,
      toronetTxId: data.transactionId,
      currency,
      status: TransactionStatus.PENDING,
      amount: currency == "NGN" ? +data.amount! : +amount,
      type: TransactionType.DEPOSIT,
      fromUser: user._id as Types.ObjectId,
    });
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

    let statusResult = await this.toronetService.getTransactionStatus(
      transaction.toronetTransactionId!
    );

    let result: any;

    if (+statusResult.status == 0) {
      result = await this.toronetService.recordTransaction(
        transaction.toronetTransactionId!,
        transaction.currency
      );
    } else {
      transaction.markAsCompleted();
      return {
        success: true,
        message: `Transaction with id - [${transactionId}] has been processed successfully`,
      };
    }

    if (result.result) {
      transaction.markAsCompleted();
      return {
        success: true,
        message: `Amount of ${transaction.amount}${transaction.currency} has been processed successfully`,
      };
    } else {
      return {
        success: false,
        message: `Transaction with id - [${transactionId}] still pending`,
      };
    }
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
}
