/**
 * ValidationService - Comprehensive validation for crypto off-ramp operations
 *
 * This service provides validation for user inputs, balances, and transaction parameters
 * ensuring data integrity and business rule compliance throughout the off-ramp workflow.
 *
 * Requirements: 3.2, 3.3, 3.4, 3.5, 6.2, 6.3, 8.2, 8.3
 */

import {
  IValidationService,
  SupportedAsset,
  SupportedChain,
  ValidationResult,
} from "../../types/crypto-off-ramp.types";

export class ValidationService implements IValidationService {
  // Supported asset-chain combinations as per requirements 3.3, 3.4, 3.5
  private static readonly SUPPORTED_COMBINATIONS: Record<
    SupportedAsset,
    SupportedChain[]
  > = {
    USDC: ["bep20", "base", "arbitrum", "solana", "stellar"],
    USDT: ["bep20", "solana"],
  };

  // Minimum balance threshold in USD
  private static readonly MIN_BALANCE_USD = 0.01;

  // Maximum transaction limits
  private static readonly MAX_TRANSACTION_USD = 50000;
  private static readonly MIN_TRANSACTION_USD = 1;
  
  // Minimum offramp amount in NGN (configurable via env)
  private static getMinOfframpAmountNgn(): number {
    return parseFloat(process.env.OFFRAMP_MIN_AMOUNT_NGN || "5000");
  }
  
  // Maximum offramp amount in NGN (configurable via env)
  private static getMaxOfframpAmountNgn(): number {
    return parseFloat(process.env.OFFRAMP_MAX_AMOUNT_NGN || "10000000");
  }
  
  /**
   * Public method to get minimum offramp amount
   */
  getMinOfframpAmountNgn(): number {
    return ValidationService.getMinOfframpAmountNgn();
  }
  
  /**
   * Public method to get maximum offramp amount
   */
  getMaxOfframpAmountNgn(): number {
    return ValidationService.getMaxOfframpAmountNgn();
  }

  /**
   * Validates asset-chain combination
   * Requirements: 3.2, 3.3, 3.4, 3.5
   */
  validateAssetChain(asset: string, chain: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Normalize inputs
    const normalizedAsset = asset?.toUpperCase() as SupportedAsset;
    const normalizedChain = chain?.toLowerCase() as SupportedChain;

    // Validate asset is supported
    if (
      !normalizedAsset ||
      !ValidationService.SUPPORTED_COMBINATIONS[normalizedAsset]
    ) {
      errors.push(
        `Unsupported asset: ${asset}. Supported assets are: ${Object.keys(ValidationService.SUPPORTED_COMBINATIONS).join(", ")}`,
      );
    }

    // Validate chain is supported for the asset
    if (
      normalizedAsset &&
      ValidationService.SUPPORTED_COMBINATIONS[normalizedAsset]
    ) {
      const supportedChains =
        ValidationService.SUPPORTED_COMBINATIONS[normalizedAsset];
      if (!normalizedChain || !supportedChains.includes(normalizedChain)) {
        errors.push(
          `Unsupported chain for ${normalizedAsset}: ${chain}. Supported chains for ${normalizedAsset} are: ${supportedChains.join(", ")}`,
        );
      }
    }

    // Validate input format
    if (!asset || typeof asset !== "string" || asset.trim().length === 0) {
      errors.push("Asset must be a non-empty string");
    }

    if (!chain || typeof chain !== "string" || chain.trim().length === 0) {
      errors.push("Chain must be a non-empty string");
    }

    // Add warnings for specific combinations that might have higher fees
    if (normalizedAsset === "USDT" && normalizedChain === "bep20") {
      warnings.push("BEP20 USDT transactions may have higher network fees");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates bank details for Nigerian banks
   * Requirements: 6.2, 6.3
   */
  validateBankDetails(
    bankCode: string,
    accountNumber: string,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate bank code
    if (!bankCode || typeof bankCode !== "string") {
      errors.push("Bank code is required");
    } else {
      // Nigerian bank codes are typically 3 digits
      if (!/^\d{3}$/.test(bankCode.trim())) {
        errors.push("Bank code must be a 3-digit number");
      }
    }

    // Validate account number
    if (!accountNumber || typeof accountNumber !== "string") {
      errors.push("Account number is required");
    } else {
      const cleanAccountNumber = accountNumber.trim().replace(/\s+/g, "");

      // Nigerian account numbers are typically 10 digits
      if (!/^\d{10}$/.test(cleanAccountNumber)) {
        errors.push("Account number must be exactly 10 digits");
      }

      // Check for obviously invalid patterns
      if (/^0{10}$/.test(cleanAccountNumber)) {
        errors.push("Account number cannot be all zeros");
      }

      if (/^(\d)\1{9}$/.test(cleanAccountNumber)) {
        warnings.push(
          "Account number appears to have repeating digits - please verify",
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates sufficient balance for transaction
   * Requirements: 8.2, 8.3, 8.4
   */
  validateSufficientBalance(
    walletBalance: number,
    requiredAmount: number,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate input parameters
    if (typeof walletBalance !== "number" || isNaN(walletBalance)) {
      errors.push("Wallet balance must be a valid number");
    }

    if (typeof requiredAmount !== "number" || isNaN(requiredAmount)) {
      errors.push("Required amount must be a valid number");
    }

    if (walletBalance < 0) {
      errors.push("Wallet balance cannot be negative");
    }

    if (requiredAmount < 0) {
      errors.push("Required amount cannot be negative");
    }

    // Check minimum balance threshold
    if (walletBalance < ValidationService.MIN_BALANCE_USD) {
      errors.push(
        `Wallet balance is below minimum threshold of $${ValidationService.MIN_BALANCE_USD}`,
      );
    }

    // Check if balance is sufficient as per requirement 8.2
    if (walletBalance < requiredAmount) {
      errors.push("Insufficient Funds");
    }

    // Add warnings for low remaining balance
    const remainingBalance = walletBalance - requiredAmount;
    if (
      remainingBalance > 0 &&
      remainingBalance < ValidationService.MIN_BALANCE_USD
    ) {
      warnings.push(
        `Transaction will leave a very low balance of $${remainingBalance.toFixed(6)}`,
      );
    }

    // Warn if using more than 90% of available balance
    if (requiredAmount > walletBalance * 0.9) {
      warnings.push("Transaction uses more than 90% of available balance");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates transaction limits and user-specific constraints
   * Requirements: General transaction validation
   */
  validateTransactionLimits(amount: number, userId: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate input parameters
    if (typeof amount !== "number" || isNaN(amount)) {
      errors.push("Transaction amount must be a valid number");
    }

    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      errors.push("User ID is required for transaction validation");
    }

    // Check minimum transaction amount
    if (amount < ValidationService.MIN_TRANSACTION_USD) {
      errors.push(
        `Transaction amount must be at least $${ValidationService.MIN_TRANSACTION_USD}`,
      );
    }

    // Check maximum transaction amount
    if (amount > ValidationService.MAX_TRANSACTION_USD) {
      errors.push(
        `Transaction amount cannot exceed $${ValidationService.MAX_TRANSACTION_USD}`,
      );
    }

    // Add warnings for large transactions
    if (amount > 10000) {
      warnings.push(
        "Large transaction amount - additional verification may be required",
      );
    }

    // Validate amount precision (max 6 decimal places for crypto)
    const decimalPlaces = (amount.toString().split(".")[1] || "").length;
    if (decimalPlaces > 6) {
      errors.push("Transaction amount cannot have more than 6 decimal places");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates form completeness for spend form
   * Requirements: 6.2, 6.3
   */
  validateSpendForm(formData: {
    bankCode?: string;
    accountNumber?: string;
    amount?: number;
    network?: string;
  }): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields as per requirement 6.3
    const requiredFields = ["bankCode", "accountNumber", "amount"];
    const missingFields = requiredFields.filter(
      (field) =>
        !formData[field as keyof typeof formData] ||
        (typeof formData[field as keyof typeof formData] === "string" &&
          (formData[field as keyof typeof formData] as string).trim().length ===
            0),
    );

    if (missingFields.length > 0) {
      errors.push(
        `Missing required fields: ${missingFields.join(", ")}. All fields must be completed before proceeding.`,
      );
    }

    // Validate individual fields if present
    if (formData.bankCode && formData.accountNumber) {
      const bankValidation = this.validateBankDetails(
        formData.bankCode,
        formData.accountNumber,
      );
      errors.push(...bankValidation.errors);
      warnings.push(...(bankValidation.warnings || []));
    }

    if (formData.amount !== undefined) {
      const amountValidation = this.validateTransactionLimits(
        formData.amount,
        "temp-user",
      );
      errors.push(...amountValidation.errors);
      warnings.push(...(amountValidation.warnings || []));
    }

    // Validate network if provided
    if (formData.network) {
      const supportedNetworks = Object.values(
        ValidationService.SUPPORTED_COMBINATIONS,
      ).flat();
      if (!supportedNetworks.includes(formData.network as SupportedChain)) {
        errors.push(`Unsupported network: ${formData.network}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates PIN format and basic security requirements
   */
  validatePinFormat(pin: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pin || typeof pin !== "string") {
      errors.push("PIN is required");
    } else {
      // PIN should be 4-6 digits
      if (!/^\d{4,6}$/.test(pin)) {
        errors.push("PIN must be 4-6 digits");
      }

      // Check for weak PINs
      if (/^(\d)\1{3,5}$/.test(pin)) {
        warnings.push(
          "PIN should not use repeating digits for better security",
        );
      }

      if (
        [
          "1234",
          "0000",
          "1111",
          "2222",
          "3333",
          "4444",
          "5555",
          "6666",
          "7777",
          "8888",
          "9999",
        ].includes(pin)
      ) {
        warnings.push(
          "PIN appears to be a common pattern - consider using a more secure PIN",
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates wallet address format for different chains
   */
  validateWalletAddress(
    address: string,
    chain: SupportedChain,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!address || typeof address !== "string") {
      errors.push("Wallet address is required");
      return { isValid: false, errors, warnings };
    }

    const cleanAddress = address.trim();

    // Basic validation based on chain
    switch (chain) {
      case "solana":
        // Solana addresses are base58 encoded, typically 32-44 characters
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleanAddress)) {
          errors.push("Invalid Solana wallet address format");
        }
        break;

      case "bep20":
      case "arbitrum":
      case "base":
        // Ethereum-compatible addresses (0x followed by 40 hex characters)
        if (!/^0x[a-fA-F0-9]{40}$/.test(cleanAddress)) {
          errors.push(`Invalid ${chain} wallet address format`);
        }
        break;

      case "hedera":
        // Hedera addresses are in format 0.0.xxxxx
        if (!/^0\.0\.\d+$/.test(cleanAddress)) {
          errors.push("Invalid Hedera wallet address format");
        }
        break;

      case "stellar":
        // Stellar addresses start with G and are 56 characters (base32)
        if (!/^G[A-Z2-7]{55}$/.test(cleanAddress)) {
          errors.push("Invalid Stellar wallet address format");
        }
        break;

      case "apechain":
      case "lisk":
        // These are also Ethereum-compatible
        if (!/^0x[a-fA-F0-9]{40}$/.test(cleanAddress)) {
          errors.push(`Invalid ${chain} wallet address format`);
        }
        break;

      default:
        warnings.push(
          `Address format validation not implemented for chain: ${chain}`,
        );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Comprehensive validation for complete transaction data
   */
  validateCompleteTransaction(transactionData: {
    asset: string;
    chain: string;
    amount: number;
    walletBalance: number;
    bankCode: string;
    accountNumber: string;
    userId: string;
    walletAddress?: string;
  }): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate asset-chain combination
    const assetChainValidation = this.validateAssetChain(
      transactionData.asset,
      transactionData.chain,
    );
    errors.push(...assetChainValidation.errors);
    warnings.push(...(assetChainValidation.warnings || []));

    // Validate bank details
    const bankValidation = this.validateBankDetails(
      transactionData.bankCode,
      transactionData.accountNumber,
    );
    errors.push(...bankValidation.errors);
    warnings.push(...(bankValidation.warnings || []));

    // Validate transaction limits
    const limitsValidation = this.validateTransactionLimits(
      transactionData.amount,
      transactionData.userId,
    );
    errors.push(...limitsValidation.errors);
    warnings.push(...(limitsValidation.warnings || []));

    // Validate sufficient balance
    const balanceValidation = this.validateSufficientBalance(
      transactionData.walletBalance,
      transactionData.amount,
    );
    errors.push(...balanceValidation.errors);
    warnings.push(...(balanceValidation.warnings || []));

    // Validate wallet address if provided
    if (transactionData.walletAddress) {
      const addressValidation = this.validateWalletAddress(
        transactionData.walletAddress,
        transactionData.chain as SupportedChain,
      );
      errors.push(...addressValidation.errors);
      warnings.push(...(addressValidation.warnings || []));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Gets supported asset-chain combinations
   */
  getSupportedCombinations(): Record<SupportedAsset, SupportedChain[]> {
    return { ...ValidationService.SUPPORTED_COMBINATIONS };
  }

  /**
   * Checks if a specific asset-chain combination is supported
   */
  isSupportedCombination(asset: string, chain: string): boolean {
    const normalizedAsset = asset?.toUpperCase() as SupportedAsset;
    const normalizedChain = chain?.toLowerCase() as SupportedChain;

    const supportedChains =
      ValidationService.SUPPORTED_COMBINATIONS[normalizedAsset];
    return supportedChains && supportedChains.includes(normalizedChain);
  }
}
