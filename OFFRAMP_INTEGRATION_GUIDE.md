# 🚀 Crypto Off-ramp Integration Guide

## Overview

This guide covers the complete integration of the new crypto off-ramp flow that converts user crypto to NGN using **Crossmint** for wallet management and **DexPay** for off-ramping.

## 🔄 Complete Flow

### 1️⃣ **Off-Ramp Trigger**
**Command:** `offramp`

**Actions:**
- ✅ Verify user account exists
- ✅ Check KYC verification status (required)
- ✅ Fetch and display existing wallets with balances
- ✅ Show supported assets and chains
- ✅ Prompt for asset selection

### 2️⃣ **Asset Selection**
**User Input:** `"USDC on Solana"`, `"USDT BEP20"`, etc.

**Actions:**
- ✅ Parse asset and chain from user message
- ✅ Validate asset/chain combination
- ✅ Get or create wallet for selected chain
- ✅ Display wallet address and current balance
- ✅ Provide deposit instructions

### 3️⃣ **Wallet Management (Crossmint)**
**Automatic Process:**

**If wallet exists:**
- ✅ Display existing wallet address
- ✅ Show current balance

**If wallet doesn't exist:**
- ✅ Create new smart wallet via Crossmint API
- ✅ Configure with admin signer
- ✅ Return wallet address for deposits

### 4️⃣ **Spend Crypto Flow**
**Command:** `spend crypto` or "Spend Crypto" button

**Actions:**
- ✅ Verify active off-ramp session
- ✅ Check selected asset and chain
- ✅ Prompt for NGN withdrawal amount

### 5️⃣ **Amount Input**
**User Input:** NGN amount (e.g., `50000`)

**Validation:**
- ✅ Minimum: ₦1,000
- ✅ Maximum: ₦5,000,000
- ✅ Numeric format validation

### 6️⃣ **Bank Selection**
**Actions:**
- ✅ Fetch banks from DexPay API
- ✅ Display top 10 banks
- ✅ Accept bank number or name selection

### 7️⃣ **Account Resolution**
**User Input:** 10-digit account number

**Actions:**
- ✅ Validate account number format
- ✅ Resolve account via DexPay API
- ✅ Display resolved account details
- ✅ Request confirmation

### 8️⃣ **Quote Generation**
**Actions:**
- ✅ Generate quote via DexPay API
- ✅ Calculate platform fees (1.5%) and DexPay fees ($0.20)
- ✅ Check user's crypto balance
- ✅ Display comprehensive quote breakdown
- ✅ Handle insufficient balance scenarios

### 9️⃣ **Transaction Confirmation**
**User Input:** `proceed` or `cancel`

**Actions:**
- ✅ Display final transaction summary
- ✅ Request 4-digit PIN for confirmation

### 🔟 **Transaction Execution**
**User Input:** 4-digit PIN

**Actions:**
- ✅ Verify PIN against user account
- ✅ Calculate total crypto amount (quote amount + all fees)
- ✅ Transfer total crypto amount from user wallet to ChainPaye DexPay address
- ✅ Complete off-ramp via single DexPay API call (validates quote and processes payment)
- ✅ Send success confirmation with fee breakdown
- ✅ Send detailed success notification
- ✅ Clean up session data

**Fee Handling:**
- ✅ Platform fees (1.5%) and DexPay fees ($0.20) are calculated
- ✅ All fees are converted to crypto and included in the transfer
- ✅ User receives the exact NGN amount requested
- ✅ ChainPaye receives crypto equivalent of NGN amount + all fees

## 📲 **Notification System**

### **Deposit Notifications**
**Trigger:** When crypto is deposited to user's off-ramp wallet
**Webhook:** `POST /webhooks/deposit-notification` (Crossmint integration)

**Enhanced Notification Features:**
- ✅ Immediate notification with deposit details
- ✅ Nigerian timezone timestamp
- ✅ Clear call-to-action to start off-ramp
- ✅ User-friendly chain names (BEP20, Solana, etc.)
- ✅ Tips and guidance for next steps

**Sample Deposit Notification:**
```
🎉 Crypto Deposit Received!

💰 Amount: 100.50 USDC
🔗 Network: SOLANA  
⏰ Time: 26/01/2026, 14:30:25

✅ Your deposit has been confirmed and is ready to use!

🚀 Ready to convert to NGN?
Type *spend crypto* to start your off-ramp transaction.

💡 Tip: You can convert your crypto to NGN and receive it directly in your bank account within minutes!
```

### **Success Notifications**
**Trigger:** After successful off-ramp completion
**Timing:** Sent immediately after transaction completion

**Success Notification Features:**
- ✅ Detailed transaction summary
- ✅ Fee breakdown display
- ✅ Bank account confirmation
- ✅ Transaction reference ID
- ✅ Expected arrival time
- ✅ Call-to-action for next steps

**Sample Success Notification:**
```
🎉 Off-ramp Completed Successfully!

✅ Transaction Status: Completed
💰 Amount: ₦100,000.00
🪙 Crypto Used: 125.00 USDC
🏦 Bank: First Bank Nigeria
👤 Account: John Doe
📋 Reference: quote_abc123
⏰ Completed: 26/01/2026, 14:35:12

💳 Your NGN has been sent to your bank account.
⏱️ Expected arrival: 5-10 minutes

📧 A confirmation email has been sent to you.

🙏 Thank you for using ChainPaye!

Type *menu* to return to the main menu or *offramp* for another transaction.
```

### **Webhook Configuration**

**Crossmint Webhook Setup:**
```
URL: https://your-domain.com/webhooks/deposit-notification
Events: wallet.deposit
Method: POST
```

**Webhook Payload Format:**
```json
{
  "type": "wallet.deposit",
  "data": {
    "walletId": "wallet_123",
    "owner": "userId:user-123",
    "address": "Dbt7NnCK15bqJMESTw462wup3s1FVh7jyaDGV26x58iH",
    "chainType": "solana",
    "transaction": {
      "hash": "5J7XqWqJxvKx8yGz9QqJxvKx8yGz9QqJxvKx8yGz9Qq",
      "amount": "50.25",
      "token": "usdc",
      "from": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "to": "Dbt7NnCK15bqJMESTw462wup3s1FVh7jyaDGV26x58iH",
      "timestamp": "2026-01-26T13:30:25.000Z"
    }
  }
}
```

**Test Endpoint:**
```bash
# Test deposit notification
curl -X POST http://localhost:3000/webhooks/test-deposit-notification \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+2348106535142",
    "asset": "usdc", 
    "amount": "100.50",
    "chain": "solana"
  }'
```

## 🛠️ Technical Implementation

### **Services Created**

#### **1. CrossmintService (`services/CrossmintService.ts`)**
```typescript
// Key methods:
- listWallets(userId): Get all user wallets
- createWallet(userId, chainType): Create new wallet
- getWalletBalances(userId, chain, tokens): Get balances for specific chain
- getBalancesByChain(userId, chain, tokens): Get balances by chain name
- getSolanaBalances(userId): Legacy method for Solana balances
- getEvmBalances(userId): Legacy method for EVM balances
- transferTokens(userId, chainType, token, amount, toAddress): Transfer tokens using wallet address
- getOrCreateWallet(): Get existing or create new wallet
```

**New Balance Endpoint Format:**
```
GET /wallets/userId:{userId}:{chain}/balances?tokens={usdc,usdt}
```

**New Transfer Endpoint Format:**
```
POST /wallets/{walletAddress}/tokens/{chain}:{token}/transfers
Body: { "amount": "1.5", "recipient": "0x..." }
```

**Examples:**
- Base USDC: `/wallets/0xABC.../tokens/base-sepolia:usdc/transfers`
- Solana USDC: `/wallets/ABC.../tokens/solana:usdc/transfers`
- BSC USDT: `/wallets/0xDEF.../tokens/bsc:usdt/transfers`

**Chain Mapping:**
```typescript
// For balance queries
const chainMappings = {
  solana: "solana",
  bep20: "bsc",
  arbitrium: "arbitrum", 
  base: "base",
  hedera: "hedera",
  apechain: "apechain",
  lisk: "lisk"
};

// For token transfers
const tokenChainMapping = {
  solana: "solana",
  bsc: "bsc",
  arbitrum: "arbitrum",
  base: "base-sepolia", // Using testnet
  hedera: "hedera",
  apechain: "apechain",
  lisk: "lisk"
};
```

#### **2. DexPayService (`services/DexPayService.ts`)**
```typescript
// Key methods:
- getBanks(): Fetch supported Nigerian banks
- resolveAccount(): Verify bank account details
- getQuote(): Generate conversion quote
- completeOfframp(): Complete off-ramp transaction (validates and processes)
- validateQuote(): Legacy method (calls completeOfframp)
- calculateFees(): Calculate platform and DexPay fees
- getReceivingAddress(): Get ChainPaye wallet address for chain
```

**Simplified Off-ramp Process:**
1. Generate quote with DexPay
2. Transfer crypto + all fees to ChainPaye DexPay wallet
3. Complete off-ramp with single API call (validates quote and processes payment)

**Key Changes:**
- ❌ Removed `/quote/{quoteId}/pay` endpoint
- ✅ `/quote/{quoteId}` now completes the entire off-ramp
- ✅ All fees included in crypto transfer to DexPay address

#### **3. OfframpHandler (`commands/handlers/offrampHandler.ts`)**
```typescript
// Key functions:
- handleOfframp(): Main entry point
- handleAssetSelection(): Process asset/chain selection
- handleSpendCrypto(): Start spend crypto flow
- handleAmountInput(): Process NGN amount
- handleBankSelection(): Process bank selection
- handleAccountResolution(): Verify account details
- handleTransactionConfirmation(): Confirm transaction
- handlePinVerification(): Verify PIN and execute
```

### **Session Management**
```typescript
interface OfframpSession {
  step: 'ASSET_SELECTION' | 'DEPOSIT_WAITING' | 'AMOUNT_INPUT' | 
        'BANK_SELECTION' | 'ACCOUNT_RESOLUTION' | 'QUOTE_GENERATION' | 
        'CONFIRMATION' | 'PIN_VERIFICATION';
  userId: string;
  phoneNumber: string;
  selectedAsset?: string;
  selectedChain?: string;
  walletAddress?: string;
  ngnAmount?: number;
  selectedBank?: any;
  accountNumber?: string;
  resolvedAccount?: any;
  quote?: any;
  createdAt: number;
}
```

## 🔧 Configuration

### **Environment Variables**
```env
# Crossmint Configuration
CROSSMINT_API_KEY=sk_staging_...
CROSSMINT_BASE_URL=https://staging.crossmint.com/api/2025-06-09
CROSSMINT_ADMIN_SIGNER_ADDRESS=0x1234567890123456789012345678901234567890

# DexPay Configuration  
DEXPAY_API_KEY=DP_API_...
DEXPAY_API_SECRET=DP_SEC_...
DEXPAY_BASE_URL=https://sandbox-b2b.dexpay.io

# Off-ramp Configuration
OFFRAMP_FEE_PERCENTAGE=1.5
DEXPAY_FIXED_FEE_USD=0.20
```

### **ChainPaye DexPay Receiving Wallets**
The system automatically uses the correct ChainPaye wallet address based on the selected chain:

```typescript
// Configured in DexPayService
const chainPayeWallets = {
  solana: "Dbt7NnCK15bqJMESTw462wup3s1FVh7jyaDGV26x58iH",
  bep20: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
  arbitrium: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC", 
  base: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
  hedera: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
  apechain: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC",
  lisk: "0x9F91e934e3F2792a43Ca1Cd3f5DE7a798b4ce4fC"
};
```

### **Supported Assets & Chains**
```typescript
const SUPPORTED_COMBINATIONS = {
  USDC: ['bep20', 'base', 'arbitrium', 'solana', 'hedera', 'apechain', 'lisk'],
  USDT: ['bep20', 'arbitrium', 'solana', 'hedera', 'apechain', 'lisk']
};
```

## 🧪 Testing

### **1. Environment Test**
```bash
node scripts/test-offramp.js
```

### **2. Manual Testing Flow**
```
1. Send: "offramp"
2. Send: "USDC on Solana"
3. Send: "spend crypto"
4. Send: "50000"
5. Send: "1" (select bank)
6. Send: "1234567890" (account number)
7. Send: "yes" (confirm account)
8. Send: "proceed" (confirm transaction)
9. Send: "1234" (PIN)
```

### **3. API Testing**
```bash
# Test Crossmint
curl -H "X-API-KEY: $CROSSMINT_API_KEY" \
     "$CROSSMINT_BASE_URL/wallets?owner=userId:test-user"

# Test DexPay
curl -H "X-API-KEY: $DEXPAY_API_KEY" \
     -H "X-API-SECRET: $DEXPAY_API_SECRET" \
     "$DEXPAY_BASE_URL/banks"
```

## 🔒 Security Features

### **1. User Verification**
- ✅ Account existence check
- ✅ KYC verification requirement
- ✅ PIN verification for transactions

### **2. Session Management**
- ✅ 30-minute session timeout
- ✅ Step-by-step validation
- ✅ Session cleanup after completion

### **3. Transaction Security**
- ✅ Quote expiration validation
- ✅ Balance verification before transfer
- ✅ Secure PIN hashing with Argon2

### **4. Error Handling**
- ✅ Comprehensive error messages
- ✅ Graceful API failure handling
- ✅ User-friendly error recovery

## 💰 Fee Structure

### **Platform Fees**
- **Platform Fee:** 1.5% of NGN amount
- **DexPay Fee:** $0.20 (converted to NGN)
- **Network Fees:** Handled by Crossmint

### **Example Calculation**
```
NGN Amount: ₦100,000
Platform Fee (1.5%): ₦1,500
DexPay Fee ($0.20 @ ₦800/$): ₦160
Total Fees: ₦1,660
User Receives: ₦100,000
Total Deducted: ₦101,660 worth of crypto
```

## 🚨 Error Scenarios & Handling

### **1. Insufficient Balance**
```
❌ Insufficient Balance

You need 0.025000 more USDC.

Please:
1. Deposit more USDC to your wallet
2. Or reduce the withdrawal amount

Type a lower amount to try again:
```

### **2. Quote Expiration**
```
❌ Quote Expired

Quote has expired. Please request a new quote.

Please start a new off-ramp transaction.

Type *offramp* to begin again.
```

### **3. Account Not Found**
```
❌ Account Resolution Failed

Account not found. Please check the account number and try again.

Please enter a different account number:
```

### **4. API Failures**
- Crossmint API down → Graceful error message
- DexPay API down → Retry mechanism
- Network issues → User-friendly error messages

## 📊 Monitoring & Analytics

### **Key Metrics to Track**
- Off-ramp completion rate
- Average transaction amount
- Most popular asset/chain combinations
- Error rates by step
- API response times

### **Logging Points**
```typescript
// Key events to log:
- Off-ramp session started
- Wallet created/retrieved
- Quote generated
- Transaction confirmed
- Payment executed
- Errors at each step
```

## 🔄 Integration with Existing System

### **Command Routing Updates**
- ✅ Added off-ramp session detection
- ✅ Integrated with existing PIN verification
- ✅ Compatible with KYC verification flow

### **User Model Integration**
- ✅ Uses existing user verification status
- ✅ Leverages existing PIN system
- ✅ Maintains session state in Redis

## 🚀 Deployment Checklist

### **Pre-deployment**
- [ ] Configure all environment variables
- [ ] Test Crossmint API connectivity
- [ ] Test DexPay API connectivity
- [ ] Verify supported asset/chain combinations
- [ ] Test complete flow in staging

### **Post-deployment**
- [ ] Monitor error rates
- [ ] Track completion rates
- [ ] Monitor API response times
- [ ] Collect user feedback
- [ ] Optimize based on usage patterns

## 📞 Support & Troubleshooting

### **Common Issues**
1. **Wallet creation fails** → Check Crossmint API key and admin signer
2. **Bank list empty** → Verify DexPay credentials
3. **Quote generation fails** → Check asset/chain support
4. **Transfer fails** → Verify wallet balance and network fees

### **Debug Commands**
```bash
# Check environment
node scripts/test-offramp.js

# Monitor Redis sessions
redis-cli KEYS "offramp_session:*"

# Check logs
tail -f logs/app.log | grep -i offramp
```

The crypto off-ramp integration is now complete and ready for testing! 🎉