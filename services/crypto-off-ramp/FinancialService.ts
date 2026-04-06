/**
 * FinancialService - Handles fee calculations and currency conversions for crypto off-ramp
 *
 * This service implements the financial calculations required for the off-ramp workflow:
 * - Chainpaye fee calculation (flat $0.75 USD)
 * - Spread application (60 NGN reduction on exchange rate)
 * - USD conversion logic (totalInUsd = enteredAmount / spreadRate + flatFee)
 *
 * Requirements: 7.4, 7.5, 8.1
 */

import { IFinancialService } from "../../types/crypto-off-ramp.types";

export interface FinancialCalculation {
  chainpayeFee: number;
  dexpayFee: number;
  totalFees: number;
  totalInUsd: number;
  fiatAmount: number;
}

export interface FeeBreakdown {
  chainpayeFee: number;
  dexpayFeeUsd: number;
  dexpayFeeNgn: number;
  totalFeesNgn: number;
  totalFeesUsd: number;
}

export class FinancialService implements IFinancialService {
  // Updated constants - flat fee instead of percentage
  private static readonly CHAINPAYE_FLAT_FEE_USD = parseFloat(
    process.env.OFFRAMP_FLAT_FEE_USD || "0.75"
  ); // $0.75 flat fee (changed from 1.5%)
  private static readonly SPREAD_NGN = parseFloat(
    process.env.OFFRAMP_SPREAD_NGN || "60"
  ); // 60 NGN spread on exchange rate (configurable via env)

  /**
   * Apply spread to the exchange rate from DexPay
   * This is the rate we SHOW to users (worse rate)
   * @param dexpayRate - The rate from DexPay
   * @returns The rate with spread applied (reduced by SPREAD_NGN)
   */
  applySpreadToRate(dexpayRate: number): number {
    if (dexpayRate <= 0) {
      throw new Error("DexPay rate must be positive");
    }
    const spreadRate = dexpayRate - FinancialService.SPREAD_NGN;
    if (spreadRate <= 0) {
      throw new Error("Spread results in invalid rate");
    }
    return spreadRate;
  }

  /**
   * Calculate Chainpaye fee (flat $0.75 converted to NGN for display)
   * @param dexpayRate - The ORIGINAL rate from DexPay
   * @returns The Chainpaye fee in NGN
   */
  calculateChainpayeFee(dexpayRate: number): number {
    if (dexpayRate <= 0) {
      throw new Error("DexPay rate must be positive");
    }
    // Convert flat USD fee to NGN using spread rate for display
    const spreadRate = this.applySpreadToRate(dexpayRate);
    return FinancialService.CHAINPAYE_FLAT_FEE_USD * spreadRate;
  }

  /**
   * Calculate DexPay fee (now $0 - no separate fee)
   * @param nairaRate - The current NGN/USD exchange rate
   * @returns The DexPay fee in NGN (always 0 now)
   */
  calculateDexpayFee(nairaRate: number): number {
    return 0; // No separate DexPay fee
  }

  /**
   * Calculate total fees (just the flat fee in NGN)
   * @param dexpayRate - The ORIGINAL rate from DexPay
   * @returns The total fees in NGN
   */
  calculateTotalFees(dexpayRate: number): number {
    return this.calculateChainpayeFee(dexpayRate);
  }

  /**
   * Convert amount to USD using the formula: totalInUsd = enteredAmount / nairaRate
   * @param amountNgn - The amount in Nigerian Naira
   * @param nairaRate - The NGN/USD exchange rate (with spread applied)
   * @returns The equivalent amount in USD
   */
  convertToUsd(amountNgn: number, nairaRate: number): number {
    if (amountNgn < 0) {
      throw new Error("Amount cannot be negative");
    }
    if (nairaRate <= 0) {
      throw new Error("Naira rate must be positive");
    }
    return amountNgn / nairaRate;
  }

  /**
   * Perform comprehensive financial calculations for a transaction
   * @param amount - The transaction amount in NGN (what user wants to receive)
   * @param dexpayRate - The ORIGINAL rate from DexPay (before spread)
   * @returns Complete financial calculation breakdown
   */
  calculateTransactionFinancials(
    amount: number,
    dexpayRate: number,
  ): FinancialCalculation {
    if (amount < 0) {
      throw new Error("Amount cannot be negative");
    }
    if (dexpayRate <= 0) {
      throw new Error("DexPay rate must be positive");
    }

    // Apply spread to get user-facing rate
    const spreadRate = this.applySpreadToRate(dexpayRate);
    
    // Calculate fees for display (in NGN)
    const chainpayeFee = this.calculateChainpayeFee(dexpayRate);
    const dexpayFee = 0;
    const totalFees = chainpayeFee;

    // Calculate USD needed at spread rate
    const usdAtSpreadRate = this.convertToUsd(amount, spreadRate);
    
    // Add flat fee to get total USD to deduct from wallet
    const totalInUsd = usdAtSpreadRate + FinancialService.CHAINPAYE_FLAT_FEE_USD;

    return {
      chainpayeFee, // In NGN (for display)
      dexpayFee, // 0
      totalFees, // In NGN (for display)
      totalInUsd, // Total USD to deduct from user's wallet
      fiatAmount: amount, // Original NGN amount
    };
  }

  /**
   * Get detailed fee breakdown for transparency
   * @param amount - The transaction amount in NGN
   * @param dexpayRate - The ORIGINAL rate from DexPay
   * @returns Detailed breakdown of all fees
   */
  getFeeBreakdown(amount: number, dexpayRate: number): FeeBreakdown {
    if (amount < 0) {
      throw new Error("Amount cannot be negative");
    }
    if (dexpayRate <= 0) {
      throw new Error("DexPay rate must be positive");
    }

    const spreadRate = this.applySpreadToRate(dexpayRate);
    const chainpayeFee = this.calculateChainpayeFee(dexpayRate);
    const dexpayFeeUsd = 0;
    const dexpayFeeNgn = 0;
    const totalFeesNgn = chainpayeFee;
    const totalFeesUsd = FinancialService.CHAINPAYE_FLAT_FEE_USD;

    return {
      chainpayeFee,
      dexpayFeeUsd,
      dexpayFeeNgn,
      totalFeesNgn,
      totalFeesUsd,
    };
  }

  /**
   * Calculate the total amount including fees
   * @param baseAmount - The base transaction amount
   * @param dexpayRate - The ORIGINAL rate from DexPay
   * @returns The total amount in USD to deduct from wallet
   */
  calculateTotalWithFees(baseAmount: number, dexpayRate: number): number {
    if (baseAmount < 0) {
      throw new Error("Base amount cannot be negative");
    }
    if (dexpayRate <= 0) {
      throw new Error("DexPay rate must be positive");
    }

    const spreadRate = this.applySpreadToRate(dexpayRate);
    const baseInUsd = this.convertToUsd(baseAmount, spreadRate);
    return baseInUsd + FinancialService.CHAINPAYE_FLAT_FEE_USD;
  }

  /**
   * Validate that a calculation result is mathematically accurate
   * @param calculation - The calculation object to validate
   * @returns True if the calculation is accurate, false otherwise
   */
  validateCalculationAccuracy(calculation: any): boolean {
    if (!calculation || typeof calculation !== "object") {
      return false;
    }

    // Check for required properties
    const requiredProps = [
      "chainpayeFee",
      "dexpayFee",
      "totalFees",
      "totalInUsd",
      "fiatAmount",
    ];
    for (const prop of requiredProps) {
      if (!(prop in calculation) || typeof calculation[prop] !== "number") {
        return false;
      }
    }

    // Check for negative values (except for edge cases where 0 is valid)
    if (
      calculation.chainpayeFee < 0 ||
      calculation.dexpayFee < 0 ||
      calculation.totalFees < 0 ||
      calculation.totalInUsd < 0 ||
      calculation.fiatAmount < 0
    ) {
      return false;
    }

    // Check that total fees equals sum of individual fees
    const expectedTotalFees = calculation.chainpayeFee + calculation.dexpayFee;
    const tolerance = 0.000001; // Small tolerance for floating point precision
    if (Math.abs(calculation.totalFees - expectedTotalFees) > tolerance) {
      return false;
    }

    return true;
  }

  /**
   * Check if a wallet balance is sufficient for a transaction including fees
   * @param walletBalanceUsd - The wallet balance in USD
   * @param transactionAmountNgn - The transaction amount in NGN
   * @param dexpayRate - The ORIGINAL rate from DexPay
   * @returns True if balance is sufficient, false otherwise
   */
  isSufficientBalance(
    walletBalanceUsd: number,
    transactionAmountNgn: number,
    dexpayRate: number,
  ): boolean {
    if (walletBalanceUsd < 0 || transactionAmountNgn < 0 || dexpayRate <= 0) {
      return false;
    }

    const totalRequiredUsd = this.calculateTotalWithFees(
      transactionAmountNgn,
      dexpayRate,
    );

    return walletBalanceUsd >= totalRequiredUsd;
  }

  /**
   * Format currency amounts for display
   * @param amount - The amount to format
   * @param currency - The currency code ('USD' or 'NGN')
   * @param decimals - Number of decimal places (default: 2)
   * @returns Formatted currency string
   */
  formatCurrency(
    amount: number,
    currency: "USD" | "NGN",
    decimals: number = 2,
  ): string {
    const symbol = currency === "USD" ? "$" : "₦";
    return `${symbol}${amount.toFixed(decimals)}`;
  }

  /**
   * Get the current fee rates for transparency
   * @returns Object containing current fee rates
   */
  getFeeRates(): { chainpayeFlatFeeUsd: number; spreadNgn: number } {
    return {
      chainpayeFlatFeeUsd: FinancialService.CHAINPAYE_FLAT_FEE_USD,
      spreadNgn: FinancialService.SPREAD_NGN,
    };
  }

  /**
   * Get the spread amount
   */
  getSpreadAmount(): number {
    return FinancialService.SPREAD_NGN;
  }

  /**
   * Get the user-facing rate (with spread applied)
   */
  getUserFacingRate(dexpayRate: number): number {
    return this.applySpreadToRate(dexpayRate);
  }
}

// Export a singleton instance for use throughout the application
export const financialService = new FinancialService();
