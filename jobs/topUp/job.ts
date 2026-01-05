import { Job } from "agenda";
import { agenda } from "..";
import { Transaction, TransactionStatus } from "../../models/Transaction";
import { WalletService } from "../../services/WalletService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { IUser } from "../../models/User";
import { sendTransactionReceipt } from "../../utils/sendReceipt";
import { Types } from "mongoose";
import { JobNames, ProcessDeposit } from "../types";

export async function processDepositHandler(job: Job<ProcessDeposit>) {
  console.log("Handling PROCESS_DEPOSIT job...");
  const walletService = new WalletService();
  const whatsappBusinessService = new WhatsAppBusinessService();
  const transactionId = job.attrs.data.transactionId;
  const endDate = job.attrs.endDate;
  const now = Date.now();

  const transaction = await Transaction.findOne({
    toronetTransactionId: transactionId,
  }).populate("fromUser");

  if (!transaction) {
    await agenda.cancel({ name: JobNames.PROCESS_DEPOSIT });
    return;
  }

  const result = await walletService.checkTransactionStatus(transactionId);
  if (result.success) {
    await Transaction.updateOne(
      { toronetTransactionId: transactionId },
      { status: TransactionStatus.COMPLETED }
    );

    // Send receipt asynchronously
    if (transaction.fromUser) {
      await sendTransactionReceipt(
        (transaction._id as Types.ObjectId).toString(),
        (transaction.fromUser as IUser).whatsappNumber
      );
    }

    await agenda.cancel({ name: JobNames.PROCESS_DEPOSIT });
    return;
  }
  if (endDate && now + 30000 > new Date(endDate).getTime()) {
    console.log("LAST RUN...");
    if (!result.success) {
      await whatsappBusinessService.sendNormalMessage(
        `Deposit with transaction Id - [${transactionId}] could not be processed
          `,
        (transaction.fromUser as IUser).whatsappNumber
      );

      // Send receipt for failed deposit
      await Transaction.updateOne(
        { toronetTransactionId: transactionId },
        { status: TransactionStatus.FAILED }
      );
      if (transaction.fromUser) {
        await sendTransactionReceipt(
          (transaction._id as Types.ObjectId).toString(),
          (transaction.fromUser as IUser).whatsappNumber
        );
      }
    }
    await agenda.cancel({ name: JobNames.PROCESS_DEPOSIT });
  }
}

// scheduler

async function scheduleProcessDeposit(transactionId: string) {
  console.log("Scheduling PROCESS_DEPOSIT job...");
  await agenda.start();
  const end = new Date(Date.now() + 15 * 60 * 1000); // run for 15 mins
  await agenda.every<ProcessDeposit>(
    "30 seconds",
    JobNames.PROCESS_DEPOSIT,
    {
      transactionId,
    },
    {
      endDate: end,
    }
  );
}

export { scheduleProcessDeposit };
