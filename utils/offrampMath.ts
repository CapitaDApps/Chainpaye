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

  // 1. Calculate Base USD
  const baseUsd = ngn.div(rate);

  // 2. Fees in NGN (1.5%)
  let platformFeeNgn = ngn.mul(0.015);
  
  // Example Cap: If fee > $10 USD (converted to NGN), cap it at $10 worth of NGN
  const capNgn = rate.mul(10);
  if (platformFeeNgn.gt(capNgn)) {
    platformFeeNgn = capNgn;
  }

  // 3. Flat Fee ($0.20 converted to NGN)
  const dexpayFeeNgn = rate.mul(0.2);

  // 4. Totals
  const totalNgn = ngn.plus(platformFeeNgn).plus(dexpayFeeNgn);
  const totalUsd = totalNgn.div(rate);

  return {
    ngnAmount: ngn.toFixed(2),
    usdEquivalent: baseUsd.toFixed(8),
    platformFeeNgn: platformFeeNgn.toFixed(2),
    dexpayFeeNgn: dexpayFeeNgn.toFixed(2),
    totalNgn: totalNgn.toFixed(2),
    totalUsd: totalUsd.toFixed(8),
  };
}