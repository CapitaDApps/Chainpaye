import { agenda } from ".";
import { processCryptoDepositHandler } from "./cryptoTopUp/job";
import { processDepositHandler } from "./topUp/job";
import { JobNames, ProcessDeposit, ProcessCryptoDeposit } from "./types";

export function definitions() {
  agenda.define<ProcessDeposit>(
    JobNames.PROCESS_DEPOSIT,
    processDepositHandler
  );
  agenda.define<ProcessCryptoDeposit>(
    JobNames.PROCESS_CRYPTO_DEPOSIT,
    processCryptoDepositHandler
  );
}
