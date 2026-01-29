import express, { Router } from "express";
import { conversionFlow } from "../controllers/conversion.controller";
import { cryptoTopupFlow } from "../controllers/cryptoTopUp.controller";
import {
  handleCrossmintDepositWebhook,
  testDepositNotification,
} from "../controllers/depositNotification.controller";
import { generateLinkFlow } from "../controllers/grl.controller";
import { invoiceController } from "../controllers/invoice.controller";
import { kycFlowController } from "../controllers/kyc.controller";
import { setupPinFlow } from "../controllers/setupPinFlow.controller";
import { topupFlow } from "../controllers/topUpFlow.controller";
import { transferFlowController } from "../controllers/transferFlow.controller";
import { userSetup } from "../controllers/userSetup.controller";
import { withdrawalFlow } from "../controllers/withdrawalFlow.controller";

const router: Router = express.Router();

router.post("/transfer", transferFlowController);
router.post("/pin", setupPinFlow);
router.post("/topup", topupFlow);
router.post("/create-invoice", invoiceController);
router.post("/user-setup", userSetup);
router.post("/kyc", kycFlowController);
router.post("/withdrawal-flow", withdrawalFlow);
router.post("/generate-link", generateLinkFlow);
router.post("/convert", conversionFlow);
router.post("/offramp", cryptoTopupFlow);

// Enhanced deposit notification webhooks with WorkflowController integration
router.post("/deposit-notification", handleCrossmintDepositWebhook);
router.post("/test-deposit-notification", testDepositNotification);

// Legacy webhook endpoint (for backward compatibility)
router.post("/deposit-webhook", handleCrossmintDepositWebhook);

export default router;
