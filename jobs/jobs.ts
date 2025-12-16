import { Job, JobAttributesData } from "agenda";
import { agenda } from ".";
import { Transaction } from "../models/Transaction";
import { WalletService } from "../services/WalletService";
import { WhatsAppBusinessService } from "../services/WhatsAppBusinessService";
import { IUser } from "../models/User";
import { CONSTANTS } from "../utils/config";

enum JobNames {
  PROCESS_DEPOSIT = "PROCESS_DEPOSIT",
}

interface ProcessDeposit extends JobAttributesData {
  transactionId: string;
}

async function processDepositHandler(job: Job<ProcessDeposit>) {
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
    await whatsappBusinessService.sendVideoContent(
      (transaction.fromUser as IUser).whatsappNumber,
      CONSTANTS.MONEY_IN_MEDIA,
      result.message
    );
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
    }
    await agenda.cancel({ name: JobNames.PROCESS_DEPOSIT });
  }
}

function definitionss() {
  agenda.define<ProcessDeposit>(
    JobNames.PROCESS_DEPOSIT,
    processDepositHandler
  );
}

definitionss();

// scheduler

async function scheduleProcessDeposit(transactionId: string) {
  console.log("Scheduling PROCESS_DEPOSIT job...");
  await agenda.start();
  const end = new Date(Date.now() + 10 * 60 * 1000); // run for 8 mins
  await agenda.every<ProcessDeposit>(
    "30 seconds",
    "PROCESS_DEPOSIT",
    {
      transactionId,
    },
    {
      endDate: end,
    }
  );
}

export { scheduleProcessDeposit };
