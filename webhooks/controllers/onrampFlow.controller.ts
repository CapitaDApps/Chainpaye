/**
 * Onramp Flow Controller
 *
 * Handles WhatsApp encrypted flow submissions for the crypto onramp (buy crypto) feature.
 * Uses flowMiddleware for request decryption, signature validation, and response encryption.
 *
 * Routes:
 *   POST /buy-crypto           — handles BUY_CRYPTO_FORM and RETURN_TO_CHAT screens
 *   POST /complete-transaction — handles COMPLETE_TRANSACTION_FORM and TRANSACTION_RECEIVED screens
 *
 * Both routes share the same controller since the service handles all screen routing.
 *
 * Requirements: 10.5
 */

import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { getOnrampFlowScreen } from "../services/onrampFlowService";
import { logger } from "../../utils/logger";

async function onrampFlowHandler(req: Request, _res: Response) {
  const { decryptedBody } = req.decryptedData!;
  logger.info("Onramp flow controller:", {
    action: decryptedBody.action,
    screen: decryptedBody.screen,
  });
  return getOnrampFlowScreen(decryptedBody);
}

export const onrampFlowController = flowMiddleware(onrampFlowHandler);
