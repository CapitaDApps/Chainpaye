import express, { Router } from "express";
import { transferFlowController } from "../controllers/transferFlow.controller";
import { setupPinFlow } from "../controllers/setupPinFlow.controller";
import { topupFlow } from "../controllers/topUpFlow.controller";
import { invoiceController } from "../controllers/invoice.controller";

const router: Router = express.Router();

router.post("/transfer", transferFlowController);
router.post("/pin", setupPinFlow);
router.post("/topup", topupFlow);
router.post("/create-invoice", invoiceController);

export default router;
