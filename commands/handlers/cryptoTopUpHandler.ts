import { whatsappBusinessService } from "../../services";

export async function handleCryptoTopUp(from: string) {
  try {
    await whatsappBusinessService.sendCrptoTopUpFlowById(from);
  } catch (error) {
    console.log("Error sending crypto top-up flow", error);
  }
}
