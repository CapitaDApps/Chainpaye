/**
 * Off-ramp Flow Controller
 * Handles WhatsApp Flow interactions for the crypto off-ramp process
 */

import { Request, Response } from "express";
import { userService, crossmintService, dexPayService } from "../../services";
import { logger } from "../../utils/logger";

interface OfframpFlowRequest {
  version: string;
  action: string;
  screen: string;
  data: any;
  flow_token: string;
}

/**
 * Handle off-ramp flow interactions
 */
export async function offrampFlowController(req: Request, res: Response): Promise<void> {
  try {
    const flowRequest: OfframpFlowRequest = req.body;
    const { action, screen, data, flow_token } = flowRequest;

    logger.info(`Off-ramp flow request: ${action} on ${screen}`, { data });

    // Extract phone number from flow token (you may need to decode this based on your implementation)
    const phoneNumber = extractPhoneFromFlowToken(flow_token);
    
    if (!phoneNumber) {
      res.status(400).json({
        version: "3.0",
        screen: screen,
        data: {
          error_message: "Invalid session. Please try again."
        }
      });
      return;
    }

    let responseData: any = {};

    switch (screen) {
      case "OFFRAMP_ASSET_SELECTION":
        responseData = await handleAssetSelectionFlow(phoneNumber, data);
        break;

      case "OFFRAMP_WALLET_DISPLAY":
        responseData = await handleWalletDisplayFlow(phoneNumber, data);
        break;

      case "OFFRAMP_AMOUNT_INPUT":
        responseData = await handleAmountInputFlow(phoneNumber, data);
        break;

      case "OFFRAMP_BANK_SELECTION":
        responseData = await handleBankSelectionFlow(phoneNumber, data);
        break;

      case "OFFRAMP_ACCOUNT_INPUT":
        responseData = await handleAccountInputFlow(phoneNumber, data);
        break;

      case "OFFRAMP_ACCOUNT_CONFIRMATION":
        responseData = await handleAccountConfirmationFlow(phoneNumber, data);
        break;

      case "OFFRAMP_QUOTE_REVIEW":
        responseData = await handleQuoteReviewFlow(phoneNumber, data);
        break;

      case "OFFRAMP_PIN_VERIFICATION":
        responseData = await handlePinVerificationFlow(phoneNumber, data);
        break;

      default:
        responseData = {
          error_message: "Unknown screen"
        };
    }

    res.status(200).json({
      version: "3.0",
      screen: getNextScreen(screen, responseData),
      data: responseData
    });

  } catch (error) {
    logger.error("Error in off-ramp flow controller:", error);
    res.status(500).json({
      version: "3.0",
      screen: req.body.screen,
      data: {
        error_message: "Something went wrong. Please try again."
      }
    });
  }
}

/**
 * Handle asset selection flow step
 */
async function handleAssetSelectionFlow(phoneNumber: string, data: any): Promise<any> {
  try {
    const { asset, chain } = data;
    
    // Validate asset and chain combination
    if (!dexPayService.isSupportedAssetChain(asset.toLowerCase(), chain.toLowerCase())) {
      return {
        error_message: `${asset} is not supported on ${chain}. Please select a different combination.`
      };
    }

    // Get or create wallet
    const user = await userService.getUser(phoneNumber);
    if (!user) {
      return {
        error_message: "User not found. Please create an account first."
      };
    }

    const chainType = crossmintService.getChainType(chain.toLowerCase());
    const wallet = await crossmintService.getOrCreateWallet(user.userId, chainType);
    
    // Get current balance
    let balances: any[] = [];
    try {
      if (chainType === 'solana') {
        balances = await crossmintService.getBalancesByChain(user.userId, chain.toLowerCase(), ['usdc', 'sol']);
      } else {
        balances = await crossmintService.getBalancesByChain(user.userId, chain.toLowerCase(), ['usdc', 'usdt']);
      }
    } catch (error) {
      logger.warn("Error getting balances:", error);
    }

    const assetBalance = balances.find(b => b.token.toLowerCase() === asset.toLowerCase());
    const currentBalance = assetBalance ? parseFloat(assetBalance.amount) : 0;

    return {
      asset: asset.toUpperCase(),
      chain: chain.toLowerCase(),
      wallet_address: wallet.address,
      current_balance: currentBalance.toFixed(6)
    };

  } catch (error) {
    logger.error("Error in asset selection flow:", error);
    return {
      error_message: "Failed to process asset selection. Please try again."
    };
  }
}

/**
 * Handle wallet display flow step
 */
async function handleWalletDisplayFlow(phoneNumber: string, data: any): Promise<any> {
  // This step just passes data through to the next screen
  return {
    asset: data.asset,
    chain: data.chain,
    wallet_address: data.wallet_address,
    current_balance: data.current_balance
  };
}

/**
 * Handle amount input flow step
 */
async function handleAmountInputFlow(phoneNumber: string, data: any): Promise<any> {
  try {
    const { asset, chain, ngn_amount } = data;
    const amount = parseFloat(ngn_amount);

    // Validate amount
    if (amount < 1000) {
      return {
        error_message: "Minimum withdrawal amount is ₦1,000."
      };
    }

    if (amount > 5000000) {
      return {
        error_message: "Maximum withdrawal amount is ₦5,000,000."
      };
    }

    // Get banks from DexPay
    const banks = await dexPayService.getBanks();
    
    return {
      asset,
      chain,
      ngn_amount: amount.toString(),
      banks: banks.slice(0, 10).map(bank => ({
        id: bank.code,
        name: bank.name
      }))
    };

  } catch (error) {
    logger.error("Error in amount input flow:", error);
    return {
      error_message: "Failed to process amount. Please try again."
    };
  }
}

/**
 * Handle bank selection flow step
 */
async function handleBankSelectionFlow(phoneNumber: string, data: any): Promise<any> {
  try {
    const { asset, chain, ngn_amount, selected_bank } = data;
    
    // Get bank name from code
    const banks = await dexPayService.getBanks();
    const selectedBankObj = banks.find(bank => bank.code === selected_bank);
    
    if (!selectedBankObj) {
      return {
        error_message: "Invalid bank selection. Please try again."
      };
    }

    return {
      asset,
      chain,
      ngn_amount,
      selected_bank,
      bank_name: selectedBankObj.name
    };

  } catch (error) {
    logger.error("Error in bank selection flow:", error);
    return {
      error_message: "Failed to process bank selection. Please try again."
    };
  }
}

/**
 * Handle account input flow step
 */
async function handleAccountInputFlow(phoneNumber: string, data: any): Promise<any> {
  try {
    const { asset, chain, ngn_amount, selected_bank, bank_name, account_number } = data;

    // Validate account number format
    if (!/^\d{10}$/.test(account_number)) {
      return {
        error_message: "Please enter a valid 10-digit account number."
      };
    }

    // Resolve account
    const resolvedAccount = await dexPayService.resolveAccount(account_number, selected_bank);

    return {
      asset,
      chain,
      ngn_amount,
      bank_name,
      account_number,
      account_name: resolvedAccount.accountName
    };

  } catch (error: any) {
    logger.error("Error in account input flow:", error);
    return {
      error_message: error.message || "Failed to verify account. Please check the account number and try again."
    };
  }
}

/**
 * Handle account confirmation flow step
 */
async function handleAccountConfirmationFlow(phoneNumber: string, data: any): Promise<any> {
  try {
    const { asset, chain, ngn_amount, bank_name, account_number, account_name, confirmed } = data;

    if (confirmed !== "yes") {
      return {
        error_message: "Please confirm the account details to proceed."
      };
    }

    // Generate quote
    const user = await userService.getUser(phoneNumber);
    if (!user) {
      return {
        error_message: "User not found."
      };
    }

    const quoteRequest = {
      fiatAmount: ngn_amount,
      asset: asset.toLowerCase(),
      chain: chain.toLowerCase(),
      type: "SELL" as const,
      bankCode: data.selected_bank,
      accountName: account_name,
      accountNumber: account_number,
      receivingAddress: dexPayService.getReceivingAddress(chain.toLowerCase()),
    };

    const quote = await dexPayService.getQuote(quoteRequest);
    const fees = dexPayService.calculateFees(parseFloat(ngn_amount), quote.rate);
    
    // Check balance
    const chainType = crossmintService.getChainType(chain.toLowerCase());
    let balances: any[] = [];
    
    try {
      if (chainType === 'solana') {
        balances = await crossmintService.getBalancesByChain(user.userId, chain.toLowerCase(), ['usdc', 'sol']);
      } else {
        balances = await crossmintService.getBalancesByChain(user.userId, chain.toLowerCase(), ['usdc', 'usdt']);
      }
    } catch (error) {
      logger.warn("Error getting balances for quote:", error);
    }

    const assetBalance = balances.find(b => b.token.toLowerCase() === asset.toLowerCase());
    const currentBalance = assetBalance ? parseFloat(assetBalance.amount) : 0;
    
    const feesInCrypto = fees.totalFees / quote.rate;
    const totalCryptoNeeded = quote.cryptoAmount + feesInCrypto;

    if (currentBalance < totalCryptoNeeded) {
      return {
        error_message: `Insufficient balance. You need ${(totalCryptoNeeded - currentBalance).toFixed(6)} more ${asset}.`
      };
    }

    return {
      asset,
      chain,
      ngn_amount,
      crypto_amount: quote.cryptoAmount.toFixed(6),
      exchange_rate: quote.rate.toFixed(0),
      platform_fee: fees.platformFee.toFixed(0),
      dexpay_fee: fees.dexPayFee.toFixed(0),
      total_fees: fees.totalFees.toFixed(0),
      total_crypto_needed: totalCryptoNeeded.toFixed(6),
      current_balance: currentBalance.toFixed(6),
      bank_name,
      account_name,
      account_number,
      quote_id: quote.id
    };

  } catch (error: any) {
    logger.error("Error in account confirmation flow:", error);
    return {
      error_message: error.message || "Failed to generate quote. Please try again."
    };
  }
}

/**
 * Handle quote review flow step
 */
async function handleQuoteReviewFlow(phoneNumber: string, data: any): Promise<any> {
  const { proceed } = data;
  
  if (proceed !== "yes") {
    return {
      error_message: "Please confirm to proceed with the transaction."
    };
  }

  return {
    asset: data.asset,
    ngn_amount: data.ngn_amount,
    total_crypto_needed: data.total_crypto_needed,
    quote_id: data.quote_id,
    error_message: ""
  };
}

/**
 * Handle PIN verification flow step
 */
async function handlePinVerificationFlow(phoneNumber: string, data: any): Promise<any> {
  try {
    const { pin, asset, ngn_amount, total_crypto_needed } = data;

    // Verify PIN
    const user = await userService.getUser(phoneNumber, true);
    if (!user || !user.pin) {
      return {
        asset,
        ngn_amount,
        total_crypto_needed,
        error_message: "PIN verification failed. Please try again."
      };
    }

    const pinValid = await user.comparePin(pin);
    if (!pinValid) {
      return {
        asset,
        ngn_amount,
        total_crypto_needed,
        error_message: "Incorrect PIN. Please try again."
      };
    }

    // Execute transaction (this would typically be done asynchronously)
    // For the flow, we'll return success and handle the actual transaction separately
    
    return {
      ngn_amount,
      asset,
      crypto_used: total_crypto_needed,
      bank_name: data.bank_name || "Your Bank",
      account_name: data.account_name || "Your Account",
      transaction_id: data.quote_id || `txn_${Date.now()}`
    };

  } catch (error) {
    logger.error("Error in PIN verification flow:", error);
    return {
      asset: data.asset,
      ngn_amount: data.ngn_amount,
      total_crypto_needed: data.total_crypto_needed,
      error_message: "Transaction failed. Please try again."
    };
  }
}

/**
 * Get next screen based on current screen and response data
 */
function getNextScreen(currentScreen: string, responseData: any): string {
  if (responseData.error_message) {
    return currentScreen; // Stay on current screen if there's an error
  }

  const screenFlow = {
    "OFFRAMP_ASSET_SELECTION": "OFFRAMP_WALLET_DISPLAY",
    "OFFRAMP_WALLET_DISPLAY": "OFFRAMP_AMOUNT_INPUT",
    "OFFRAMP_AMOUNT_INPUT": "OFFRAMP_BANK_SELECTION",
    "OFFRAMP_BANK_SELECTION": "OFFRAMP_ACCOUNT_INPUT",
    "OFFRAMP_ACCOUNT_INPUT": "OFFRAMP_ACCOUNT_CONFIRMATION",
    "OFFRAMP_ACCOUNT_CONFIRMATION": "OFFRAMP_QUOTE_REVIEW",
    "OFFRAMP_QUOTE_REVIEW": "OFFRAMP_PIN_VERIFICATION",
    "OFFRAMP_PIN_VERIFICATION": "OFFRAMP_SUCCESS"
  };

  return screenFlow[currentScreen as keyof typeof screenFlow] || currentScreen;
}

/**
 * Extract phone number from flow token
 * This extracts the phone number from the WhatsApp Flow token
 */
function extractPhoneFromFlowToken(flowToken: string): string | null {
  try {
    // WhatsApp Flow tokens typically contain encoded user information
    // For now, we'll use a simple base64 decode approach
    // In production, you should implement proper JWT token verification
    
    // Try to decode as base64 first
    try {
      const decoded = Buffer.from(flowToken, 'base64').toString('utf-8');
      const phoneMatch = decoded.match(/\+\d{10,15}/);
      if (phoneMatch) {
        return phoneMatch[0];
      }
    } catch (e) {
      // If base64 decode fails, try to extract from token directly
    }
    
    // Try to extract phone number pattern from token directly
    const phoneMatch = flowToken.match(/\+\d{10,15}/);
    if (phoneMatch) {
      return phoneMatch[0];
    }
    
    // If no phone number found, return null
    // In production, you should implement proper token validation
    logger.warn("Could not extract phone number from flow token");
    return null;
    
  } catch (error) {
    logger.error("Error extracting phone from flow token:", error);
    return null;
  }
}