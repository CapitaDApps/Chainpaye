import { whatsappBusinessService } from "../../services";

export async function handleTransfer(from: string) {
  try {
    await whatsappBusinessService.sendTransferFlowById(from);
  } catch (error) {
    console.log("Error starting transfer flow", error);
  }
}
