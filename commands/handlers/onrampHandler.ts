/**
 * Onramp Handler — Buy Crypto
 * Triggered when user types "buy crypto" or related phrases.
 * Opens the BUY_CRYPTO_FORM WhatsApp Flow.
 *
 * Requirements: 1.1, 1.2, 1.3
 */

import { User } from "../../models/User";
import { whatsappBusinessService } from "../../services";
import { logger } from "../../utils/logger";

export async function handleBuyCrypto(phoneNumber: string): Promise<void> {
  try {
    const phone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    const user = await User.findOne({ whatsappNumber: phone });

    if (!user) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ *Account Not Found*\n\nPlease create an account first to buy crypto.\n\nType *menu* to get started.",
        phoneNumber,
      );
      return;
    }

    await whatsappBusinessService.sendBuyCryptoFlow(phoneNumber);
  } catch (error) {
    logger.error(`Error in handleBuyCrypto for ${phoneNumber}:`, error);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Error*\n\nSomething went wrong. Please try again later.",
      phoneNumber,
    );
  }
}
