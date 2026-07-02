import { dexPayService } from "../../services/DexPayService";
import { getPcxRate } from "../../services/PCXPayService";
import { logger } from "../../utils/logger";

interface RateResult {
  label: string;
  rate: string;
  flag: string;
}

/**
 * Fetch all offramp rates and format them for display.
 * - NGN: uses DexPay rate for USDC and USDT (NGN per 1 token)
 * - All other currencies: uses PCX rate (local currency per 1 USD)
 */
export async function getRatesMessage(): Promise<string> {
  const results: RateResult[] = [];
  const errors: string[] = [];

  // ── DexPay: USDC → NGN ──────────────────────────────────────────
  try {
    const usdcRate = await dexPayService.getCurrentRates("USDC", "BASE");
    if (usdcRate?.rate && Number(usdcRate.rate) > 0) {
      results.push({
        flag: "🇳🇬",
        label: "1 USDC",
        rate: `NGN ${Number(usdcRate.rate).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`,
      });
    } else {
      throw new Error("Zero or missing rate");
    }
  } catch (err) {
    logger.error("[RATES] USDC/NGN fetch failed: " + (err as Error).message);
    errors.push("USDC/NGN");
  }

  // ── DexPay: USDT → NGN ──────────────────────────────────────────
  try {
    const usdtRate = await dexPayService.getCurrentRates("USDT", "BASE");
    if (usdtRate?.rate && Number(usdtRate.rate) > 0) {
      results.push({
        flag: "🇳🇬",
        label: "1 USDT",
        rate: `NGN ${Number(usdtRate.rate).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`,
      });
    } else {
      throw new Error("Zero or missing rate");
    }
  } catch (err) {
    logger.error("[RATES] USDT/NGN fetch failed: " + (err as Error).message);
    errors.push("USDT/NGN");
  }

  // ── PCX rates: 1 USD = X local currency ─────────────────────────
  const pcxCurrencies: { currency: string; flag: string; name: string }[] = [
    { currency: "KES", flag: "🇰🇪", name: "Kenya" },
    { currency: "ZAR", flag: "🇿🇦", name: "South Africa" },
    { currency: "RWF", flag: "🇷🇼", name: "Rwanda" },
    { currency: "UGX", flag: "🇺🇬", name: "Uganda" },
    { currency: "TZS", flag: "🇹🇿", name: "Tanzania" },
    { currency: "MWK", flag: "🇲🇼", name: "Malawi" },
  ];

  await Promise.allSettled(
    pcxCurrencies.map(async ({ currency, flag }) => {
      try {
        const { rate } = await getPcxRate(currency);
        results.push({
          flag,
          label: "1 USD",
          rate: `${currency} ${Number(rate).toLocaleString("en", { maximumFractionDigits: 2 })}`,
        });
      } catch (err) {
        logger.error(`[RATES] ${currency} fetch failed: ` + (err as Error).message);
        errors.push(`USD/${currency}`);
      }
    }),
  );

  // ── Build message ────────────────────────────────────────────────
  // Sort: NGN pairs first, then by currency alphabetically
  const ngnResults   = results.filter((r) => r.rate.startsWith("NGN"));
  const otherResults = results.filter((r) => !r.rate.startsWith("NGN"))
    .sort((a, b) => a.rate.split(" ")[0].localeCompare(b.rate.split(" ")[0]));
  const sorted = [...ngnResults, ...otherResults];

  let message = `📊 *Live Exchange Rates*\n`;
  message    += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (ngnResults.length > 0) {
    message += `🇳🇬 *Nigeria (NGN)*\n`;
    for (const r of ngnResults) {
      message += `  ${r.label} = ${r.rate}\n`;
    }
    message += `\n`;
  }

  if (otherResults.length > 0) {
    message += `🌍 *Other Countries (1 USD)*\n`;
    for (const r of otherResults) {
      message += `  ${r.flag} ${r.label} = ${r.rate}\n`;
    }
    message += `\n`;
  }

  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `⏱️ _Rates are live and may change._\n`;
  message += `💡 Type *offramp* to start a withdrawal.`;

  if (errors.length > 0) {
    message += `\n\n⚠️ _Unavailable: ${errors.join(", ")}_`;
  }

  return message;
}

export async function handleRates(phoneNumber: string): Promise<void> {
  const { whatsappBusinessService } = await import("../../services");
  try {
    // Send a "fetching" indicator first
    await whatsappBusinessService.sendNormalMessage(
      "⏳ Fetching live rates...",
      phoneNumber,
    );

    const message = await getRatesMessage();
    await whatsappBusinessService.sendNormalMessage(message, phoneNumber);
  } catch (err) {
    logger.error("[RATES] Handler error: " + (err as Error).message);
    await whatsappBusinessService.sendNormalMessage(
      "❌ *Rates Unavailable*\n\nCouldn't fetch live rates right now. Please try again in a moment.",
      phoneNumber,
    );
  }
}
