import { whatsappBusinessService } from "../../services";

export async function handlePaymentLink(from: string) {
  try {
    await whatsappBusinessService.sendPaymentLinkFlowById(from);
  } catch (error) {
    console.log("Error sending payment-link flow", error);
  }
}
