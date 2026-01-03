import { whatsappBusinessService } from "../../services";

export async function handleTopUp(from: string) {
  try {
    await whatsappBusinessService.sendTopUpFlowById(from);
  } catch (error) {
    console.log("Error sending top-up flow", error);
  }
}
