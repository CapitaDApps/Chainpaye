import axios from "axios";
import { User } from "../../models/User";
import { Wallet } from "../../models/Wallet";
import { whatsappBusinessService } from "../../services";
import { redisClient } from "../../services/redis";

type SupportedCurrency = "NGN" | "USD" | "GBP" | "EUR";
type PaymentMethod = "bank" | "card";

interface AllowedMethod {
  id: PaymentMethod;
  title: string;
}

interface PaymentLinkCreatePayload {
  merchantId: string;
  userId: string;
  name: string;
  amount: string;
  currency: SupportedCurrency;
  address: string;
  token: string;
  selectedCurrency: SupportedCurrency;
  paymentType: PaymentMethod;
  description?: string;
  successUrl?: string;
  metadata?: Record<string, unknown>;
}

interface PaymentLinkApiData {
  id?: string;
  linkUrl?: string;
  link_url?: string;
}

interface PaymentLinkApiResponse {
  success?: boolean;
  data?: PaymentLinkApiData;
  message?: string;
}

const CURRENCIES: Array<{
  code: SupportedCurrency;
  methods: PaymentMethod[];
  defaultToken: string;
}> = [
  { code: "NGN", methods: ["bank"], defaultToken: "TORONGN" },
  { code: "USD", methods: ["bank", "card"], defaultToken: "USDT" },
  { code: "GBP", methods: ["card"], defaultToken: "USDT" },
  { code: "EUR", methods: ["card"], defaultToken: "USDT" },
];

const allowedMethodCard: AllowedMethod = { id: "card", title: "Card Payment" };
const allowedMethodBank: AllowedMethod = {
  id: "bank",
  title: "Bank Transfer",
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank: "Bank Transfer",
  card: "Card Payment",
};

const FLOW_ERROR_TEXT = "Session expired. Restart flow from a new message.";
const DEFAULT_PAYMENT_LINK_API_BASE_URL =
  "https://chainpaye-backend.onrender.com/";

function normalizeCurrency(value: unknown): SupportedCurrency | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "NGN" ||
    normalized === "USD" ||
    normalized === "GBP" ||
    normalized === "EUR"
  ) {
    return normalized;
  }
  return null;
}

function normalizeMethod(value: unknown): PaymentMethod | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "bank" || normalized === "card") {
    return normalized;
  }
  return null;
}

function extractSelectedMethods(value: unknown): PaymentMethod[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeMethod(item))
      .filter((item): item is PaymentMethod => !!item);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => normalizeMethod(item))
          .filter((item): item is PaymentMethod => !!item);
      }
    } catch (_error) {
      // not JSON, continue
    }

    if (trimmed.includes(",")) {
      return trimmed
        .split(",")
        .map((item) => normalizeMethod(item))
        .filter((item): item is PaymentMethod => !!item);
    }

    const single = normalizeMethod(trimmed);
    return single ? [single] : [];
  }

  return [];
}

function getCurrencyConfig(currency: SupportedCurrency) {
  return CURRENCIES.find((item) => item.code === currency);
}

function getAllowedMethods(currency: SupportedCurrency): AllowedMethod[] {
  const config = getCurrencyConfig(currency);
  if (!config) return [];

  const methods: AllowedMethod[] = [];
  if (config.methods.includes("card")) methods.push(allowedMethodCard);
  if (config.methods.includes("bank")) methods.push(allowedMethodBank);
  return methods;
}

function formatAmountToString(amount: number): string {
  return amount.toFixed(2);
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(/,/g, "").trim());
  return NaN;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function getPaymentLinkApiBaseUrl(): string {
  const configured = process.env.PAYMENT_LINK_API_BASE_URL?.trim();
  const baseUrl = configured || DEFAULT_PAYMENT_LINK_API_BASE_URL;
  return baseUrl.replace(/\/+$/, "");
}

function getPaymentLinkApiTimeoutMs(): number {
  // Keep timeout below WhatsApp Flow response window to avoid client-side timeout/blank screens.
  const defaultTimeout = 12000;
  const maxSafeTimeout = 15000;
  const value = Number(
    process.env.PAYMENT_LINK_API_TIMEOUT_MS || defaultTimeout,
  );
  if (!Number.isFinite(value) || value <= 0) {
    return defaultTimeout;
  }
  return Math.min(value, maxSafeTimeout);
}

function getPaymentLinkSuccessWebhookUrl(): string {
  const configured = process.env.PAYMENT_LINK_SUCCESS_WEBHOOK_URL?.trim();
  if (configured) return configured;

  const appBaseUrl =
    process.env.APP_BASE_URL?.trim() || process.env.WEBHOOK_BASE_URL?.trim();
  if (!appBaseUrl) return "";

  return `${appBaseUrl.replace(/\/+$/, "")}/flow/payment-link/success`;
}

function getShareableLink(
  apiData: PaymentLinkApiData,
  fallbackBaseUrl: string,
): string | null {
  if (apiData.linkUrl) return apiData.linkUrl;
  if (apiData.link_url) return apiData.link_url;
  if (apiData.id) return `${fallbackBaseUrl}/payment/${apiData.id}`;
  return null;
}

async function createPaymentLink(
  payload: PaymentLinkCreatePayload,
): Promise<PaymentLinkApiData> {
  const apiBaseUrl = getPaymentLinkApiBaseUrl();
  if (apiBaseUrl.includes("your-api-domain.com")) {
    throw new Error(
      "Payment link API is not configured. Set PAYMENT_LINK_API_BASE_URL to your payment API.",
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = process.env.PAYMENT_LINK_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  console.log({ "Payment link API request:": payload, headers });

  const response = await axios.post<PaymentLinkApiResponse>(
    `${apiBaseUrl}/payment-links`,
    payload,
    {
      headers,
      timeout: getPaymentLinkApiTimeoutMs(),
    },
  );

  console.log({ "Payment link API response:": response.data, payload });

  if (response.data?.success === false) {
    throw new Error(
      response.data.message || "Payment link API rejected the request.",
    );
  }

  if (!response.data?.data) {
    throw new Error(
      response.data?.message || "Invalid payment link API response.",
    );
  }

  return response.data.data;
}

export async function getGenerateLinkScreen(decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) {
  const { screen, data, action, flow_token } = decryptedBody;

  // handle health check request
  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  // handle error notification
  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      data: {
        status: "Error",
        acknowledged: true,
      },
    };
  }

  // handle initial request when opening the flow
  if (action === "INIT") {
    return {
      screen: "CREATE_LINK_DETAILS",
      data: {
        currencies: CURRENCIES.map((item) => ({
          id: item.code,
          title: item.code,
        })),
      },
    };
  }

  if (action === "data_exchange") {
    const userPhone = await redisClient.get(flow_token);

    if (!userPhone) {
      return {
        screen: "CREATE_LINK_DETAILS",
        data: {
          error_message: FLOW_ERROR_TEXT,
          currencies: CURRENCIES.map((item) => ({
            id: item.code,
            title: item.code,
          })),
        },
      };
    }

    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    switch (screen) {
      case "CREATE_LINK_DETAILS": {
        const currency = normalizeCurrency(data?.currency);
        const amountValue = parseAmount(data?.amount);
        const title = typeof data?.title === "string" ? data.title.trim() : "";
        const description =
          typeof data?.description === "string" ? data.description.trim() : "";
        const successUrl =
          typeof data?.successUrl === "string" ? data.successUrl.trim() : "";

        if (!currency) {
          return {
            screen: "CREATE_LINK_DETAILS",
            data: {
              error_message: "Select a valid currency (NGN, USD, GBP, EUR).",
              currencies: CURRENCIES.map((item) => ({
                id: item.code,
                title: item.code,
              })),
            },
          };
        }

        if (!title || title.length > 100) {
          return {
            screen: "CREATE_LINK_DETAILS",
            data: {
              error_message: "Title is required and must be 1-100 characters.",
              currencies: CURRENCIES.map((item) => ({
                id: item.code,
                title: item.code,
              })),
            },
          };
        }

        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          return {
            screen: "CREATE_LINK_DETAILS",
            data: {
              error_message: "Enter a valid amount greater than zero.",
              currencies: CURRENCIES.map((item) => ({
                id: item.code,
                title: item.code,
              })),
            },
          };
        }

        if (description.length > 500) {
          return {
            screen: "CREATE_LINK_DETAILS",
            data: {
              error_message: "Description cannot exceed 500 characters.",
              currencies: CURRENCIES.map((item) => ({
                id: item.code,
                title: item.code,
              })),
            },
          };
        }

        if (successUrl && !isValidHttpUrl(successUrl)) {
          return {
            screen: "CREATE_LINK_DETAILS",
            data: {
              error_message: "Success URL must be a valid http(s) URL.",
              currencies: CURRENCIES.map((item) => ({
                id: item.code,
                title: item.code,
              })),
            },
          };
        }

        const methods = getAllowedMethods(currency);
        return {
          screen: "SELECT_METHODS",
          data: {
            title,
            description,
            currency,
            amount: formatAmountToString(amountValue),
            successUrl,
            allowed_methods: methods,
          },
        };
      }

      case "SELECT_METHODS": {
        const currency = normalizeCurrency(data?.currency);
        const title = typeof data?.title === "string" ? data.title.trim() : "";
        const description =
          typeof data?.description === "string" ? data.description.trim() : "";
        const successUrl =
          typeof data?.successUrl === "string" ? data.successUrl.trim() : "";
        const amountValue = parseAmount(data?.amount);
        const selectedMethods = extractSelectedMethods(
          data?.methods ?? data?.method ?? data?.paymentType,
        );

        if (!currency) {
          return {
            screen: "SELECT_METHODS",
            data: {
              title,
              description,
              currency: currency || "",
              amount: Number.isFinite(amountValue)
                ? formatAmountToString(amountValue)
                : "",
              successUrl,
              allowed_methods: currency ? getAllowedMethods(currency) : [],
              error_message: "Select a valid currency and payment method.",
            },
          };
        }

        if (selectedMethods.length === 0) {
          return {
            screen: "SELECT_METHODS",
            data: {
              title,
              description,
              currency,
              amount: Number.isFinite(amountValue)
                ? formatAmountToString(amountValue)
                : "",
              successUrl,
              allowed_methods: getAllowedMethods(currency),
              error_message: "Select a valid payment method.",
            },
          };
        }

        if (selectedMethods.length > 1) {
          return {
            screen: "SELECT_METHODS",
            data: {
              title,
              description,
              currency,
              amount: Number.isFinite(amountValue)
                ? formatAmountToString(amountValue)
                : "",
              successUrl,
              allowed_methods: getAllowedMethods(currency),
              error_message: "Select only one payment method to continue.",
            },
          };
        }

        const method = selectedMethods[0];
        if (!method) {
          return {
            screen: "SELECT_METHODS",
            data: {
              title,
              description,
              currency,
              amount: Number.isFinite(amountValue)
                ? formatAmountToString(amountValue)
                : "",
              successUrl,
              allowed_methods: getAllowedMethods(currency),
              error_message: "Select a valid payment method.",
            },
          };
        }

        const allowedMethods = getAllowedMethods(currency).map(
          (item) => item.id,
        );
        if (!allowedMethods.includes(method)) {
          return {
            screen: "SELECT_METHODS",
            data: {
              title,
              description,
              currency,
              amount: Number.isFinite(amountValue)
                ? formatAmountToString(amountValue)
                : "",
              successUrl,
              allowed_methods: getAllowedMethods(currency),
              error_message: `Payment method not supported for ${currency}.`,
            },
          };
        }

        return {
          screen: "REVIEW_AND_PIN",
          data: {
            title,
            description,
            currency,
            amount: Number.isFinite(amountValue)
              ? formatAmountToString(amountValue)
              : "",
            paymentType: method,
            paymentTypeLabel: METHOD_LABELS[method],
            successUrl,
          },
        };
      }

      case "REVIEW_AND_PIN": {
        const currency = normalizeCurrency(data?.currency);
        const paymentType = normalizeMethod(data?.paymentType);
        const amountValue = parseAmount(data?.amount);
        const title = typeof data?.title === "string" ? data.title.trim() : "";
        const description =
          typeof data?.description === "string" ? data.description.trim() : "";
        const successUrl =
          typeof data?.successUrl === "string" ? data.successUrl.trim() : "";
        const pin = typeof data?.pin === "string" ? data.pin.trim() : "";

        if (!pin) {
          return {
            screen: "REVIEW_AND_PIN",
            data: {
              title,
              description,
              currency: currency || "",
              amount: Number.isFinite(amountValue)
                ? formatAmountToString(amountValue)
                : "",
              paymentType: paymentType || "",
              paymentTypeLabel: paymentType ? METHOD_LABELS[paymentType] : "",
              successUrl,
              error_message: "Please enter your PIN.",
            },
          };
        }

        const user = await User.findOne({ whatsappNumber: phone }).select(
          "+pin",
        );
        if (!user) {
          throw new Error(`User with phone number - [${phone}] not found`);
        }

        if (!currency || !paymentType || !Number.isFinite(amountValue)) {
          return {
            screen: "REVIEW_AND_PIN",
            data: {
              title,
              description,
              currency: currency || "",
              amount: Number.isFinite(amountValue)
                ? formatAmountToString(amountValue)
                : "",
              paymentType: paymentType || "",
              paymentTypeLabel: paymentType ? METHOD_LABELS[paymentType] : "",
              successUrl,
              error_message:
                "Missing or invalid payment details. Restart the flow and try again.",
            },
          };
        }

        const allowedMethods = getAllowedMethods(currency).map(
          (item) => item.id,
        );
        if (!allowedMethods.includes(paymentType)) {
          return {
            screen: "REVIEW_AND_PIN",
            data: {
              title,
              description,
              currency,
              amount: formatAmountToString(amountValue),
              paymentType,
              paymentTypeLabel: METHOD_LABELS[paymentType],
              successUrl,
              error_message: `Payment method not supported for ${currency}.`,
            },
          };
        }

        const isValidPin = await user.comparePin(pin);
        if (!isValidPin) {
          return {
            screen: "REVIEW_AND_PIN",
            data: {
              title,
              description,
              currency,
              amount: formatAmountToString(amountValue),
              paymentType,
              paymentTypeLabel: METHOD_LABELS[paymentType],
              successUrl,
              error_message: "Incorrect pin",
            },
          };
        }

        if (amountValue <= 0) {
          return {
            screen: "REVIEW_AND_PIN",
            data: {
              title,
              description,
              currency,
              amount: formatAmountToString(amountValue),
              paymentType,
              paymentTypeLabel: METHOD_LABELS[paymentType],
              successUrl,
              error_message: "Invalid amount specified",
            },
          };
        }

        const config = getCurrencyConfig(currency);
        if (!config) {
          return {
            screen: "REVIEW_AND_PIN",
            data: {
              title,
              description,
              currency,
              amount: formatAmountToString(amountValue),
              paymentType,
              paymentTypeLabel: METHOD_LABELS[paymentType],
              successUrl,
              error_message: "Unsupported currency selected.",
            },
          };
        }

        const merchantId =
          process.env.PAYMENT_LINK_MERCHANT_ID?.trim() || user.userId;
        const wallet = await Wallet.findOne({ userId: user.userId });

        if (!wallet?.publicKey) {
          return {
            screen: "REVIEW_AND_PIN",
            data: {
              title,
              description,
              currency,
              amount: formatAmountToString(amountValue),
              paymentType,
              paymentTypeLabel: METHOD_LABELS[paymentType],
              successUrl,
              error_message:
                "Unable to find your wallet address. Please contact support.",
            },
          };
        }

        // Prefer internal webhook URL for payment success notifications.
        // Keep flow-provided successUrl as a fallback for backward compatibility.
        const resolvedSuccessUrl =
          getPaymentLinkSuccessWebhookUrl() || successUrl;

        const payload: PaymentLinkCreatePayload = {
          merchantId,
          userId: user.userId,
          name: title,
          amount: formatAmountToString(amountValue),
          currency,
          address: wallet.publicKey,
          token: currency,
          selectedCurrency: currency,
          paymentType,
          ...(description && { description }),
          ...(resolvedSuccessUrl && { successUrl: resolvedSuccessUrl }),
          metadata: {
            source: "whatsapp_flow",
            flowToken: flow_token,
            whatsappNumber: user.whatsappNumber,
            ...(successUrl && { flowSuccessUrl: successUrl }),
            ...(resolvedSuccessUrl && {
              webhookSuccessUrl: resolvedSuccessUrl,
            }),
          },
        };

        console.log({ payload });

        let createdLink: PaymentLinkApiData;
        try {
          createdLink = await createPaymentLink(payload);
        } catch (error) {
          console.error("Payment link creation failed", {
            error,
            flowToken: flow_token,
            userPhone,
            currency,
            paymentType,
          });

          const rawErrorMessage =
            (
              error as {
                response?: { data?: { message?: string } };
                message?: string;
              }
            ).response?.data?.message ||
            (error as { message?: string }).message ||
            "Unable to create payment link right now. Please try again.";

          const isTimeout = /timeout|timed out|ECONNABORTED/i.test(
            rawErrorMessage,
          );
          const errorMessage = isTimeout
            ? "Request timed out while creating the link. Please tap Create Link again."
            : rawErrorMessage;

          return {
            screen: "REVIEW_AND_PIN",
            data: {
              title,
              description,
              currency,
              amount: formatAmountToString(amountValue),
              paymentType,
              paymentTypeLabel: METHOD_LABELS[paymentType],
              successUrl,
              error_message: errorMessage,
            },
          };
        }

        const publicBase = (
          process.env.PAYMENT_LINK_PUBLIC_BASE_URL?.trim() ||
          getPaymentLinkApiBaseUrl().replace(/\/api\/v1$/, "")
        ).replace(/\/+$/, "");
        const linkUrl = getShareableLink(createdLink, publicBase);

        if (!linkUrl) {
          return {
            screen: "REVIEW_AND_PIN",
            data: {
              title,
              description,
              currency,
              amount: formatAmountToString(amountValue),
              paymentType,
              paymentTypeLabel: METHOD_LABELS[paymentType],
              successUrl,
              error_message:
                "Payment link created but link URL was not returned.",
            },
          };
        }

        const summaryMessage = [
          "*Payment Link Created Successfully*",
          "",
          `*Title:* ${title}`,
          `*Amount:* ${formatAmountToString(amountValue)} ${currency}`,
          `*Method:* ${METHOD_LABELS[paymentType]}`,
          `*Link:* ${linkUrl}`,
          "",
          "Share this link with your customer to receive payment.",
        ].join("\n");

        whatsappBusinessService
          .sendNormalMessage(summaryMessage, userPhone)
          .catch((sendError) => {
            console.log(
              "Error sending payment link summary message",
              sendError,
            );
          });

        return {
          screen: "LINK_CREATED",
          data: {
            title,
            amount: formatAmountToString(amountValue),
            currency,
            paymentTypeLabel: METHOD_LABELS[paymentType],
            link_url: linkUrl,
            description,
          },
        };
      }

      default:
        break;
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
  );
}
