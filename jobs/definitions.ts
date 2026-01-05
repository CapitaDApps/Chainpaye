import { agenda } from ".";
import { processCryptoDepositHandler } from "./cryptoTopUp/job";
import { processDepositHandler } from "./topUp/job";
import { JobNames, ProcessDeposit } from "./types";

function definitionss() {
  agenda.define<ProcessDeposit>(
    JobNames.PROCESS_DEPOSIT,
    processDepositHandler
  );
  agenda.define<ProcessDeposit>(
    JobNames.PROCESS_CRYPTO_DEPOSIT,
    processCryptoDepositHandler
  );
}

definitionss();
