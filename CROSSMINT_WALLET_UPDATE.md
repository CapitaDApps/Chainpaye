# Crossmint Wallet Creation and Transaction Signing Update

## Summary
Updated Crossmint wallet creation and transaction signing to use `external-wallet` admin signers with chain-specific addresses instead of a single API key.

---

## Changes Made

### 1. Updated Wallet Creation Interface (`services/CrossmintService.ts`)

**Before:**
```typescript
config: {
  adminSigner: {
    type: "api-key",
    address: "single_admin_address"
  }
}
```

**After:**
```typescript
config: {
  adminSigner: {
    type: "external-wallet",
    address: "chain_specific_admin_address"
  }
}
```

### 2. Updated Transaction Signing

**Before:**
```typescript
const transferPayload = {
  amount,
  recipient: toAddress,
  transactionType: "direct",
  idempotencyKey: currentIdempotencyKey,
  metadata: { ... }
};
```

**After:**
```typescript
const transferPayload = {
  amount,
  recipient: toAddress,
  transactionType: "direct",
  idempotencyKey: currentIdempotencyKey,
  signer: {
    type: "external-wallet",
    address: adminAddress,  // Chain-specific address
  },
  metadata: { ... }
};
```

### 3. Added Chain-Specific Admin Address Logic

**New Method: `getAdminAddressForChain(chainType)`**

Returns the appropriate admin address based on chain type:

- **Solana** → `CROSSMINT_ADMIN_SOLANA_ADDRESS`
- **EVM chains** (BSC, Base, Arbitrum, ApeChain, Lisk) → `CROSSMINT_ADMIN_EVM_ADDRESS`
- **Other chains** → `CROSSMINT_ADMIN_SIGNER_ADDRESS` (fallback)

### 4. Updated Methods

**Wallet Creation:**
- `createWalletInternal()` - Uses external-wallet with chain-specific address

**Transaction Signing:**
- `transferTokensInternal()` - Uses external-wallet signer for transfers
- `executeTransferWithIdempotency()` - Uses external-wallet signer with retry logic

---

## Environment Variables

### New Variables (Required)

Add to your `.env` file:

```bash
# Crossmint Configuration
CROSSMINT_API_KEY=your_crossmint_api_key
CROSSMINT_BASE_URL=https://crossmint.com/api/2025-06-09
CROSSMINT_WEBHOOK_SECRET=your_crossmint_webhook_secret

# Crossmint Admin Signer Addresses (External Wallets)
CROSSMINT_ADMIN_SOLANA_ADDRESS=your_solana_admin_wallet_address
CROSSMINT_ADMIN_EVM_ADDRESS=your_evm_admin_wallet_address
CROSSMINT_ADMIN_SIGNER_ADDRESS=your_legacy_admin_address
```

### Variable Details

| Variable | Purpose | Example |
|----------|---------|---------|
| `CROSSMINT_ADMIN_SOLANA_ADDRESS` | Admin wallet for Solana chain | `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU` |
| `CROSSMINT_ADMIN_EVM_ADDRESS` | Admin wallet for EVM chains | `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb` |
| `CROSSMINT_ADMIN_SIGNER_ADDRESS` | Fallback for other chains | (legacy address) |

---

## API Request Format

### Solana Wallet Creation
```json
POST https://crossmint.com/api/2025-06-09/wallets
{
  "chainType": "solana",
  "type": "smart",
  "config": {
    "adminSigner": {
      "type": "external-wallet",
      "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
    }
  },
  "owner": "userId:user123"
}
```

### EVM Wallet Creation (BSC, Base, Arbitrum, etc.)
```json
POST https://crossmint.com/api/2025-06-09/wallets
{
  "chainType": "bsc",
  "type": "smart",
  "config": {
    "adminSigner": {
      "type": "external-wallet",
      "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
    }
  },
  "owner": "userId:user123"
}
```

### Solana Transaction Signing
```json
POST https://crossmint.com/api/2025-06-09/wallets/{walletAddress}/tokens/solana:usdc/transfers
{
  "amount": "10.5",
  "recipient": "Dbt7NnCK15bqJMESTw462wup3s1FVh7jyaDGV26x58iH",
  "transactionType": "direct",
  "signer": "external-wallet:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "idempotencyKey": "tx-12345-1234567890"
}
```

### EVM Transaction Signing (BSC, Base, Arbitrum, etc.)
```json
POST https://crossmint.com/api/2025-06-09/wallets/{walletAddress}/tokens/bsc:usdt/transfers
{
  "amount": "25.0",
  "recipient": "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
  "transactionType": "direct",
  "signer": "external-wallet:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "idempotencyKey": "tx-67890-1234567890"
}
```

---

## Chain Type Mapping

### Solana
- `solana` → Uses `CROSSMINT_ADMIN_SOLANA_ADDRESS`

### EVM Chains
All use `CROSSMINT_ADMIN_EVM_ADDRESS`:
- `evm` (generic EVM)
- `bsc` (Binance Smart Chain)
- `base` (Base)
- `arbitrum` (Arbitrum)
- `apechain` (ApeChain)
- `lisk` (Lisk)

### Other Chains
- `hedera` → Uses `CROSSMINT_ADMIN_SIGNER_ADDRESS` (fallback)
- Any other chain → Uses `CROSSMINT_ADMIN_SIGNER_ADDRESS` (fallback)

---

## Error Handling

If admin address is not configured for a chain:

```
Error: No admin address configured for chain type: solana. 
Please set CROSSMINT_ADMIN_SOLANA_ADDRESS for Solana or 
CROSSMINT_ADMIN_EVM_ADDRESS for EVM chains.
```

---

## Testing

### 1. Verify Environment Variables
```bash
# Check if variables are set
echo $CROSSMINT_ADMIN_SOLANA_ADDRESS
echo $CROSSMINT_ADMIN_EVM_ADDRESS
```

### 2. Test Wallet Creation

**Solana Wallet:**
```typescript
const solanaWallet = await crossmintService.createWallet(userId, "solana");
// Should use CROSSMINT_ADMIN_SOLANA_ADDRESS
```

**EVM Wallet:**
```typescript
const evmWallet = await crossmintService.createWallet(userId, "bsc");
// Should use CROSSMINT_ADMIN_EVM_ADDRESS
```

### 3. Test Transaction Signing

**Solana Transfer:**
```typescript
const transferRequest = {
  walletAddress: "user_solana_wallet_address",
  token: "solana:usdc",
  recipient: "Dbt7NnCK15bqJMESTw462wup3s1FVh7jyaDGV26x58iH",
  amount: "10.5",
  idempotencyKey: "tx-test-123"
};
const result = await crossmintService.transferTokens(transferRequest);
// Should use CROSSMINT_ADMIN_SOLANA_ADDRESS for signing
```

**EVM Transfer:**
```typescript
const transferRequest = {
  walletAddress: "user_bsc_wallet_address",
  token: "bsc:usdt",
  recipient: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
  amount: "25.0",
  idempotencyKey: "tx-test-456"
};
const result = await crossmintService.transferTokens(transferRequest);
// Should use CROSSMINT_ADMIN_EVM_ADDRESS for signing
```

### 4. Check Logs
Look for:
```
Creating solana wallet for user user123 with admin address: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
Created solana wallet for user user123: <new_wallet_address>
Executing transfer attempt 1/3: ... (with external-wallet signer)
Transfer executed successfully: ...
```

---

## Migration Steps

### 1. Get Admin Wallet Addresses
- Get your Solana admin wallet address
- Get your EVM admin wallet address

### 2. Update Environment Variables
Add to `.env`:
```bash
CROSSMINT_ADMIN_SOLANA_ADDRESS=your_solana_address
CROSSMINT_ADMIN_EVM_ADDRESS=your_evm_address
```

### 3. Deploy Changes
```bash
npm run build
pm2 restart all
```

### 4. Test Wallet Creation
- Create a test user
- Verify Solana wallet is created with correct admin
- Verify EVM wallet is created with correct admin

### 5. Monitor Logs
```bash
pm2 logs | grep "Creating.*wallet"
```

---

## Files Modified

1. **`services/CrossmintService.ts`**
   - Updated `CreateWalletRequest` interface to use `external-wallet` type
   - Added `getAdminAddressForChain()` method for chain-specific addresses
   - Added `adminSolanaAddress` and `adminEvmAddress` getters
   - Updated `createWalletInternal()` method to use external-wallet signers
   - Updated `transferTokensInternal()` method to use external-wallet signers
   - Updated `executeTransferWithIdempotency()` method to use external-wallet signers

2. **`.env.example`**
   - Added `CROSSMINT_API_KEY`
   - Added `CROSSMINT_BASE_URL`
   - Added `CROSSMINT_ADMIN_SOLANA_ADDRESS`
   - Added `CROSSMINT_ADMIN_EVM_ADDRESS`
   - Added `CROSSMINT_ADMIN_SIGNER_ADDRESS`

3. **`CROSSMINT_WALLET_UPDATE.md`**
   - Updated documentation to include transaction signing
   - Added API request examples for transfers
   - Added testing instructions for transaction signing

---

## Benefits

✅ **Chain-Specific Control**: Different admin wallets for different chains
✅ **Better Security**: Separate admin keys per chain type
✅ **Flexibility**: Easy to add new chain types
✅ **Clear Logging**: Shows which admin address is used for both wallet creation and transaction signing
✅ **Error Handling**: Validates admin addresses are configured before operations
✅ **Consistent Implementation**: Same external-wallet pattern for both wallet creation and transaction signing

---

## Rollback Plan

If issues occur, revert to previous version:

```bash
git revert HEAD
npm run build
pm2 restart all
```

Then use the old single admin address configuration.

---

**Updated:** March 11, 2026
**Status:** ✅ Ready for Testing

## Summary of Changes

This update modifies the Crossmint integration to use external wallet signers for both wallet creation and transaction signing. Previously, only wallet creation used external wallets. Now, all transaction signing operations also use chain-specific external wallet addresses.

### What Changed

1. **Wallet Creation** (already done): Uses external-wallet with chain-specific admin addresses
2. **Transaction Signing** (NEW): Now uses external-wallet signers with chain-specific admin addresses

### Methods Updated

- `createWalletInternal()` - Wallet creation with external-wallet (already done)
- `transferTokensInternal()` - Transaction signing with external-wallet (NEW)
- `executeTransferWithIdempotency()` - Transaction signing with retry logic and external-wallet (NEW)

### Key Implementation

Both transaction signing methods now:
1. Call `getAdminAddressForChain(chainType)` to get the appropriate admin address
2. Validate that the admin address is configured
3. Include a `signer` string in the API request in the format:
   ```typescript
   signer: `external-wallet:${adminAddress}`
   ```
   For example:
   - Solana: `"signer": "external-wallet:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"`
   - EVM: `"signer": "external-wallet:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"`
4. Log which admin address is being used for the operation

### Impact

- All Crossmint operations (wallet creation + transaction signing) now use external wallet signers
- Consistent security model across all Crossmint interactions
- Chain-specific admin addresses for both wallet management and transaction execution
