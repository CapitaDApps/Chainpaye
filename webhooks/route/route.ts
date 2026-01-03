import express, { Router } from "express";
import { transferFlowController } from "../controllers/transferFlow.controller";
import { setupPinFlow } from "../controllers/setupPinFlow.controller";
import { topupFlow } from "../controllers/topUpFlow.controller";
import { invoiceController } from "../controllers/invoice.controller";
import { userSetup } from "../controllers/userSetup.controller";
import { withdrawalFlow } from "../controllers/withdrawalFlow.controller";
import { generateLinkFlow } from "../controllers/grl.controller";
import { conversionFlow } from "../controllers/conversion.controller";

const router: Router = express.Router();

router.post("/transfer", transferFlowController);
router.post("/pin", setupPinFlow);
router.post("/topup", topupFlow);
router.post("/create-invoice", invoiceController);
router.post("/user-setup", userSetup);
router.post("/withdrawal-flow", withdrawalFlow);
router.post("/generate-link", generateLinkFlow);
router.post("/convert", conversionFlow);
export default router;
