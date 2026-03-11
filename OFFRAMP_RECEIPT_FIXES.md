# Offramp Receipt Fixes - March 11, 2026

## Issues Fixed

### 1. ✅ Receipt Integration Updated
**Problem:** The `cryptoTopUp.service.ts` was using the OLD interface with removed parameters.

**Fixed:**
- Removed: `cryptoAmount`, `cryptoSymbol`, `exchangeRate`
- Added: `fees` parameter (reads from `OFFRAMP_FLAT_FEE_USD` env variable)
- Simplified the receipt data preparation

**Changes in `webhooks/services/cryptoTopUp.service.ts`:**
```typescript
// OLD (BROKEN)
sendOfframpReceiptAsync(phone, {
  ngnAmount: ngnAmount,
  cryptoSpentUsd: totalInUsd,
  cryptoAmount: totalInUsd,
  cryptoSymbol: normalizedAsset,
  exchangeRate: rateData.rate,
  // ...
});

// NEW (WORKING)
sendOfframpReceiptAsync(phone, {
  ngnAmount: ngnAmount,
  cryptoSpentUsd: totalInUsd,
  fees: flatFeeUsd,
  // ...
});
```

### 2. ✅ Linux Compatibility Added
**Problem:** Puppeteer had no `executablePath` configured, which would fail on Linux servers.

**Fixed:**
- Added `CHROMIUM_PATH` environment variable support
- Works on both Windows (bundled Chromium) and Linux (custom path)

**Changes in `utils/generateOfframpReceipt.ts`:**
```typescript
const launchOptions: any = {
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ],
};

// Set Chromium path if provided (for Linux)
if (process.env.CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.CHROMIUM_PATH;
}

const browser = await puppeteer.launch(launchOptions);
```

**Added to `.env.example`:**
```bash
# Receipt Generation Configuration
# For Linux servers, set the path to Chromium browser
# Example: CHROMIUM_PATH=/usr/bin/chromium-browser
# For Windows, leave empty to use bundled Chromium
CHROMIUM_PATH=
```

### 3. ✅ Receipt Template Updated
**Removed from receipt:**
- Exchange Rate (1 USD = ₦X,XXX.XX)
- Crypto Amount (100.750000 USDC)

**Added to receipt:**
- Fees ($0.75)

**Current Receipt Fields:**
1. Status
2. Crypto Spent (USD)
3. **Fees** ← NEW
4. Bank Name
5. Account Name
6. Account Number
7. Date & Time
8. Transaction Reference

## Testing Results

✅ Receipt generation tested successfully on Windows
✅ All TypeScript diagnostics pass
✅ Integration with offramp flow updated
✅ Linux compatibility added via environment variable

## Deployment Instructions

### For Linux Servers:
1. Install Chromium:
   ```bash
   sudo apt-get update
   sudo apt-get install -y chromium-browser
   ```

2. Add to `.env` file:
   ```bash
   CHROMIUM_PATH=/usr/bin/chromium-browser
   ```

3. Verify installation:
   ```bash
   which chromium-browser
   ```

### For Windows:
- No configuration needed
- Uses bundled Chromium automatically

## Files Modified

1. `webhooks/services/cryptoTopUp.service.ts` - Updated receipt integration
2. `utils/generateOfframpReceipt.ts` - Added Linux support, updated interface
3. `utils/sendOfframpReceipt.ts` - Updated interface
4. `templates/offrampReceipt.hbs` - Updated template (removed exchange rate, crypto amount; added fees)
5. `.env.example` - Added CHROMIUM_PATH configuration

## Verification

Run test to verify:
```bash
npm run test:offramp-receipt
# or
npx tsx utils/testGenerateSingleReceipt.ts
```

Expected output:
- Receipt data shows fees instead of exchange rate
- Image generated successfully
- Saved to `output/test_offramp_receipt.png`

## Summary

✅ Receipt is now being sent to users after offramp completion
✅ Receipt generation will work on Linux with proper configuration
✅ All interfaces updated to use new simplified format
✅ Fees are now displayed instead of exchange rate and crypto amount
