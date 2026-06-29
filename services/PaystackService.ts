import axios from "axios";
import { logger } from "../utils/logger";

const PAYSTACK_BASE = "https://api.paystack.co";

function getPaystackHeaders() {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || ""}`,
  };
}

export interface ResolvedAccount {
  accountName: string;
  accountNumber: string;
}

/**
 * Resolve an account name via Paystack's /bank/resolve endpoint.
 * Works for NGN (NUBAN), ZAR, KES bank accounts.
 * For mobile money, pass the phone number as accountNumber and the network code as bankCode —
 * Paystack will return the registered account name if available.
 *
 * @param accountNumber - Bank account number or mobile money phone number
 * @param bankCode      - Paystack bank code (from PCXPay network code for non-NGN)
 * @returns Resolved account name and number
 */
export async function resolvePaystackAccount(
  accountNumber: string,
  bankCode: string,
): Promise<ResolvedAccount> {
  const url = `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;

  try {
    logger.info(`[PAYSTACK] Resolving account: number=${accountNumber}, bankCode=${bankCode}`);
    const response = await axios.get(url, { headers: getPaystackHeaders() });

    if (!response.data?.status || !response.data?.data?.account_name) {
      throw new Error("Account resolution returned no name.");
    }

    const accountName = response.data.data.account_name as string;
    logger.info(`[PAYSTACK] Resolved: ${accountNumber} → ${accountName}`);

    return {
      accountName,
      accountNumber: response.data.data.account_number ?? accountNumber,
    };
  } catch (err: any) {
    const paystackMsg = err.response?.data?.message;
    const status = err.response?.status;
    logger.error(`[PAYSTACK] Resolve failed (status=${status}): ${paystackMsg || err.message}`);
    throw new Error(
      paystackMsg || "Could not verify account. Please check the details and try again.",
    );
  }
}
