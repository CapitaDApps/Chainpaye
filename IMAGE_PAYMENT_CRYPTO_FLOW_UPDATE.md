# Image Payment Crypto Flow Update

## Summary
Updated the image payment flow to integrate crypto offramp directly instead of launching a separate flow. Users can now select crypto payment method and complete the entire transaction within the image payment flow.

## Changes Made

### 1. Flow Structure (`webhooks/image_payment_flow.json`)

**New Routing:**
```
CONFIRM_DETAILS → SELECT_METHOD → SELECT_CRYPTO → REVIEW_CRYPTO → PIN → PROCESSING
```

**New Screens Added:**
- `SELECT_CRYPTO`: User selects asset (USDT/USDC) and network (BEP20/SOL/BASE/ARBITRUM/STELLAR)
- `REVIEW_CRYPTO`: Shows complete payment details including recipient, bank, amount, crypto amount, network, and rate

**Updated Screens:**
- `SELECT_METHOD`: Changed "Offramp (Crypto)" to "Pay with Crypto" for better UX
- `PIN`: Now handles both transfer and offramp payment methods with conditional messaging
- Added new data fields: `asset`, `network`, `sellAmount`, `rate`

### 2. Service Logic (`webhooks/services/imagePaymentFlow.service.ts`)

**New Handlers:**

#### SELECT_METHOD Handler
- Routes to PIN screen for "transfer" method
- Routes to SELECT_CRYPTO screen for "offramp" method

#### SELECT_CRYPTO Handler
- Validates asset-network combinations
  - USDC: Supported on SOL, BSC, BASE, ARBITRUM, STELLAR
  - USDT: Supported on SOL, BSC, ARBITRUM
- Fetches real-time exchange rates from DexPay
- Applies spread (configurable via `OFFRAMP_SPREAD_NGN` env var)
- Calculates crypto amount needed
- Returns REVIEW_CRYPTO screen with all details

#### PIN Handler (Offramp Path)
- Validates PIN
- Normalizes chain names for DexPay and Crossmint
- Fetches current exchange rate
- Calculates transaction financials (fees, total crypto required)
- Checks wallet balance
- Transfers crypto from user wallet to main wallet
- Processes DexPay quote and completion in background
- Returns success screen immediately

### 3. Background Processing (`webhooks/services/cryptoTopUp.service.ts`)

**Exported Function:**
- `processOfframpInBackground`: Now exported for use in image payment flow
- Handles DexPay quote creation and completion asynchronously
- Sends success notifications and receipts
- Processes referral earnings

## User Experience Flow

### Transfer Method (Unchanged)
1. Confirm bank details
2. Select "Transfer (NGN Balance)"
3. Enter PIN
4. Payment processed

### Crypto Payment Method (New)
1. Confirm bank details from image
2. Select "Pay with Crypto"
3. Select asset (USDT/USDC) and network
4. Review details:
   - Recipient name
   - Bank name
   - Account number
   - Amount to receive (NGN)
   - Crypto amount selling
   - Network
   - Exchange rate (with spread)
5. Enter PIN
6. Payment processed

## Technical Details

### Rate Calculation
```typescript
// Get rate from DexPay
const rateData = await dexPayService.getCurrentRates(asset, chain, ngnAmount);

// Apply spread
const spreadNgn = parseFloat(process.env.OFFRAMP_SPREAD_NGN || "60");
const spreadRate = rateData.rate - spreadNgn;

// Calculate crypto amount
const usdAmount = ngnAmount / spreadRate;
```

### Supported Combinations
- **USDC**: BEP20, SOL, BASE, ARBITRUM, STELLAR
- **USDT**: BEP20, SOL, ARBITRUM (NOT Stellar)

**Important:** Stellar only supports USDC, not USDT.

### Chain Mapping
```typescript
{
  sol: { dexPay: "solana", crossmint: "solana" },
  bsc: { dexPay: "bep20", crossmint: "bsc" },
  base: { dexPay: "base", crossmint: "base" },
  arbitrum: { dexPay: "arbitrum", crossmint: "arbitrum" },
  stellar: { dexPay: "stellar", crossmint: "stellar" }
}
```

## Benefits

1. **Seamless UX**: No need to switch between flows or re-enter bank details
2. **Real-time Rates**: Users see exact exchange rate before confirming
3. **Transparent Pricing**: Shows crypto amount, rate, and spread clearly
4. **Balance Validation**: Checks wallet balance before attempting transfer
5. **Fast Response**: Returns success immediately, processes DexPay in background
6. **Error Handling**: Clear error messages for insufficient balance, invalid combinations, etc.

## Environment Variables Used

- `OFFRAMP_SPREAD_NGN`: Spread applied to exchange rate (default: 60)
- `OFFRAMP_FLAT_FEE_USD`: Flat fee in USD (default: 0.75)
- `OFFRAMP_MIN_AMOUNT_NGN`: Minimum offramp amount (default: 5000)
- `OFFRAMP_MAX_AMOUNT_NGN`: Maximum offramp amount (default: 10000000)

## Testing Checklist

### Image Payment → Transfer
- [ ] Send image with bank details + amount
- [ ] Verify extracted details are correct
- [ ] Select "Transfer (NGN Balance)"
- [ ] Enter correct PIN
- [ ] Verify NGN balance is checked
- [ ] Verify withdrawal is processed
- [ ] Verify transaction receipt is sent

### Image Payment → Crypto
- [ ] Send image with bank details + amount
- [ ] Verify extracted details are correct
- [ ] Select "Pay with Crypto"
- [ ] Select USDC on BASE
- [ ] Verify rate is fetched and displayed
- [ ] Review details screen shows all info correctly
- [ ] Enter correct PIN
- [ ] Verify balance is checked
- [ ] Verify crypto transfer succeeds
- [ ] Verify success screen appears immediately
- [ ] Verify DexPay processing happens in background
- [ ] Verify receipt is sent

### Error Cases
- [ ] Incorrect PIN → Shows error, allows retry
- [ ] Insufficient crypto balance → Shows error with shortfall amount
- [ ] Invalid asset-network combination → Shows error with supported combinations
- [ ] Rate fetch failure → Shows error message
- [ ] Transfer failure → Shows error message
- [ ] Session expired → Shows error message

## Backward Compatibility

- Normal transfer flow unchanged
- Normal offramp flow (via command) unchanged
- Image payment transfer method unchanged
- Only adds new crypto payment path to image payment flow
