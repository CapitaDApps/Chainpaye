import axios from "axios";
import { User } from "../../models/User";
import { redisClient } from "../../services/redis";
import { logger } from "../../utils/logger";

const PAYSTACK_BASE = "https://api.paystack.co";

function getPaystackHeaders() {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || ""}`,
  };
}

function getLinkioHeaders() {
  return {
    "ngnc-sec-key": process.env.LINKIO_SEC_KEY || "",
    "Content-Type": "application/json",
  };
}

function getPaymentMethod(country: string): string {
  if (country === "ghana") return "bank_transfer_gh";
  if (country === "kenya") return "bank_transfer_kenya";
  return "bank_transfer_gh";
}

function getCurrency(country: string): string {
  if (country === "ghana") return "ghs";
  if (country === "kenya") return "kes";
  return "ghs";
}

async function fetchBanksFromPaystack(
  country: string,
): Promise<{ id: string; title: string }[]> {
  const countryName = country === "ghana" ? "ghana" : "kenya";
  const currency = getCurrency(country);

  const url = `${PAYSTACK_BASE}/bank?country=${countryName}&currency=${currency}`;
  const response = await axios.get(url, { headers: getPaystackHeaders() });

  if (!response.data?.status || !Array.isArray(response.data?.data)) {
    throw new Error("Failed to fetch banks from Paystack");
  }

  return response.data.data
    .filter((b: any) => b.active && !b.is_deleted)
    .map((b: any) => ({
      id: b.code,
      title: b.name,
    }));
}

async function resolveAccount(
  accountNumber: string,
  bankCode: string,
): Promise<{ accountName: string; bankName: string }> {
  const url = `${PAYSTACK_BASE}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`;

  try {
    const response = await axios.get(url, { headers: getPaystackHeaders() });

    if (!response.data?.status || !response.data?.data?.account_name) {
      throw new Error("Could not resolve account. Check account number and bank.");
    }

    return {
      accountName: response.data.data.account_name as string,
      bankName: "",
    };
  } catch (err: any) {
    const paystackMessage = err.response?.data?.message;
    throw new Error(
      paystackMessage || "Could not verify account. Check the account number and selected bank.",
    );
  }
}

async function addPayoutAccountToLinkio(params: {
  destination: string;
  paymentMethod: string;
  customerId: string;
  name: string;
  accountNumber: string;
  bankName: string;
}): Promise<{ payoutId: string; payoutMethod: string }> {
  const url = `https://api.linkio.world/transactions/v2/direct_ramp/payout_account?destination=${params.destination}&payment_method=${params.paymentMethod}&customer_id=${params.customerId}&name=${encodeURIComponent(params.name)}&account_number=${params.accountNumber}&bank_name=${encodeURIComponent(params.bankName)}`;

  const response = await axios.post(url, {}, { headers: getLinkioHeaders() });

  if (response.data?.status !== "Success") {
    throw new Error(
      response.data?.message || "Failed to add payout account on Linkio",
    );
  }

  return {
    payoutId: response.data.data.payout_id,
    payoutMethod: response.data.data.payout_method,
  };
}

export async function getAddBeneficiaryFlowScreen(decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) {
  const { screen, data, action, flow_token } = decryptedBody;

  if (action === "ping") {
    return { data: { status: "active" } };
  }

  if (data?.error) {
    logger.warn("Add beneficiary flow received error action", { data });
    return { data: { status: "Error", acknowledged: true } };
  }

  if (action === "INIT") {
    return {
      screen: "SELECT_COUNTRY",
      data: { error_message: "", has_error: false },
    };
  }

  if (action === "data_exchange") {
    const userPhone = await redisClient.get(flow_token);
    if (!userPhone) {
      return {
        screen,
        data: { error_message: "Session expired. Please start again.", has_error: true },
      };
    }
    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    switch (screen) {
      // ── SCREEN 1: country selected → fetch banks → go to BANK_DETAILS ──
      case "SELECT_COUNTRY": {
        const { country } = data;
        if (!country) {
          return {
            screen: "SELECT_COUNTRY",
            data: { error_message: "Please select a country.", has_error: true },
          };
        }

        try {
          const banks = await fetchBanksFromPaystack(country);
          return {
            screen: "BANK_DETAILS",
            data: {
              country,
              banks,
              error_message: "",
              has_error: false,
            },
          };
        } catch (err: any) {
          logger.error("Error fetching banks", err);
          return {
            screen: "SELECT_COUNTRY",
            data: {
              error_message: "Could not load banks. Please try again.",
              has_error: true,
            },
          };
        }
      }

      // ── SCREEN 2: bank details submitted → resolve account → go to CONFIRM ──
      case "BANK_DETAILS": {
        const { country, bank_id, account_number, account_name, destination } =
          data;

        if (!bank_id || !account_number || !account_name || !destination) {
          const banks = await fetchBanksFromPaystack(country).catch(() => []);
          return {
            screen: "BANK_DETAILS",
            data: {
              country,
              banks,
              error_message: "All fields are required.",
              has_error: true,
            },
          };
        }

        const bankCode = bank_id;

        // Fetch banks once — used for both name lookup and error fallback
        const banks = await fetchBanksFromPaystack(country).catch(() => []);
        const bankName = banks.find((b) => b.id === bankCode)?.title ?? bankCode;

        // Resolve account name via Paystack
        let resolvedAccountName: string;
        try {
          const resolved = await resolveAccount(account_number, bankCode);
          resolvedAccountName = resolved.accountName;
        } catch (err: any) {
          return {
            screen: "BANK_DETAILS",
            data: {
              country,
              banks,
              error_message:
                err.message ||
                "Could not verify account. Check account number and bank.",
              has_error: true,
            },
          };
        }

        const destinationLabel =
          destination === "first_party"
            ? "First Party (My Account)"
            : destination === "third_party"
              ? "Third Party (Someone Else)"
              : destination;

        return {
          screen: "CONFIRM",
          data: {
            country,
            bank_name: bankName,
            bank_code: bankCode,
            account_number,
            account_name,
            destination: destinationLabel,
            destination_id: destination,
            resolved_account_name: resolvedAccountName,
          },
        };
      }

      // ── SCREEN 4 (PIN): verify PIN → call Linkio → save to User ──
      case "PIN": {
        const {
          pin,
          country,
          bank_name,
          bank_code,
          account_number,
          account_name,
          destination,
        } = data;

        const user = await User.findOne({ whatsappNumber: phone }).select(
          "+pin",
        );
        if (!user) {
          return {
            screen: "PIN",
            data: { error_message: "User not found. Please restart.", has_error: true },
          };
        }

        const isValidPin = await user.comparePin(pin);
        if (!isValidPin) {
          return {
            screen: "PIN",
            data: { error_message: "Incorrect PIN. Please try again.", has_error: true },
          };
        }

        if (!user.linkioCustomerId) {
          return {
            screen: "PIN",
            data: {
              error_message: "Your account is not fully set up. Please contact support.",
              has_error: true,
            },
          };
        }

        const paymentMethod = getPaymentMethod(country);

        try {
          const { payoutId, payoutMethod } = await addPayoutAccountToLinkio({
            destination,
            paymentMethod,
            customerId: user.linkioCustomerId,
            name: account_name,
            accountNumber: account_number,
            bankName: bank_name,
          });

          // Save to user's payoutAccounts array
          await User.updateOne(
            { whatsappNumber: phone },
            {
              $push: {
                payoutAccounts: {
                  payoutId,
                  payoutMethod,
                  bankName: bank_name,
                  accountNumber: account_number,
                  accountName: account_name,
                  destination,
                  country,
                  createdAt: new Date(),
                },
              },
            },
          );

          logger.info(`Beneficiary added for ${phone}: ${payoutId}`);

          return {
            screen: "SUCCESS",
            data: {},
          };
        } catch (err: any) {
          logger.error("Error adding Linkio payout account", err);
          return {
            screen: "PIN",
            data: {
              error_message:
                err.message || "Failed to add beneficiary. Please try again.",
              has_error: true,
            },
          };
        }
      }

      default:
        break;
    }
  }

  logger.error("Unhandled add beneficiary flow request", decryptedBody);
  throw new Error("Unhandled flow request.");
}
