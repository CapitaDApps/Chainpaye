import express, { Router } from "express";
import { conversionFlow } from "../controllers/conversion.controller";
import { bankDetailsFlowController } from "../controllers/bankDetailsFlow.controller";
import { cryptoTopupFlow } from "../controllers/cryptoTopUp.controller";
import {
  handleCrossmintDepositWebhook,
  testDepositNotification,
} from "../controllers/depositNotification.controller";
import { generateLinkFlow } from "../controllers/grl.controller";
import { invoiceController } from "../controllers/invoice.controller";
import { kycFlowController } from "../controllers/kyc.controller";
import { paymentLinkSuccessWebhook } from "../controllers/paymentLinkWebhook.controller";
import { handleReferralWithdrawalFlow } from "../controllers/referralWithdrawalFlow.controller";
import { onrampFlowController } from "../controllers/onrampFlow.controller";
import { setupPinFlow } from "../controllers/setupPinFlow.controller";
import { resetPinFlow } from "../controllers/resetPinFlow.controller";
import { topupFlow } from "../controllers/topUpFlow.controller";
import { transferFlowController } from "../controllers/transferFlow.controller";
import { usdDepositFlowController } from "../controllers/usdDepositFlow.controller";
import { userSetup } from "../controllers/userSetup.controller";
import { withdrawalFlow } from "../controllers/withdrawalFlow.controller";
import { imagePaymentFlowController } from "../controllers/imagePaymentFlow.controller";
import { verifyCrossmintWebhook } from "../middleware";

const router: Router = express.Router();

router.post("/transfer", transferFlowController);
router.post("/pin", setupPinFlow);
router.post("/reset-pin", resetPinFlow);
router.post("/topup", topupFlow);
router.post("/create-invoice", invoiceController);
router.post("/user-setup", userSetup);
router.post("/kyc", kycFlowController);
router.post("/withdrawal-flow", withdrawalFlow);
router.post("/image-payment", imagePaymentFlowController);
router.post("/referral-withdrawal", handleReferralWithdrawalFlow);
router.post("/generate-link", generateLinkFlow);
router.post("/convert", conversionFlow);
router.post("/offramp", cryptoTopupFlow);
router.post("/usd-deposit", usdDepositFlowController);
router.post("/bank-details", bankDetailsFlowController);
router.post("/buy-crypto", onrampFlowController);
router.post("/complete-transaction", onrampFlowController);

// Enhanced deposit notification webhooks with WorkflowController integration
// Protected with Crossmint signature verification
router.post("/deposit-notification", verifyCrossmintWebhook, handleCrossmintDepositWebhook);
router.post("/test-deposit-notification", testDepositNotification); // No verification for testing
router.post("/payment-link/success", paymentLinkSuccessWebhook);

// Legacy webhook endpoint (for backward compatibility)
router.post("/deposit-webhook", verifyCrossmintWebhook, handleCrossmintDepositWebhook);

export default router;
