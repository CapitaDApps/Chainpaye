# Offramp Transfer Troubleshooting Guide

## Error: "Transfer failed due to an unexpected error"

This guide helps you diagnose and fix transfer failures during the offramp process.

---

## Quick Diagnostic Steps

### 1. Run Configuration Check

```bash
npx ts-node scripts/check-crossmint-config.ts
```

This will verify all required environment variables are set correctly.

### 2. Enable Debug Mode

Add to your `.env`:
```bash
DEBUG_TRANSFERS=true
NODE_ENV=development
```

This will show actual error messages instead of generic ones.

### 3. Check Application Logs

Look for these log entries:

```
[OFFRAMP] Transferring X USDC to main wallet...
```

Then find the error:
```
Transfer failed permanently on attempt 1/3:
{
  error: { ... },  ← THE ACTUAL ERROR IS HERE
  statusCode: XXX
}
```

---

## Common Issues & Solutions

### Issue 1: Missing Solana Admin Private Key

**Error in logs:**
```
No admin address configured for chain type: solana
```

**Solution:**
```bash
# Add to .env
CROSSMINT_ADMIN_SOLANA_ADDRESS=YourSolanaPublicAddress
CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY=YourSolanaPrivateKeyBase58
```

**How to get Solana keys:**
1. Use Phantom wallet or Solana CLI
2. Export private key in base58 format
3. Public address should be 32-44 characters (base58)
4. Private key should be ~88 characters (base58)

---

### Issue 2: Invalid API Key

**Error in logs:**
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

**Solution:**
```bash
# Verify API key format
CROSSMINT_API_KEY=sk_production_...  # Must start with sk_production_ or sk_staging_

# Get from: https://www.crossmint.com/console/developers/api-keys
```

---

### Issue 3: Wallet Not Found

**Error in logs:**
```json
{
  "error": "Wallet not found",
  "message": "Wallet ABC123... does not exist"
}
```

**Possible causes:**
1. User's wallet wasn't created properly
2. Wrong wallet address being used
3. Wallet exists on different environment (staging vs production)

**Solution:**
```typescript
// Check wallet creation
const wallets = await crossmintService.listWallets(userId);
console.log("User wallets:", wallets);

// Verify Solana wallet exists
const solanaWallet = wallets.find(w => w.chainType === "solana");
if (!solanaWallet) {
  // Create Solana wallet
  await crossmintService.getOrCreateWallet(userId, "solana");
}
```

---

### Issue 4: Invalid Token Identifier

**Error in logs:**
```json
{
  "error": "Invalid token",
  "message": "Token solana:usdc not found"
}
```

**Solution:**
Verify token identifier format:
```typescript
// Correct format
const token = "solana:usdc";  // ✅ lowercase chain and symbol

// Wrong formats
const token = "SOL:USDC";     // ❌ uppercase
const token = "sol:usdc";     // ❌ wrong chain name
const token = "usdc";         // ❌ missing chain
```

---

### Issue 5: Invalid Recipient Address

**Error in logs:**
```json
{
  "error": "Invalid recipient",
  "message": "Recipient address is not valid"
}
```

**Solution:**
```bash
# Check main wallet address
MAIN_WALLET_SOLANA_ADDRESS=ValidSolanaAddressHere

# Verify in DexPayService
const receivingAddress = dexPayService.getReceivingAddress("solana");
console.log("Receiving address:", receivingAddress);
```

---

### Issue 6: Insufficient Balance (Despite Validation)

**Error in logs:**
```json
{
  "error": "Insufficient balance",
  "message": "Wallet has 5.0 USDC but requires 7.5 USDC"
}
```

**Possible causes:**
1. Balance changed between validation and transfer
2. Decimal conversion issue
3. Another transaction consumed the balance

**Solution:**
```typescript
// Add more detailed balance logging
console.log("Balance validation:", {
  rawAmount: balance.rawAmount,
  decimals: balance.decimals,
  convertedAmount: parseFloat(balance.rawAmount) / Math.pow(10, balance.decimals),
  required: totalCryptoRequired
});
```

---

### Issue 7: Transaction Awaiting Approval (Stuck)

**Error in logs:**
```json
{
  "status": "awaiting-approval",
  "message": "Transaction created but auto-approval failed"
}
```

**Possible causes:**
1. Missing or incorrect private key
2. Private key doesn't match public address
3. Message signing failed

**Solution:**
```bash
# Verify private key matches public address
CROSSMINT_ADMIN_SOLANA_ADDRESS=ABC123...
CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY=5Kn8...  # Must correspond to ABC123...

# Test key pair
npx ts-node scripts/test-solana-keypair.ts
```

---

### Issue 8: Rate Limiting

**Error in logs:**
```json
{
  "error": "Too many requests",
  "statusCode": 429
}
```

**Solution:**
- Wait 1-5 minutes before retrying
- Implement exponential backoff (already in code)
- Contact Crossmint to increase rate limits
- Check if you're making duplicate requests

---

### Issue 9: Crossmint API Down

**Error in logs:**
```json
{
  "error": "Service unavailable",
  "statusCode": 500
}
```

**Solution:**
1. Check Crossmint status: https://status.crossmint.com
2. Wait and retry (automatic retry is built-in)
3. If persistent, contact Crossmint support

---

## Advanced Debugging

### Enable Detailed Console Logging

The code already includes detailed console logs. Look for:

```
========================================
🚀 CROSSMINT TRANSFER REQUEST
========================================
📍 METHOD: POST
📍 ENDPOINT: https://...
📦 REQUEST BODY: {...}
========================================

⏳ Sending request to Crossmint...

✅ CROSSMINT RESPONSE RECEIVED:
Status: 200
Data: {...}
========================================
```

### Test Transfer Manually

```bash
# Test with curl
curl -X POST "https://crossmint.com/api/2025-06-09/wallets/WALLET_ADDRESS/tokens/solana:usdc/transfers" \
  -H "X-API-KEY: sk_production_..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -d '{
    "amount": "1.0",
    "recipient": "MAIN_WALLET_ADDRESS",
    "transactionType": "direct"
  }'
```

### Check Crossmint Dashboard

1. Go to https://www.crossmint.com/console
2. Navigate to Wallets → Transactions
3. Look for failed transactions
4. Check error details in dashboard

---

## Environment Variable Checklist

Required for SOL USDC offramp:

- [ ] `CROSSMINT_API_KEY` - API key from Crossmint dashboard
- [ ] `CROSSMINT_BASE_URL` - API endpoint URL
- [ ] `CROSSMINT_ADMIN_SOLANA_ADDRESS` - Your Solana admin public address
- [ ] `CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY` - Your Solana admin private key (base58)
- [ ] `MAIN_WALLET_SOLANA_ADDRESS` - Your main wallet to receive transfers
- [ ] `OFFRAMP_FLAT_FEE_USD` - Fee amount (e.g., 0.75)
- [ ] `OFFRAMP_SPREAD_NGN` - Spread amount (e.g., 60)

Optional but recommended:

- [ ] `DEBUG_TRANSFERS=true` - Show detailed errors
- [ ] `NODE_ENV=development` - Enable development mode

---

## Getting Help

If you're still stuck after trying these solutions:

1. **Check logs** - Look for the actual error in application logs
2. **Run diagnostic** - `npx ts-node scripts/check-crossmint-config.ts`
3. **Test manually** - Use curl to test Crossmint API directly
4. **Contact Crossmint** - support@crossmint.com with transaction ID
5. **Check documentation** - https://docs.crossmint.com

---

## Prevention

To avoid transfer failures:

1. ✅ Always validate environment variables on startup
2. ✅ Test transfers in staging before production
3. ✅ Monitor Crossmint API status
4. ✅ Implement proper error handling and retries
5. ✅ Keep detailed logs of all transfers
6. ✅ Set up alerts for failed transfers
7. ✅ Regularly verify admin wallet balances (for gas fees)

---

## Next Steps

After fixing the issue:

1. Test with a small amount first (e.g., 1 USDC)
2. Verify the transfer appears in Crossmint dashboard
3. Check that funds arrive in your main wallet
4. Monitor logs for any warnings
5. Test the complete offramp flow end-to-end
