import { userService, whatsappBusinessService } from "../../services";

export async function handleUsdDeposit(from: string) {
  try {
    const phone = from.startsWith("+") ? from : `+${from}`;
    const user = await userService.getUser(phone);

    if (!user) {
      await whatsappBusinessService.sendTemplateIntroMessage(from);
      return;
    }

    // Send USD deposit flow
    await whatsappBusinessService.sendUsdDepositFlowById(from);
  } catch (error) {
    console.log("Error handling USD deposit", error);
    // Fallback message
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error*\n\nCouldn't start USD deposit flow. Please try again later.",
      from
    );
  }
}