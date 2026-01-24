import { v4 as uuidv4 } from "uuid";
import Decimal from "decimal.js";
import { acquireQuoteLock, releaseQuoteLock } from "./redisLock";
import { WalletService } from "./WalletService";
import { DexpayService } from "./DexpayService";
import { ToronetService } from "./ToronetService";
import { WhatsAppBusinessService } from "./WhatsAppBusinessService";
import { OfframpExecution } from "../models/OfframpExecution";
/**
 * Orchestrates the off-ramp:
 * - idempotency check
 * - on-chain transfers (platform fee -> chainpaye; dexpay amount -> dexpay wallet)
 * - wait for confirmations (via toronet)
 * - call dexpay executeQuote
 *
 * NOTE: This function expects that the selected quote is locked before call.
 */
export class OfframpExecutionService {
  private walletService: WalletService;
  private dexpayService: DexpayService;
  private toronetService: ToronetService;
  private whatsapp: WhatsAppBusinessService;

  constructor() {
    this.walletService = new WalletService();
    this.dexpayService = new DexpayService();
    this.toronetService = new ToronetService();
    this.whatsapp = new WhatsAppBusinessService();
  }

  async execute({
    userId,
    userPhone,
    flowToken,
    ngnAmount,
    bankCode,
    accountNumber,
    accountName,
    blockchain,
    custodialWalletAddress,
    quote,
    quoteRate,
  }: {
    userId: string;
    userPhone: string;
    flowToken: string;
    ngnAmount: number;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    blockchain: "SOL" | "BSC";
    custodialWalletAddress: string;
    quote: any;
    quoteRate: number;
  }) {
    const executionId = uuidv4();
    const quoteId = quote.quoteId || quote.id;

    // Idempotency check (quote)
    const existing = await OfframpExecution.findOne({ quoteId });
    if (existing && ["IN_PROGRESS", "COMPLETED"].includes(existing.status)) {
      throw new Error("Quote already being executed");
    }

    // compute amounts precisely
    const ngn = new Decimal(ngnAmount);
    const rate = new Decimal(quoteRate);
    const usd = ngn.div(rate);
    const platformFee = usd.mul(new Decimal(0.015));
    const dexpayFee = new Decimal(0.2);
    const totalUsd = usd.plus(platformFee).plus(dexpayFee);

    const doc = await OfframpExecution.create({
      executionId,
      userId,
      flowToken,
      ngnAmount,
      bankCode,
      accountNumber,
      accountName,
      blockchain,
      custodialWalletAddress,
      quoteId,
      quoteRate,
      quoteDetails: quote,
      usdAmount: usd.toFixed(8),
      platformFee: platformFee.toFixed(8),
      dexpayFee: dexpayFee.toFixed(8),
      totalUsd: totalUsd.toFixed(8),
      status: "IN_PROGRESS",
    });

    try {
      // Check wallet balance
      const userWallet = await this.walletService.getUserWalletByUserId(userId); // implement/get existing helper
      if (!userWallet) throw new Error("User wallet not found");

      const balanceResp = await this.toronetService.getBalanceUSD(userWallet.publicKey);
      if (!balanceResp.result || new Decimal(balanceResp.balance).lt(totalUsd)) {
        doc.status = "FAILED";
        await doc.save();
        await releaseQuoteLock(quoteId, flowToken);
        await this.whatsapp.sendNormalMessage("Insufficient funds to complete the off-ramp.", userPhone);
        return { success: false, message: "Insufficient funds" };
      }

      // Transfer platform fee -> Chainpaye fee wallet
      const CHAINPAYE_FEE_WALLET_ADDRESS = this.dexpayService.getChainpayWalletAddress(blockchain);
      const platformTx = await this.toronetService.transferUSD(
        userWallet.publicKey,
        CHAINPAYE_FEE_WALLET_ADDRESS,
        platformFee.toString(),
        userWallet.password
      );
      doc.txHashes = { ...doc.txHashes, platformFeeTx: platformTx.transactionHash };
      await doc.save();

      await this.waitForConfirmation(doc.txHashes.platformFeeTx!);

      // Transfer (usd + 0.20) -> DexPay wallet
      const dexpayWalletAddress = this.dexpayService.getDexpayWalletAddress(blockchain);
      const amountToDexPay = usd.plus(dexpayFee).toString();
      const dexpayTx = await this.toronetService.transferUSD(
        userWallet.publicKey,
        dexpayWalletAddress,
        amountToDexPay,
        userWallet.password
      );
      doc.txHashes = { ...doc.txHashes, dexpayTx: dexpayTx.transactionHash };
      await doc.save();

      await this.waitForConfirmation(doc.txHashes.dexpayTx!);

      // Execute DexPay quote
      const execResp = await this.dexpayService.executeQuote(quoteId, custodialWalletAddress, dexpayWalletAddress);
      doc.dexpayExecutionResponse = execResp;
      doc.status = execResp.success ? "COMPLETED" : "FAILED";
      await doc.save();

      // Release lock
      await releaseQuoteLock(quoteId, flowToken);
     // Dexpay execute response may not include a `reference` property in the typed response.
      // Read common fields defensively using `any` and fallback to executionId.
      const execRef =
        (execResp &&
          (((execResp as any).reference as string) ||
            ((execResp as any).transactionId as string) ||
            ((execResp as any).ref as string) ||
            doc.executionId)) ||
        doc.executionId;

      // Notify user
       const message = execResp.success
      ? `Offramp completed successfully. NGN ${ngnAmount} will be sent to ${bankCode} ${accountNumber}. Ref: ${execRef}`
       : `Offramp failed during DexPay execution. Ref: ${doc.executionId}`;
      await this.whatsapp.sendNormalMessage(message, userPhone);

      return { success: !!execResp.success, exec: doc, execResp };
    } catch (error: any) {
      doc.status = "FAILED";
      await doc.save();
      await releaseQuoteLock(quoteId, flowToken);
      await this.whatsapp.sendNormalMessage(
        `An error occurred processing offramp: ${error.message}`,
        userPhone
      );
      return { success: false, message: error.message, error };
    }
  }

  private async waitForConfirmation(txHash: string, timeoutSeconds = 300, pollIntervalSeconds = 5) {
    const start = Date.now();
    while (Date.now() - start < timeoutSeconds * 1000) {
      try {
        const status = await this.toronetService.getTransactionStatus(txHash);
        // adjust according to ToronetService response shape
        if (status && status.result && status.status == 1) {
          return true;
        }
      } catch (err) {
        // ignore and retry
      }
      await new Promise((r) => setTimeout(r, pollIntervalSeconds * 1000));
    }
    throw new Error("Transaction confirmation timeout");
  }
}