/**
 * Off-ramp Flow Service
 * Handles the business logic for WhatsApp Flow off-ramp interactions
 */

import { userService, crossmintService, dexPayService } from "../../services";
import { logger } from "../../utils/logger";

/**
 * Initialize off-ramp flow and get user wallets
 */
export async function initializeOfframpFlow(phoneNumber: string): Promise<any> {
  try {
    // Get user
    const user = await userService.getUser(phoneNumber);
    if (!user) {
      return {
        error_message: "Account not found. Please create an account first."
      };
    }

    // Check if user is verified (required for off-ramp)
    if (!user.isVerified) {
      return {
        error_message: "KYC verification required. Please complete verification first."
      };
    }

    // Get all user wallets with balances
    const wallets = await crossmintService.listWallets(user.userId);
    const userWallets = [];

    for (const wallet of wallets) {
      try {
        let balances: any[] = [];
        
        if (wallet.chainType === 'solana') {
          balances = await crossmintService.getBalancesByChain(user.userId, 'solana', ['usdc', 'sol']);
        } else {
          balances = await crossmintService.getBalancesByChain(user.userId, wallet.chainType, ['usdc', 'usdt']);
        }

        // Filter balances with value > 0
        const nonZeroBalances = balances.filter(balance => parseFloat(balance.amount) > 0);
        
        if (nonZeroBalances.length > 0) {
          for (const balance of nonZeroBalances) {
            const amount = parseFloat(balance.amount).toFixed(6);
            userWallets.push({
              chain: wallet.chainType,
              address: wallet.address,
              balance: `${amount} ${balance.token.toUpperCase()}`
            });
          }
        }
      } catch (error) {
        logger.error(`Error getting balances for ${wallet.chainType} wallet:`, error);
      }
    }

    return {
      user_wallets: userWallets
    };

  } catch (error) {
    logger.error("Error initializing off-ramp flow:", error);
    return {
      error_message: "Failed to initialize off-ramp. Please try again."
    };
  }
}

/**
 * Validate asset and chain combination
 */
export function validateAssetChain(asset: string, chain: string): boolean {
  return dexPayService.isSupportedAssetChain(asset.toLowerCase(), chain.toLowerCase());
}

/**
 * Get supported assets and chains
 */
export function getSupportedAssetsAndChains(): any {
  return {
    assets: [
      { id: "USDC", title: "USD Coin (USDC)" },
      { id: "USDT", title: "Tether (USDT)" }
    ],
    chains: [
      { id: "solana", title: "Solana" },
      { id: "bep20", title: "BNB Smart Chain (BEP20)" },
      { id: "base", title: "Base Network" },
      { id: "arbitrium", title: "Arbitrum" },
      { id: "hedera", title: "Hedera" },
      { id: "apechain", title: "ApeChain" },
      { id: "lisk", title: "Lisk" }
    ]
  };
}

/**
 * Format NGN amount
 */
export function formatNGN(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}