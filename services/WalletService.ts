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
      const wallet = await Wallet.create(
        [
          {
            userId,
            publicKey: toronetWallet.walletAddress,
            password: toronetWallet.password,
          },
        ],
        { session }
      );

      await User.updateOne({ userId }, { toronetWallet: wallet }, { session });

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

    TransactionService.recordTransaction({
      refId: data.refId,
      toronetTxId: data.transactionId,
      currency,
      status: TransactionStatus.PENDING,
      amount: +amount,
      type: TransactionType.DEPOSIT,
    }).catch((err) => console.log("transaction", err));
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
        message: `Transaction with id - [${transactionId}] has been processed successfully`,
      };
    } else {
      return {
        success: false,
        message: `Transaction with id - [${transactionId}] still pending`,
      };
    }
  }

 async getUserWalletByUserId(userId: string) {
  if (!userId) return null;
  const wallet = await Wallet.findOne({ userId }).select("+password");
  return wallet;
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

  /**
   * Execute offramp transaction
   * Transfers funds from user's wallet to custodial wallet, then to Dexpay wallet
   */
  async executeOfframp(
    phoneNumber: string,
    custodialWalletAddress: string,
    amount: number,
    quoteId: string,
    blockchain: "SOL" | "BSC"
  ) {
    try {
      const phone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
      const user = await User.findOne({ whatsappNumber: phone });
      if (!user) {
        return {
          success: false,
          message: `User with phone number - [${phone}] not found`,
        };
      }

      const userWallet = await Wallet.findOne({ userId: user.userId }).select(
        "+password"
      );

      if (!userWallet) {
        return {
          success: false,
          message: `User with phone number - [${phone}] does not have a wallet`,
        };
      }

      // Check balance before proceeding
      const balanceResp = await this.toronetService.getBalanceUSD(
        userWallet.publicKey
      );

      if (!balanceResp.result) {
        return {
          success: false,
          message: "Error checking balance. Please try again.",
        };
      }

      if (balanceResp.balance < amount) {
        return {
          success: false,
          message: `Insufficient balance. Your balance is ${balanceResp.balance} USD.`,
        };
      }

      // Step 1: Transfer funds from user's wallet to custodial wallet (USD)
      const transferResult = await this.toronetService.transferUSD(
        userWallet.publicKey,
        custodialWalletAddress,
        amount.toString(),
        userWallet.password
      );

      if (!transferResult.result) {
        return {
          success: false,
          message: `Failed to transfer funds to custodial wallet: ${transferResult.message || "Unknown error"}`,
        };
      }

      // Step 2: Get Dexpay's wallet address
      const { DexpayService } = await import("./DexpayService");
      const dexpayService = new DexpayService();
      const dexpayWalletAddress = dexpayService.getDexpayWalletAddress(blockchain);

      // Step 3: Execute quote via Dexpay
      // Note: In a real scenario, you might need to transfer from custodial wallet to Dexpay
      // This would depend on how Crossmint handles transfers and how Dexpay expects the transaction
      // For now, we're calling the executeQuote endpoint
      const executeResult = await dexpayService.executeQuote(
        quoteId,
        custodialWalletAddress, // Source wallet (custodial wallet)
        dexpayWalletAddress // Destination wallet (Dexpay's wallet)
      );

      if (!executeResult.success) {
        return {
          success: false,
          message: executeResult.message || "Failed to execute quote with Dexpay",
        };
      }

      return {
        success: true,
        message: `Offramp transaction completed successfully. Transaction ID: ${executeResult.transactionId || "N/A"}`,
        transactionId: executeResult.transactionId,
      };
    } catch (error: any) {
      console.error("Error executing offramp:", error);
      return {
        success: false,
        message: error.message || "An error occurred processing offramp",
      };
    }
  }

  /**
 * Attempt to locate a custodial wallet for a user for a specific blockchain.
 * Tries multiple likely locations (Wallet collection, User.toronetWallet) and
 * returns an object { address } or null if none found.
 *
 * This is intentionally defensive because different installations may store
 * custodial wallet info in different shapes.
 */
 async findCustodialWalletForUser(userId: string, blockchain: "SOL" | "BSC") {
  if (!userId) return null;

  // 1) Try Wallet collection (common)
  try {
    const wallet = await Wallet.findOne({ userId }).select("+password");
    if (wallet) {
      // try several common field names for address
      const address = (wallet as any).publicKey || (wallet as any).address || (wallet as any).walletAddress;
      if (address) return { address };
    }
  } catch (err) {
    // ignore and continue to next option
  }

  // 2) Try User record (some code stores toronetWallet on User)
  try {
    const user = await User.findOne({ userId }).lean();
    if (user) {
      const toronet = (user as any).toronetWallet;
      if (toronet) {
        const address = toronet.publicKey || toronet.address || toronet.walletAddress || toronet;
        if (address) return { address };
      }
      // Also check custodialWallets map if present
      const custodials = (user as any).custodialWallets;
      if (custodials && custodials[blockchain]) {
        const a = custodials[blockchain].address || custodials[blockchain].publicKey;
        if (a) return { address: a };
      }
    }
  } catch (err) {
    // ignore
  }

  return null;
}
}