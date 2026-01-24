import { whatsappBusinessService } from "../../services";

export async function handleWithdrawal(from: string) {
  try {
    await whatsappBusinessService.sendWithdrawalFlowById(from);
  } catch (error) {
    console.log("Error sending withdrawal flow", error);
  }
}
