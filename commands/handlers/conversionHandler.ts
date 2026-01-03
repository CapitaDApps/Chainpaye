import { whatsappBusinessService } from "../../services";

export async function handleConversion(from: string) {
  try {
    await whatsappBusinessService.sendConvertFiatFlowById(from);
  } catch (error) {
    console.log("Error sending conversion flow", error);
  }
}
