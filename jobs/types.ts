import { JobAttributesData } from "agenda";

export enum JobNames {
  PROCESS_DEPOSIT = "PROCESS_DEPOSIT",
  PROCESS_CRYPTO_DEPOSIT = "PROCESS_CRYPTO_DEPOSIT",
}

export interface ProcessDeposit extends JobAttributesData {
  transactionId: string;
}
