import { whatsappBusinessService } from "../services";
import { COMMANDS } from "./config";
import {
  handleBalance,
  handleConversion,
  handleTopUp,
  handleTransactionHistory,
  handleWithdrawal,
} from "./handlers";
import dotenv from "dotenv";
dotenv.config();

export async function commandRouteHandler(from: string, command: string) {
  command = command.toLowerCase();
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
    try {
      await whatsappBusinessService.sendIntroMessageByFlowId(from);
    } catch (err) {
      console.log(
        "Error sending intro flow",
        (err as { response: any }).response.data
      );
    }
  }
}
