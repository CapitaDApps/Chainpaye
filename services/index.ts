import { ToronetService } from "./ToronetService";
import { TransactionService } from "./TransactionService";
import { UserService } from "./UserService";
import { WalletService } from "./WalletService";
import { WhatsAppBusinessService } from "./WhatsAppBusinessService";

import { crossmintService } from "./CrossmintService";
import { dexPayService } from "./DexPayService";
import { financialService } from "./crypto-off-ramp/FinancialService";

const whatsappBusinessService = new WhatsAppBusinessService();
const toronetService = new ToronetService();
const userService = new UserService();
const walletService = new WalletService();
const transactionService = TransactionService;

export {
  crossmintService,
  dexPayService,
  financialService,
  toronetService,
  transactionService,
  userService,
  walletService,
  whatsappBusinessService,
};
