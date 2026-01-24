import { JobAttributesData } from "agenda";

export const JobNames = {
  PROCESS_DEPOSIT: "PROCESS_DEPOSIT",
  PROCESS_CRYPTO_DEPOSIT: "PROCESS_CRYPTO_DEPOSIT",
};

export interface ProcessDeposit extends JobAttributesData {
  transactionId: string;
}

export interface ProcessCryptoDeposit extends ProcessDeposit {}
