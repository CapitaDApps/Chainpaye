# Stellar USDC Implementation in Offramp

## Overview
Stellar USDC requires special handling because DexPay doesn't support direct Stellar USDC quotes. The system uses USDT on BSC as a proxy for rate calculation and quote generation.

## How It Works

### User Flow
1. User selects **USDC** on **Stellar** network
2. System shows rate based on USDT/BSC (proxy)
3. User confirms and enters PIN
4. System transfers USDC from user's Stellar wallet to main wallet
5. Background: DexPay processes using USDT/BSC equivalent

### Technical Implementation

#### 1. Rate Fetching (SELECT_CRYPTO Screen)
```typescript
// For Stellar: rate fetch uses USDT on BSC since that's what DexPay will quote
const isStellar = dexPayChain === "stellar";
const rateQueryAsset = isStellar ? "USDT" : asset;
const rateQueryChain = isStellar ? "bep20" : dexPayChain;

const rateData = await dexPayService.getCurrentRates(
  rateQueryAsset,  // USDT for Stellar, otherwise selected asset
  rateQueryChain,  // bep20 for Stellar, otherwise selected chain
  ngnAmount
);
```

**Example:**
- User selects: USDC on Stellar
- Rate fetched: USDT on BSC (e.g., ₦1,400 per USDT)
- User sees: "1 USDC = ₦1,400" (using USDT rate as proxy)

#### 2. User Transfer (PIN Screen)
```typescript
// User transfers USDC on Stellar
const transferResult = await crossmintService.transferTokens({
  walletAddress: wallet.address,
  token: `stellar:usdc`,  // Actual Stellar USDC
  recipient: receivingAddress,
  amount: totalCryptoRequired.toString(),
  idempotencyKey: transferIdempotencyKey,
});
```

**What happens:**
- User's Stellar USDC wallet → Main Stellar USDC wallet
- Amount: Calculated based on USDT/BSC rate

#### 3. Background Processing
```typescript
processOfframpInBackground(
  userId,
  phone,
  ngnAmount,
  dexPayQuoteAsset,  // "USDT" for Stellar
  dexPayQuoteChain,  // "bep20" for Stellar
  bankCode,
  accountName,
  accountNumber,
  receivingAddress,
  asset,  // "USDC" for display
  bankName,
  totalInUsd,
  dexPayService,
  idempotencyKey,
);
```

**DexPay Quote Request:**
```json
{
  "fiatAmount": 5000,
  "asset": "USDT",
  "chain": "BSC",
  "type": "SELL",
  "bankCode": "000013",
  "accountName": "John Doe",
  "accountNumber": "0123456789",
  "receivingAddress": "0xAA7Ee1e18FC9B9D3bf51b6015566c63D8bC2a28f"
}
```

## Chain Mapping

### Crossmint (User Wallet)
```typescript
{
  stellar: "stellar"  // User's Stellar USDC wallet
}
```

### DexPay (Quote & Settlement)
```typescript
{
  stellar: "bep20"  // Uses BSC for DexPay operations
}
```

### Asset Mapping
```typescript
{
  stellar: {
    userAsset: "USDC",      // What user holds
    dexPayAsset: "USDT",    // What DexPay quotes
    displayAsset: "USDC"    // What user sees
  }
}
```

## Why This Approach?

### Problem
- DexPay doesn't support Stellar USDC directly
- Can't get quotes or process offramps for Stellar USDC
- **Stellar only supports USDC (not USDT)**

### Solution
- Use USDT/BSC as a proxy for rate calculation
- User still transfers actual Stellar USDC
- DexPay processes equivalent USDT/BSC amount
- Rate parity: 1 USDC ≈ 1 USDT (both pegged to USD)

### Assumptions
1. **Rate Parity:** USDC and USDT have similar rates (both ~$1)
2. **Liquidity:** Main wallet has USDT/BSC to fulfill DexPay quotes
3. **Conversion:** Backend handles Stellar USDC → USDT/BSC conversion
4. **Stellar Limitation:** Only USDC is available on Stellar network

## Code Locations

### Image Payment Flow
**File:** `webhooks/services/imagePaymentFlow.service.ts`

**SELECT_CRYPTO Handler (Line ~140):**
```typescript
const isStellar = dexPayChain === "stellar";
const rateQueryAsset = isStellar ? "USDT" : asset;
const rateQueryChain = isStellar ? "bep20" : dexPayChain;
```

**PIN Handler (Line ~410):**
```typescript
const isStellar = crossmintChain === "stellar";
const dexPayQuoteChain = isStellar ? "bep20" : dexPayChain;
const dexPayQuoteAsset = isStellar ? "USDT" : normalizedAsset;
```

### Offramp Flow
**File:** `webhooks/services/cryptoTopUp.service.ts`

**OFFRAMP_DETAILS Handler (Line ~635):**
```typescript
const isStellarPreview = dexPayChain === "stellar";
const rateQueryAsset = isStellarPreview ? "USDT" : currency;
const rateQueryChain = isStellarPreview ? "bep20" : dexPayChain;
```

**OFFRAMP_CRYPTO_REVIEW Handler (Line ~903):**
```typescript
const isStellar = crossmintChain === "stellar";
const dexPayQuoteChain = isStellar ? "bep20" : dexPayChain;
const dexPayQuoteAsset = isStellar ? "USDT" : normalizedAsset;
```

## User Experience

### What User Sees
```
Select Asset & Network
Asset: USDC
Network: Stellar

Review Payment
Recipient: John Doe
Bank: GTBank
Account: 0123456789
To Receive: ₦5,000
Selling: 3.73 USDC
Network: STELLAR
Rate: 1 USDC = ₦1,340 (with spread)
```

### What Actually Happens
1. Rate shown: USDT/BSC rate (₦1,340)
2. User transfers: 3.73 USDC on Stellar
3. DexPay quote: 3.73 USDT on BSC
4. Settlement: USDT/BSC → NGN

## Potential Issues

### 1. Rate Discrepancy
**Issue:** USDC and USDT rates may differ slightly
**Impact:** User might get slightly more/less NGN than expected
**Mitigation:** Rates are usually within 1-2% due to USD peg

### 2. Liquidity Mismatch
**Issue:** Main wallet needs USDT/BSC but receives Stellar USDC
**Impact:** May need manual conversion or liquidity management
**Mitigation:** Backend should handle conversion or maintain both assets

### 3. User Confusion
**Issue:** User sends USDC but system uses USDT for quotes
**Impact:** Confusion if user checks DexPay transaction details
**Mitigation:** Clear messaging, show "USDC" in all user-facing text

### 4. Failed Conversion
**Issue:** If backend can't convert Stellar USDC → USDT/BSC
**Impact:** User's crypto is transferred but offramp fails
**Mitigation:** Proper error handling and refund mechanism

## Testing Checklist

### Stellar USDC Flow
- [ ] Select USDC on Stellar
- [ ] Verify rate is fetched (should use USDT/BSC)
- [ ] Verify rate is displayed as "USDC" (not USDT)
- [ ] Review screen shows "Selling: X USDC" (not USDT)
- [ ] Review screen shows "Network: STELLAR"
- [ ] Enter PIN
- [ ] Verify Stellar USDC is transferred from user wallet
- [ ] Verify DexPay quote uses USDT/BSC
- [ ] Verify NGN is received in bank account
- [ ] Verify receipt shows USDC (not USDT)

### Rate Comparison
- [ ] Check USDC/Stellar rate (if available elsewhere)
- [ ] Check USDT/BSC rate (what system uses)
- [ ] Verify rates are within 2% of each other
- [ ] Verify spread is applied correctly

### Error Cases
- [ ] Insufficient Stellar USDC balance → Shows error
- [ ] Rate fetch fails → Shows error
- [ ] Transfer fails → Shows error
- [ ] DexPay quote fails → Background error, user notified

## Recommendations

1. **Monitor Rate Discrepancy:** Track USDC vs USDT rate differences
2. **Liquidity Management:** Ensure main wallet has USDT/BSC liquidity
3. **Conversion Automation:** Automate Stellar USDC → USDT/BSC conversion
4. **User Communication:** Consider adding disclaimer about proxy rates
5. **Alternative Solution:** Request DexPay to add Stellar USDC support

## Future Improvements

1. **Direct Stellar Support:** Work with DexPay to add native Stellar USDC
2. **Rate Averaging:** Use average of USDC and USDT rates
3. **Real-time Conversion:** Convert Stellar USDC to USDT/BSC immediately
4. **Separate Pricing:** Show different rates for Stellar vs other chains
5. **User Choice:** Let user choose between Stellar USDC or USDT/BSC
