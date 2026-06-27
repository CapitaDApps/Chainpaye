# Offramp Transfer Error - Quick Fix Guide

## Problem
User sees: **"Transfer failed due to an unexpected error. Please try again or contact support if the problem persists."**

## Root Cause
The generic error message means the actual Crossmint API error isn't matching any known error patterns. Most commonly caused by:

1. ❌ Missing `CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY`
2. ❌ Invalid or mismatched Solana keypair
3. ❌ Missing `MAIN_WALLET_SOLANA_ADDRESS`
4. ❌ Invalid Crossmint API key

---

## Quick Fix (5 minutes)

### Step 1: Run Diagnostic
```bash
npx ts-node scripts/check-crossmint-config.ts
```

This will tell you exactly what's missing.

### Step 2: Add Missing Variables

Add to your `.env` file:

```bash
# Required for SOL USDC transfers
CROSSMINT_ADMIN_SOLANA_ADDRESS=YourSolanaPublicAddress
CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY=YourSolanaPrivateKeyBase58
MAIN_WALLET_SOLANA_ADDRESS=YourMainWalletAddress

# Enable debug mode to see actual errors
DEBUG_TRANSFERS=true
NODE_ENV=development
```

### Step 3: Verify Keypair
```bash
npx ts-node scripts/test-solana-keypair.ts
```

This ensures your private key matches your public address.

### Step 4: Restart Application
```bash
# Restart your Node.js application to load new env variables
pm2 restart all
# or
npm run dev
```

### Step 5: Test Transfer
Try the offramp again with a small amount (e.g., 1 USDC).

---

## What Was Changed

### 1. Enhanced Error Logging
**File:** `services/CrossmintService.ts`

Added detailed error logging to show actual API errors:
```typescript
console.error("\n❌ TRANSFER FAILED - DETAILED ERROR:");
console.error("Message:", error.message);
console.error("Status Code:", error.response?.status);
console.error("Response Data:", JSON.stringify(error.response?.data, null, 2));
```

### 2. Debug Mode Support
**File:** `services/CrossmintService.ts`

In development mode, actual error messages are shown:
```typescript
if (process.env.NODE_ENV === 'development' || process.env.DEBUG_TRANSFERS === 'true') {
  return `Transfer failed: ${errorMessage}. Status: ${errorCode}`;
}
```

### 3. Configuration Checker
**File:** `scripts/check-crossmint-config.ts`

New script to validate all environment variables.

### 4. Keypair Tester
**File:** `scripts/test-solana-keypair.ts`

New script to verify Solana private key matches public address.

### 5. Updated .env.example
**File:** `.env.example`

Added clear comments and all required variables:
```bash
# Main Wallet Addresses (where user crypto is transferred during offramp)
MAIN_WALLET_SOLANA_ADDRESS=your_main_solana_wallet_address
MAIN_WALLET_EVM_ADDRESS=your_main_evm_wallet_address
```

---

## How to Get Solana Keys

### Option 1: Using Phantom Wallet
1. Open Phantom wallet
2. Click Settings → Show Private Key
3. Copy the private key (base58 format)
4. Public address is shown in main screen

### Option 2: Using Solana CLI
```bash
# Generate new keypair
solana-keygen new --outfile ~/my-keypair.json

# Get public address
solana-keygen pubkey ~/my-keypair.json

# Get private key (base58)
cat ~/my-keypair.json | jq -r '.[0:32] | @base64d | @base58'
```

### Option 3: Using Node.js
```javascript
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// Generate new keypair
const keypair = Keypair.generate();

console.log('Public Address:', keypair.publicKey.toBase58());
console.log('Private Key:', bs58.encode(keypair.secretKey));
```

---

## Verification Checklist

Before testing offramp:

- [ ] `CROSSMINT_API_KEY` is set and starts with `sk_production_` or `sk_staging_`
- [ ] `CROSSMINT_ADMIN_SOLANA_ADDRESS` is a valid Solana address (32-44 chars, base58)
- [ ] `CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY` is set and in base58 format
- [ ] Private key matches public address (run `test-solana-keypair.ts`)
- [ ] `MAIN_WALLET_SOLANA_ADDRESS` is set to your receiving wallet
- [ ] `DEBUG_TRANSFERS=true` is enabled for detailed errors
- [ ] Application has been restarted after env changes
- [ ] Configuration check passes (`check-crossmint-config.ts`)

---

## Expected Behavior After Fix

### 1. Detailed Console Output
```
========================================
🚀 CROSSMINT TRANSFER REQUEST
========================================
📍 METHOD: POST
📍 ENDPOINT: https://crossmint.com/api/.../transfers
📦 REQUEST BODY: {
  "amount": "7.506757",
  "recipient": "MAIN_WALLET_ADDRESS",
  ...
}
========================================

⏳ Sending request to Crossmint...

✅ CROSSMINT RESPONSE RECEIVED:
Status: 200
Data: {
  "id": "txn_abc123",
  "status": "completed"
}
========================================
```

### 2. Successful Transfer
- User sees success screen immediately
- Crypto is transferred from user wallet to main wallet
- Background processing completes DexPay quote
- User receives NGN in bank account within 50 seconds
- Receipt is sent via email

### 3. Clear Error Messages (if issues persist)
Instead of generic error, you'll see specific errors like:
- "Insufficient funds for this transfer"
- "Invalid recipient address"
- "Wallet not found"
- etc.

---

## Still Having Issues?

1. **Check application logs** for the actual error
2. **Run both diagnostic scripts** to verify configuration
3. **Test with curl** to isolate the issue
4. **Check Crossmint dashboard** for transaction details
5. **Review troubleshooting guide**: `OFFRAMP_TRANSFER_TROUBLESHOOTING.md`

---

## Support

- **Crossmint Docs**: https://docs.crossmint.com
- **Crossmint Support**: support@crossmint.com
- **Crossmint Status**: https://status.crossmint.com
- **Solana Docs**: https://docs.solana.com

---

## Files Modified

1. ✅ `services/CrossmintService.ts` - Enhanced error logging
2. ✅ `.env.example` - Added main wallet addresses
3. ✅ `scripts/check-crossmint-config.ts` - New diagnostic script
4. ✅ `scripts/test-solana-keypair.ts` - New keypair verification script
5. ✅ `OFFRAMP_TRANSFER_TROUBLESHOOTING.md` - Comprehensive troubleshooting guide
6. ✅ `OFFRAMP_TRANSFER_ERROR_SUMMARY.md` - This quick fix guide
