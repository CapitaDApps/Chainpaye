import { whatsappBusinessService } from "../../services";

export async function handleSupport(from: string) {
  try {
    await whatsappBusinessService.sendSupportMessage(from);
  } catch (error) {
    console.log("Error sending support message", error);
  }
}
