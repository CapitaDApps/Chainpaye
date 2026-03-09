# Offramp Fee Structure Update - Implementation Summary

## Overview
Updated the offramp fee structure from a percentage-based model to a flat fee + spread model.

## Changes Made

### 1. Fee Structure Changes

**Old Structure:**
- Platform Fee: 1.5% of transaction amount
- DexPay Fee: $0.20 USD
- Exchange Rate: Direct rate from DexPay

**New Structure:**
- Platform Fee: $0.75 USD (flat fee)
- DexPay Fee: $0 (removed)
- Exchange Rate: DexPay rate minus 60 NGN spread
- Spread: 60 NGN per USD

### 2. Example Calculation

**User wants to offramp 5,000 NGN:**

1. DexPay provides rate: 1400 NGN/USD
2. Apply 60 NGN spread: 1400 - 60 = 1340 NGN/USD (shown to user)
3. Calculate USD needed: 5000 / 1340 = 3.73 USD
4. Add flat fee: 3.73 + 0.75 = 4.48 USD
5. **Total deducted from user wallet: 4.48 USD**
6. Transfer to DexPay wallet: 4.48 USD
7. DexPay quote: 5000 NGN (original amount)
8. DexPay converts: 4.48 × 1400 = 6,272 NGN
9. User receives in bank: 5,000 NGN
10. **Your profit: 4.48 - 3.57 = 0.91 USD** (where 3.57 = 5000/1400)

### 3. WhatsApp Flow Display

**OFFRAMP_FIAT_REVIEW Screen will show:**
```
Review Details
━━━━━━━━━━━━━━━━━━━━━━
Recipient: John Doe
Bank: GTBank
Account: 0123456789
To Receive: ₦5,000
Selling: 3.73 USDC
Network: BASE
Rate: 1 USDC = ₦1,340 (with spread)
```

**OFFRAMP_CRYPTO_REVIEW Screen will show:**
```
Authorize
━━━━━━━━━━━━━━━━━━━━━━
To Receive: ₦5,000
Selling: 3.73 USDC
Fee: $0.75 USD
Total: 4.48 USDC
Network: BASE
Enter PIN to Confirm
```

### 3. Files Modified

#### Configuration Files
- **`Chainpaye/.env.example`**
  - Added: `OFFRAMP_FLAT_FEE_USD=0.75`
  - Added: `OFFRAMP_SPREAD_NGN=60`

#### Service Files
- **`Chainpaye/services/crypto-off-ramp/FinancialService.ts`**
  - Changed `CHAINPAYE_FEE_RATE` (1.5%) to `CHAINPAYE_FLAT_FEE_USD` (reads from env)
  - Changed `DEXPAY_FEE_USD` (0.20) to `SPREAD_NGN` (reads from env)
  - Both constants now read from environment variables for easy configuration
  - Added `applySpreadToRate()` method
  - Updated `calculateChainpayeFee()` to use flat fee
  - Updated `calculateDexpayFee()` to return 0
  - Updated `calculateTransactionFinancials()` to use spread rate
  - Updated `calculateTotalWithFees()` to use spread rate
  - Updated `isSufficientBalance()` to use spread rate
  - Added `getUserFacingRate()` method
  - Updated `getFeeRates()` return type

- **`Chainpaye/services/DexPayService.ts`**
  - Updated `calculateFees()` method to use flat fee and spread
  - Updated comments to reflect new fee structure

- **`Chainpaye/services/crypto-off-ramp/WorkflowController.ts`**
  - Updated fee calculation in bank resolution step (reads from env)
  - Updated balance validation to use spread rate (reads from env)
  - Updated totalInUsd calculation (reads from env)
  - All fee and spread values now configurable via environment variables

#### Handler Files
- **`Chainpaye/commands/handlers/offrampHandler.ts`**
  - Updated fee display message in `handleSpendCrypto()`
  - Updated transaction summary in `handleAccountConfirmation()`
  - Updated success message in `executeOfframpTransaction()`
  - All messages now show "$0.75 USD" instead of "1.5%"
  - All messages now show spread rate instead of original DexPay rate

#### Flow Files
- **`Chainpaye/webhooks/offramp_flow.json`**
  - Updated helper text for amount input to show "$0.75 USD" fee
  - Updated OFFRAMP_FIAT_REVIEW screen to show:
    - "To Receive": Amount in NGN (what user will get in bank)
    - "Selling": Amount in USD excluding fees (calculated with spread rate)
    - "Rate": Exchange rate with spread applied
    - Removed fee display from this screen
  - Updated OFFRAMP_CRYPTO_REVIEW screen to show:
    - "To Receive": Amount in NGN
    - "Selling": Amount in USD excluding fees
    - "Fee": $0.75 USD
    - "Total": Selling amount + fee (total USD to deduct)
  - Added `sell_amount_usd`, `amount_to_receive`, and `total_amount_usd` data fields
  - Removed `total_fee_usd` field (replaced with `total_amount_usd`)

- **`Chainpaye/webhooks/services/cryptoTopUp.service.ts`**
  - Updated `OFFRAMP_FIAT_REVIEW` case to:
    - Apply spread to displayed rate (reads from env)
    - Calculate USD amount (excluding fees) using spread rate
    - Format amount to receive with comma separators
    - Pass `sell_amount_usd` and `amount_to_receive` to flow
  - Updated `OFFRAMP_FIAT_REVIEW` transition to calculate:
    - `total_amount_usd`: Selling amount + flat fee (both from env)
    - Properly format total with trailing zero handling
    - Pass all required fields to OFFRAMP_CRYPTO_REVIEW screen
  - All calculations now use environment variables for easy configuration

#### Type Files
- **`Chainpaye/types/crypto-off-ramp.types.ts`**
  - Updated comments for `chainpayeFee` and `dexpayFee` fields

### 4. Key Implementation Details

#### Spread Application
The spread is applied to the exchange rate shown to users:
```typescript
const spreadRate = dexpayRate - 60; // User sees worse rate
const userPays = (amount / spreadRate) + 0.75; // Total USD deducted
```

#### Quote Creation
- DexPay quote still receives the **original NGN amount** (e.g., 5000)
- No changes to quote creation logic
- Wallet transfer logic remains unchanged

#### Profit Calculation
Your profit comes from two sources:
1. **Flat fee**: $0.75 USD (direct profit)
2. **Spread profit**: Difference between what user pays and what DexPay needs
   - Example: User pays 4.48 USD, DexPay needs 3.57 USD = 0.91 USD total profit

### 5. User-Facing Changes

**Messages Updated:**
- "A flat fee of $0.75 USD will apply" (instead of "1.5% + $0.20")
- Exchange rate shown includes spread (e.g., 1340 instead of 1400)
- Fee breakdown shows only "$0.75 USD" platform fee
- No separate DexPay fee displayed

### 6. Testing Recommendations

1. **Test with various amounts:**
   - Small: 1,000 NGN
   - Medium: 50,000 NGN
   - Large: 500,000 NGN

2. **Verify calculations:**
   - User sees spread rate (DexPay rate - 60)
   - Total USD = (amount / spread rate) + 0.75
   - DexPay quote receives original NGN amount

3. **Check edge cases:**
   - Insufficient balance scenarios
   - Rate changes during transaction
   - Quote expiration handling

### 7. Environment Variables

Make sure to add these to your actual `.env` file:
```env
OFFRAMP_FLAT_FEE_USD=0.75
OFFRAMP_SPREAD_NGN=60
```

**Important:** Both values are now fully configurable via environment variables:
- Change `OFFRAMP_FLAT_FEE_USD` to adjust the flat fee (e.g., 0.50, 1.00)
- Change `OFFRAMP_SPREAD_NGN` to adjust the spread (e.g., 50, 70, 100)
- No code changes needed - just update `.env` and restart the application

**Example:** To change spread to 50 NGN and fee to $1.00:
```env
OFFRAMP_FLAT_FEE_USD=1.00
OFFRAMP_SPREAD_NGN=50
```

### 8. Backward Compatibility

**Removed/Deprecated:**
- `OFFRAMP_FEE_PERCENTAGE` environment variable
- `DEXPAY_FIXED_FEE_USD` environment variable (or set to 0)
- Percentage-based fee calculation methods

**Note:** Old transactions in the database will still have the old fee structure. This only affects new transactions going forward.

## Deployment Checklist

- [ ] Update `.env` file with new variables
- [ ] Remove or set old variables to 0
- [ ] **Upload updated `offramp_flow.json` to Meta Business Suite**
- [ ] Test offramp flow end-to-end (both command and flow)
- [ ] Verify user messages display correctly
- [ ] Confirm profit calculations are accurate
- [ ] Monitor first few transactions closely
- [ ] Update any documentation or user guides

## Important Notes

### WhatsApp Flow Update Required
After deploying the code changes, you MUST update the WhatsApp Flow in Meta Business Suite:
1. Go to Meta Business Suite > WhatsApp Flows
2. Find your "Off-Ramp (Sell Crypto)" flow
3. Upload the updated `offramp_flow.json` file
4. Publish the updated flow

**The flow will not show the correct fees until you update it in Meta Business Suite!**

### Other Services Not Modified
The following services still use the old 1.5% fee structure and were NOT modified (they are for different features):
- `withdrawalFlow.service.ts` - Toronet withdrawal feature
- `EarningsService.ts` - Referral earnings calculation
- `DashboardService.ts` - Dashboard analytics

These services are separate from the crypto offramp feature and should be updated separately if needed.

## Support

If you encounter any issues with the new fee structure, check:
1. Environment variables are set correctly
2. FinancialService is using the new constants
3. Messages display the spread rate, not original rate
4. Total USD calculation includes flat fee

---

**Implementation Date:** 2026-03-09
**Status:** ✅ Complete
