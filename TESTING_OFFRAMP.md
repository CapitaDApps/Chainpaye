# 🧪 Off-ramp Testing Guide

## Quick Start Testing

### 1. **Environment Check**
```bash
node scripts/test-offramp.js
```

This will verify:
- ✅ All environment variables are configured
- ✅ DexPay API connectivity
- ⚠️ Crossmint API (may show errors for test users)

### 2. **Start Your Server**
```bash
npm run dev
```

### 3. **Test via WhatsApp**

#### **Complete Off-ramp Flow Test:**

1. **Start Off-ramp**
   ```
   Send: "offramp"
   ```
   Expected: Shows your wallets (if any) and supported assets

2. **Select Asset & Chain**
   ```
   Send: "USDC on Solana"
   ```
   Expected: Creates/shows wallet, displays deposit instructions

3. **Start Spend Flow**
   ```
   Send: "spend crypto"
   ```
   Expected: Asks for NGN amount

4. **Enter Amount**
   ```
   Send: "50000"
   ```
   Expected: Shows bank selection list

5. **Select Bank**
   ```
   Send: "1"
   ```
   Expected: Asks for account number

6. **Enter Account Number**
   ```
   Send: "1234567890"
   ```
   Expected: Resolves account, shows details

7. **Confirm Account**
   ```
   Send: "yes"
   ```
   Expected: Generates quote, shows fees and breakdown

8. **Proceed with Transaction**
   ```
   Send: "proceed"
   ```
   Expected: Asks for PIN

9. **Enter PIN**
   ```
   Send: "1234"
   ```
   Expected: Processes transaction (may fail in sandbox)

## Alternative Testing Methods

### **Test Individual Components**

#### **1. Test Asset Selection Only**
```
1. Send: "offramp"
2. Send: "USDC BEP20"
3. Check wallet creation/display
```

#### **2. Test Different Assets**
```
- "USDC on Solana"
- "USDT BEP20" 
- "USDC Base"
- "USDT Arbitrium"
```

#### **3. Test Error Scenarios**
```
- "BTC on Solana" (unsupported)
- "USDT on Base" (unsupported)
- Invalid amounts: "abc", "500" (below minimum)
```

### **Test Bank Integration**
```bash
# Test DexPay banks API directly
curl -H "X-API-KEY: $DEXPAY_API_KEY" \
     -H "X-API-SECRET: $DEXPAY_API_SECRET" \
     "$DEXPAY_BASE_URL/banks"
```

### **Test Account Resolution**
```bash
# Test account resolution
curl -X POST "$DEXPAY_BASE_URL/banks/resolve" \
     -H "X-API-KEY: $DEXPAY_API_KEY" \
     -H "X-API-SECRET: $DEXPAY_API_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"accountNumber":"1234567890","bankCode":"044"}'
```

## Expected Behaviors

### **✅ Success Scenarios**

1. **Valid Asset Selection**
   - Shows wallet address
   - Displays current balance
   - Provides deposit instructions

2. **Valid Amount Input**
   - Accepts amounts ≥ ₦1,000
   - Shows bank selection

3. **Valid Bank Selection**
   - Shows selected bank
   - Asks for account number

4. **Valid Account**
   - Resolves account details
   - Shows account name and bank

5. **Valid Quote**
   - Shows conversion rate
   - Displays fee breakdown
   - Checks balance sufficiency

### **❌ Error Scenarios**

1. **Unsupported Asset/Chain**
   ```
   ❌ Unsupported Combination
   USDT is not supported on Base.
   ```

2. **Invalid Amount**
   ```
   ❌ Minimum Amount
   Minimum withdrawal amount is ₦1,000.
   ```

3. **Invalid Account**
   ```
   ❌ Account Resolution Failed
   Account not found. Please check the account number.
   ```

4. **Insufficient Balance**
   ```
   ❌ Insufficient Balance
   You need 0.025000 more USDC.
   ```

5. **Expired Quote**
   ```
   ❌ Quote Expired
   Quote has expired. Please request a new quote.
   ```

## Debugging Tips

### **1. Check Logs**
```bash
# Monitor application logs
tail -f logs/app.log | grep -i offramp

# Check for errors
grep -i error logs/app.log | grep offramp
```

### **2. Check Redis Sessions**
```bash
# List active off-ramp sessions
redis-cli KEYS "offramp_session:*"

# View specific session
redis-cli GET "offramp_session:+2348106535142"
```

### **3. Check Environment Variables**
```bash
# Verify all required variables are set
node -e "
require('dotenv').config();
console.log('CROSSMINT_API_KEY:', !!process.env.CROSSMINT_API_KEY);
console.log('DEXPAY_API_KEY:', !!process.env.DEXPAY_API_KEY);
console.log('DEXPAY_API_SECRET:', !!process.env.DEXPAY_API_SECRET);
"
```

### **4. Test API Endpoints Directly**

#### **Crossmint Test**
```javascript
const axios = require('axios');
require('dotenv').config();

async function testCrossmint() {
  try {
    // Test list wallets
    const walletsResponse = await axios.get(
      `${process.env.CROSSMINT_BASE_URL}/wallets`,
      {
        headers: { 'X-API-KEY': process.env.CROSSMINT_API_KEY },
        params: { owner: 'userId:test-user' }
      }
    );
    console.log('Wallets OK:', walletsResponse.status);

    // Test balance endpoint
    const balanceResponse = await axios.get(
      `${process.env.CROSSMINT_BASE_URL}/wallets/userId:test-user:solana/balances`,
      {
        headers: { 'X-API-KEY': process.env.CROSSMINT_API_KEY },
        params: { tokens: 'usdc,usdt' }
      }
    );
    console.log('Balance OK:', balanceResponse.status);

    // Transfer endpoint format (example - don't actually call)
    console.log('Transfer endpoint format:');
    console.log('POST /wallets/{walletAddress}/tokens/{chain}:{token}/transfers');
    console.log('Examples:');
    console.log('• Base USDC: /wallets/0xABC.../tokens/base-sepolia:usdc/transfers');
    console.log('• Solana USDC: /wallets/ABC.../tokens/solana:usdc/transfers');
    
  } catch (error) {
    console.log('Crossmint Error:', error.response?.status, error.response?.data);
  }
}

testCrossmint();
```

#### **DexPay Test**
```javascript
const axios = require('axios');
require('dotenv').config();

async function testDexPay() {
  try {
    const response = await axios.get(
      `${process.env.DEXPAY_BASE_URL}/banks`,
      {
        headers: {
          'X-API-KEY': process.env.DEXPAY_API_KEY,
          'X-API-SECRET': process.env.DEXPAY_API_SECRET
        }
      }
    );
    console.log('DexPay OK:', response.data.length, 'banks');
  } catch (error) {
    console.log('DexPay Error:', error.response?.status, error.response?.data);
  }
}

testDexPay();
```

## Common Issues & Solutions

### **1. "Session Expired" Error**
- **Cause:** Off-ramp sessions expire after 30 minutes
- **Solution:** Start a new session with "offramp"

### **2. "Account Not Found" Error**
- **Cause:** Invalid account number or bank code
- **Solution:** Use valid Nigerian bank account numbers

### **3. "Insufficient Balance" Error**
- **Cause:** Not enough crypto in wallet
- **Solution:** Deposit crypto to the displayed wallet address

### **4. "Quote Expired" Error**
- **Cause:** Quotes expire after 10 minutes
- **Solution:** Start a new off-ramp transaction

### **5. API Connection Errors**
- **Cause:** Network issues or invalid credentials
- **Solution:** Check internet connection and API keys

## Production Testing Checklist

- [ ] Test with real crypto deposits
- [ ] Test with real bank accounts
- [ ] Test different asset/chain combinations
- [ ] Test error scenarios
- [ ] Test session timeouts
- [ ] Test concurrent users
- [ ] Monitor API rate limits
- [ ] Test fee calculations
- [ ] Test PIN verification
- [ ] Test transaction completion

## Sandbox Limitations

⚠️ **Note:** In sandbox mode:
- Crossmint may not create real wallets
- DexPay may not execute real payments
- Some API calls may return mock data
- Actual crypto transfers won't occur

For full testing, you'll need production API keys and real crypto deposits.