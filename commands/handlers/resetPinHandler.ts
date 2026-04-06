import { User } from "../../models/User";
import { whatsappBusinessService } from "../../services";
import { generateAndSendResetLink } from "../../webhooks/services/resetPinFlow.service";
import { logger } from "../../utils/logger";

export async function handleResetPin(phoneNumber: string): Promise<void> {
  const phone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;

  try {
    const user = await User.findOne({ whatsappNumber: phone });

    if (!user) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ Account not found. Please create an account first.",
        phoneNumber,
      );
      return;
    }

    if (user.email) {
      // Email already on file — send reset link directly
      await generateAndSendResetLink(phone, user.email);
      await whatsappBusinessService.sendNormalMessage(
        `🔐 A PIN reset link has been sent to ${user.email}.\n\nThe link expires in *15 minutes*. Check your inbox (and spam folder).`,
        phoneNumber,
      );
    } else {
      // No email — send WhatsApp flow to collect it
      await whatsappBusinessService.sendResetPinEmailCollectionFlow(phoneNumber);
    }
  } catch (error) {
    logger.error("Error in handleResetPin", { error, phone });
    await whatsappBusinessService.sendNormalMessage(
      "❌ Something went wrong. Please try again later.",
      phoneNumber,
    );
  }
}
