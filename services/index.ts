import { loadEnv } from "../config/env";

// Load environment variables
loadEnv();

import { ToronetService } from "./ToronetService";
import { TransactionService } from "./TransactionService";
import { UserService } from "./UserService";
import { WalletService } from "./WalletService";
import { WhatsAppBusinessService } from "./WhatsAppBusinessService";

const whatsappBusinessService = new WhatsAppBusinessService();
const toronetService = new ToronetService();
const userService = new UserService();
const walletService = new WalletService();
const transactionService = TransactionService;

export {
  whatsappBusinessService,
  toronetService,
  userService,
  walletService,
  transactionService,
};
