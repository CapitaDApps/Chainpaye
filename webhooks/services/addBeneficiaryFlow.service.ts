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

async function fetchPaymentMethods(
  country: string,
): Promise<{ id: string; title: string }[]> {
  const url = `https://api.linkio.world/transactions/v2/direct_ramp/payment_methods?country=${country}`;

  try {
    const response = await axios.get(url, { headers: getLinkioHeaders() });

    if (response.data?.status !== "Success" || !Array.isArray(response.data?.data?.payment_methods)) {
      throw new Error("Failed to fetch payment methods");
    }

    return response.data.data.payment_methods.map((pm: any) => ({
      id: pm.identifier,
      title: pm.method,
    }));
  } catch (err: any) {
    logger.error("Error fetching payment methods", err);
    throw new Error("Could not load payment methods. Please try again.");
  }
}

function isMobileMoneyMethod(paymentMethod: string): boolean {
  const mobileMoneyMethods = [
    "mtn_momo_gh",
    "vodafone_cash_gh",
    "mpesa",
    "airtel_money",
  ];
  return mobileMoneyMethods.includes(paymentMethod);
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
  accountNumber?: string;
  bankName?: string;
  phoneNumber?: string;
}): Promise<{ payoutId: string; payoutMethod: string }> {
  let url = `https://api.linkio.world/transactions/v2/direct_ramp/payout_account?destination=${params.destination}&payment_method=${params.paymentMethod}&customer_id=${params.customerId}&name=${encodeURIComponent(params.name)}`;

  if (params.accountNumber) {
    url += `&account_number=${params.accountNumber}`;
  }
  if (params.bankName) {
    url += `&bank_name=${encodeURIComponent(params.bankName)}`;
  }
  if (params.phoneNumber) {
    url += `&phone_number=${encodeURIComponent(params.phoneNumber)}`;
  }

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
      // ── SCREEN 1: country selected → fetch payment methods → go to SELECT_PAYMENT_METHOD ──
      case "SELECT_COUNTRY": {
        const { country } = data;
        if (!country) {
          return {
            screen: "SELECT_COUNTRY",
            data: { error_message: "Please select a country.", has_error: true },
          };
        }

        try {
          const paymentMethods = await fetchPaymentMethods(country);
          return {
            screen: "SELECT_PAYMENT_METHOD",
            data: {
              country,
              payment_methods: paymentMethods,
              error_message: "",
              has_error: false,
            },
          };
        } catch (err: any) {
          logger.error("Error fetching payment methods", err);
          return {
            screen: "SELECT_COUNTRY",
            data: {
              error_message: "Could not load payment methods. Please try again.",
              has_error: true,
            },
          };
        }
      }

      // ── SCREEN 2: payment method selected → fetch banks → go to BANK_DETAILS ──
      case "SELECT_PAYMENT_METHOD": {
        const { country, payment_method } = data;
        if (!payment_method) {
          const paymentMethods = await fetchPaymentMethods(country).catch(() => []);
          return {
            screen: "SELECT_PAYMENT_METHOD",
            data: {
              country,
              payment_methods: paymentMethods,
              error_message: "Please select a payment method.",
              has_error: true,
            },
          };
        }

        const isMobileMoney = isMobileMoneyMethod(payment_method);
        
        // Always fetch banks (mobile money providers are listed as banks)
        let banks: { id: string; title: string }[] = [];
        try {
          banks = await fetchBanksFromPaystack(country);
        } catch (err: any) {
          logger.error("Error fetching banks", err);
          const paymentMethods = await fetchPaymentMethods(country).catch(() => []);
          return {
            screen: "SELECT_PAYMENT_METHOD",
            data: {
              country,
              payment_methods: paymentMethods,
              error_message: "Could not load banks. Please try again.",
              has_error: true,
            },
          };
        }

        // Get payment method name
        const paymentMethods = await fetchPaymentMethods(country).catch(() => []);
        const paymentMethodName = paymentMethods.find((pm) => pm.id === payment_method)?.title ?? payment_method;

        return {
          screen: "BANK_DETAILS",
          data: {
            country,
            payment_method,
            payment_method_name: paymentMethodName,
            is_mobile_money: isMobileMoney,
            is_bank_transfer: !isMobileMoney,
            banks,
            error_message: "",
            has_error: false,
          },
        };
      }

      // ── SCREEN 3: bank details submitted → validate → resolve account → go to CONFIRM ──
      case "BANK_DETAILS": {
        const { country, payment_method, phone_number, bank_id, account_number, account_name, destination } = data;

        if (!bank_id || !account_name || !destination) {
          const banks = await fetchBanksFromPaystack(country).catch(() => []);
          const paymentMethods = await fetchPaymentMethods(country).catch(() => []);
          const paymentMethodName = paymentMethods.find((pm) => pm.id === payment_method)?.title ?? payment_method;
          const isMobileMoney = isMobileMoneyMethod(payment_method);

          return {
            screen: "BANK_DETAILS",
            data: {
              country,
              payment_method,
              payment_method_name: paymentMethodName,
              is_mobile_money: isMobileMoney,
              is_bank_transfer: !isMobileMoney,
              banks,
              error_message: "Bank, account name, and destination are required.",
              has_error: true,
            },
          };
        }

        const isMobileMoney = isMobileMoneyMethod(payment_method);

        // Validate based on payment method type
        if (isMobileMoney && !phone_number) {
          const banks = await fetchBanksFromPaystack(country).catch(() => []);
          const paymentMethods = await fetchPaymentMethods(country).catch(() => []);
          const paymentMethodName = paymentMethods.find((pm) => pm.id === payment_method)?.title ?? payment_method;

          return {
            screen: "BANK_DETAILS",
            data: {
              country,
              payment_method,
              payment_method_name: paymentMethodName,
              is_mobile_money: isMobileMoney,
              is_bank_transfer: !isMobileMoney,
              banks,
              error_message: "Phone number is required for mobile money.",
              has_error: true,
            },
          };
        }

        if (!isMobileMoney && !account_number) {
          const banks = await fetchBanksFromPaystack(country).catch(() => []);
          const paymentMethods = await fetchPaymentMethods(country).catch(() => []);
          const paymentMethodName = paymentMethods.find((pm) => pm.id === payment_method)?.title ?? payment_method;

          return {
            screen: "BANK_DETAILS",
            data: {
              country,
              payment_method,
              payment_method_name: paymentMethodName,
              is_mobile_money: isMobileMoney,
              is_bank_transfer: !isMobileMoney,
              banks,
              error_message: "Account number is required for bank transfer.",
              has_error: true,
            },
          };
        }

        const bankCode = bank_id;
        const banks = await fetchBanksFromPaystack(country).catch(() => []);
        const bankName = banks.find((b) => b.id === bankCode)?.title ?? bankCode;

        // For mobile money, use phone number as account number for resolution
        const accountNumberForResolution = isMobileMoney ? phone_number : account_number;
        let resolvedAccountName = account_name;

        // Resolve account name via Paystack
        if (accountNumberForResolution) {
          try {
            const resolved = await resolveAccount(accountNumberForResolution, bankCode);
            resolvedAccountName = resolved.accountName;
          } catch (err: any) {
            const paymentMethods = await fetchPaymentMethods(country).catch(() => []);
            const paymentMethodName = paymentMethods.find((pm) => pm.id === payment_method)?.title ?? payment_method;

            return {
              screen: "BANK_DETAILS",
              data: {
                country,
                payment_method,
                payment_method_name: paymentMethodName,
                is_mobile_money: isMobileMoney,
                is_bank_transfer: !isMobileMoney,
                banks,
                error_message:
                  err.message ||
                  "Could not verify account. Check the details and try again.",
                has_error: true,
              },
            };
          }
        }

        const destinationLabel =
          destination === "first_party"
            ? "First Party (My Account)"
            : destination === "third_party"
              ? "Third Party (Someone Else)"
              : destination;

        const paymentMethods = await fetchPaymentMethods(country).catch(() => []);
        const paymentMethodName = paymentMethods.find((pm) => pm.id === payment_method)?.title ?? payment_method;

        return {
          screen: "CONFIRM",
          data: {
            country,
            payment_method,
            payment_method_name: paymentMethodName,
            phone_number: phone_number || "",
            bank_name: bankName,
            bank_code: bankCode,
            account_number: account_number || "",
            account_name,
            destination: destinationLabel,
            destination_id: destination,
            resolved_account_name: resolvedAccountName,
            has_phone: !!phone_number,
            has_account: !!account_number,
          },
        };
      }

      // ── SCREEN 5 (PIN): verify PIN → call Linkio → save to User ──
      case "PIN": {
        const {
          pin,
          country,
          payment_method,
          phone_number,
          bank_name,
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

        try {
          const { payoutId, payoutMethod } = await addPayoutAccountToLinkio({
            destination,
            paymentMethod: payment_method,
            customerId: user.linkioCustomerId,
            name: account_name,
            accountNumber: account_number || undefined,
            bankName: bank_name || undefined,
            phoneNumber: phone_number || undefined,
          });

          // Save to user's payoutAccounts array
          await User.updateOne(
            { whatsappNumber: phone },
            {
              $push: {
                payoutAccounts: {
                  payoutId,
                  payoutMethod,
                  paymentMethod: payment_method,
                  phoneNumber: phone_number || undefined,
                  bankName: bank_name || undefined,
                  accountNumber: account_number || undefined,
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
