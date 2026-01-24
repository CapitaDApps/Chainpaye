import Decimal from "decimal.js";

/**
 * Compute USD and fees for an off-ramp.
 *
 * Rules:
 * - USD = NGN / quote_rate
 * - Platform fee = 1.5% of USD
 * - DexPay fee = 0.20 USD
 * - Total = USD + platform_fee + 0.20
 *
 * Returns values as decimal strings to preserve precision.
 */
export function computeOfframpCosts(ngnAmount: number | string, quoteRate: number | string) {
  const ngn = new Decimal(ngnAmount);
  const rate = new Decimal(quoteRate);

  if (rate.lte(0)) {
    throw new Error("Invalid quote rate");
  }

  const usd = ngn.div(rate);
  const platformFee = usd.mul(new Decimal(0.015)); // 1.5%
  const dexpayFee = new Decimal(0.2);
  const totalUsd = usd.plus(platformFee).plus(dexpayFee);

  return {
    usd: usd.toFixed(8),
    platformFee: platformFee.gt(10) ? "10.00000000" : platformFee.toFixed(8),
    dexpayFee: dexpayFee.toFixed(8),
    totalUsd: totalUsd.toFixed(8),
  };
}