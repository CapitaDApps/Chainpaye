/**
 * FinancialService - Handles fee calculations and currency conversions for crypto off-ramp
 * 
 * This service implements the financial calculations required for the off-ramp workflow:
 * - Chainpaye fee calculation (1.5% of amount)
 * - DexPay fee calculation ($0.2 converted to NGN)
 * - USD conversion logic (totalInUsd = enteredAmount / nairaRate)
 * 
 * Requirements: 7.4, 7.5, 8.1
 */

import { IFinancialService } from '../../types/crypto-off-ramp.types';

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
  // Constants as defined in requirements
  private static readonly CHAINPAYE_FEE_RATE = 0.015; // 1.5%
  private static readonly DEXPAY_FEE_USD = 0.2; // $0.2

  /**
   * Calculate Chainpaye fee (1.5% of amount)
   * @param amount - The transaction amount in the original currency
   * @returns The Chainpaye fee amount
   */
  calculateChainpayeFee(amount: number): number {
    if (amount < 0) {
      throw new Error('Amount cannot be negative');
    }
    return amount * FinancialService.CHAINPAYE_FEE_RATE;
  }

  /**
   * Calculate DexPay fee ($0.2 converted to NGN)
   * @param nairaRate - The current NGN/USD exchange rate
   * @returns The DexPay fee in NGN
   */
  calculateDexpayFee(nairaRate: number): number {
    if (nairaRate <= 0) {
      throw new Error('Naira rate must be positive');
    }
    return FinancialService.DEXPAY_FEE_USD * nairaRate;
  }

  /**
   * Calculate total fees (Chainpaye + DexPay in NGN)
   * @param amount - The transaction amount
   * @param nairaRate - The current NGN/USD exchange rate
   * @returns The total fees in NGN
   */
  calculateTotalFees(amount: number, nairaRate: number): number {
    const chainpayeFee = this.calculateChainpayeFee(amount);
    const dexpayFee = this.calculateDexpayFee(nairaRate);
    return chainpayeFee + dexpayFee;
  }

  /**
   * Convert amount to USD using the formula: totalInUsd = enteredAmount / nairaRate
   * @param amountNgn - The amount in Nigerian Naira
   * @param nairaRate - The current NGN/USD exchange rate
   * @returns The equivalent amount in USD
   */
  convertToUsd(amountNgn: number, nairaRate: number): number {
    if (amountNgn < 0) {
      throw new Error('Amount cannot be negative');
    }
    if (nairaRate <= 0) {
      throw new Error('Naira rate must be positive');
    }
    return amountNgn / nairaRate;
  }

  /**
   * Perform comprehensive financial calculations for a transaction
   * @param amount - The transaction amount in NGN
   * @param nairaRate - The current NGN/USD exchange rate
   * @returns Complete financial calculation breakdown
   */
  calculateTransactionFinancials(amount: number, nairaRate: number): FinancialCalculation {
    if (amount < 0) {
      throw new Error('Amount cannot be negative');
    }
    if (nairaRate <= 0) {
      throw new Error('Naira rate must be positive');
    }

    const chainpayeFee = this.calculateChainpayeFee(amount);
    const dexpayFee = this.calculateDexpayFee(nairaRate);
    const totalFees = chainpayeFee + dexpayFee;
    const totalInUsd = this.convertToUsd(amount, nairaRate);
    const fiatAmount = amount; // Amount in NGN

    return {
      chainpayeFee,
      dexpayFee,
      totalFees,
      totalInUsd,
      fiatAmount
    };
  }

  /**
   * Get detailed fee breakdown for transparency
   * @param amount - The transaction amount in NGN
   * @param nairaRate - The current NGN/USD exchange rate
   * @returns Detailed breakdown of all fees
   */
  getFeeBreakdown(amount: number, nairaRate: number): FeeBreakdown {
    if (amount < 0) {
      throw new Error('Amount cannot be negative');
    }
    if (nairaRate <= 0) {
      throw new Error('Naira rate must be positive');
    }

    const chainpayeFee = this.calculateChainpayeFee(amount);
    const dexpayFeeUsd = FinancialService.DEXPAY_FEE_USD;
    const dexpayFeeNgn = this.calculateDexpayFee(nairaRate);
    const totalFeesNgn = chainpayeFee + dexpayFeeNgn;
    const totalFeesUsd = this.convertToUsd(totalFeesNgn, nairaRate);

    return {
      chainpayeFee,
      dexpayFeeUsd,
      dexpayFeeNgn,
      totalFeesNgn,
      totalFeesUsd
    };
  }

  /**
   * Calculate the total amount including fees
   * @param baseAmount - The base transaction amount
   * @param nairaRate - The current NGN/USD exchange rate
   * @returns The total amount including all fees
   */
  calculateTotalWithFees(baseAmount: number, nairaRate: number): number {
    if (baseAmount < 0) {
      throw new Error('Base amount cannot be negative');
    }
    if (nairaRate <= 0) {
      throw new Error('Naira rate must be positive');
    }

    const totalFees = this.calculateTotalFees(baseAmount, nairaRate);
    return baseAmount + totalFees;
  }

  /**
   * Validate that a calculation result is mathematically accurate
   * @param calculation - The calculation object to validate
   * @returns True if the calculation is accurate, false otherwise
   */
  validateCalculationAccuracy(calculation: any): boolean {
    if (!calculation || typeof calculation !== 'object') {
      return false;
    }

    // Check for required properties
    const requiredProps = ['chainpayeFee', 'dexpayFee', 'totalFees', 'totalInUsd', 'fiatAmount'];
    for (const prop of requiredProps) {
      if (!(prop in calculation) || typeof calculation[prop] !== 'number') {
        return false;
      }
    }

    // Check for negative values (except for edge cases where 0 is valid)
    if (calculation.chainpayeFee < 0 || calculation.dexpayFee < 0 || 
        calculation.totalFees < 0 || calculation.totalInUsd < 0 || 
        calculation.fiatAmount < 0) {
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
   * @param nairaRate - The current NGN/USD exchange rate
   * @returns True if balance is sufficient, false otherwise
   */
  isSufficientBalance(walletBalanceUsd: number, transactionAmountNgn: number, nairaRate: number): boolean {
    if (walletBalanceUsd < 0 || transactionAmountNgn < 0 || nairaRate <= 0) {
      return false;
    }

    const totalWithFees = this.calculateTotalWithFees(transactionAmountNgn, nairaRate);
    const totalRequiredUsd = this.convertToUsd(totalWithFees, nairaRate);
    
    return walletBalanceUsd >= totalRequiredUsd;
  }

  /**
   * Format currency amounts for display
   * @param amount - The amount to format
   * @param currency - The currency code ('USD' or 'NGN')
   * @param decimals - Number of decimal places (default: 2)
   * @returns Formatted currency string
   */
  formatCurrency(amount: number, currency: 'USD' | 'NGN', decimals: number = 2): string {
    const symbol = currency === 'USD' ? '$' : '₦';
    return `${symbol}${amount.toFixed(decimals)}`;
  }

  /**
   * Get the current fee rates for transparency
   * @returns Object containing current fee rates
   */
  getFeeRates(): { chainpayeRate: number; dexpayFeeUsd: number } {
    return {
      chainpayeRate: FinancialService.CHAINPAYE_FEE_RATE,
      dexpayFeeUsd: FinancialService.DEXPAY_FEE_USD
    };
  }
}

// Export a singleton instance for use throughout the application
export const financialService = new FinancialService();