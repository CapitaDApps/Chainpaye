import { whatsappBusinessService } from "../services";
import { COMMANDS } from "./config";
import {
  handleBalance,
  handleConversion,
  handleTopUp,
  handleTransactionHistory,
  handleWithdrawal,
} from "./handlers";

export async function commandRouteHandler(from: string, command: string) {
  // routing logic here
  if (COMMANDS.balance.includes(command)) {
    await handleBalance(from);
  } else if (COMMANDS.withdraw.includes(command)) {
    await handleWithdrawal(from);
  } else if (COMMANDS.convert.includes(command)) {
    await handleConversion(from);
  } else if (COMMANDS.transactionHistory.includes(command)) {
    await handleTransactionHistory(from);
  } else if (COMMANDS.deposit.includes(command)) {
    await handleTopUp(from);
  } else {
    await whatsappBusinessService.sendIntroMessageByFlowId(from);
  }
}
