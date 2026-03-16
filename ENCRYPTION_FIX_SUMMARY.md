# Referral Withdrawal Flow - Encryption Fix Summary

## 🐛 **Issue Identified**
The referral withdrawal flow was failing with the error:
```
Cannot read properties of undefined (reading 'amount')
```

**Root Cause**: The WhatsApp flow data was encrypted and the controller was trying to access `data.amount` directly without decrypting the request first.

## 🔧 **Fixes Applied**

### 1. **Updated Controller to Handle Encryption**
- **File**: `webhooks/controllers/referralWithdrawalFlow.controller.ts`
- **Changes**:
  - ✅ Added `flowMiddleware` import and usage
  - ✅ Updated controller to use `req.decryptedData.decryptedBody`
  - ✅ Added proper screen handling for `WITHDRAWAL_DETAILS` and `WITHDRAWAL_CONFIRMATION`
  - ✅ Added flow token validation using Redis
  - ✅ Improved error handling with proper flow responses
  - ✅ Added async message sending to avoid blocking flow response

### 2. **Updated Flow JSON Structure**
- **File**: `webhooks/referral_withdrawal_flow.json`
- **Changes**:
  - ✅ Added `screen` field to data exchange payload
  - ✅ Ensured proper data structure for controller processing
  - ✅ Added terminal screen configuration
  - ✅ Improved error handling structure

### 3. **Controller Architecture Changes**

#### **Before (Broken)**:
```typescript
export async function handleReferralWithdrawalFlow(req: Request, res: Response) {
  const { from, flow_token, data } = req.body; // ❌ Trying to access encrypted data directly
  const flowData = data as ReferralWithdrawalFlowData; // ❌ data is undefined
  // ... rest of code would fail
}
```

#### **After (Fixed)**:
```typescript
async function handleReferralWithdrawalFlowInternal(req: Request, res: Response) {
  const { decryptedBody } = req.decryptedData!; // ✅ Access decrypted data
  const flowData = decryptedBody as ReferralWithdrawalFlowData; // ✅ Proper data access
  // ... rest of code works correctly
}

export const handleReferralWithdrawalFlow = flowMiddleware(handleReferralWithdrawalFlowInternal);
```

## 🔄 **Flow Process Now**

1. **User submits flow** → WhatsApp sends encrypted data
2. **flowMiddleware** → Decrypts the request automatically
3. **Controller** → Accesses `req.decryptedData.decryptedBody`
4. **Processing** → Creates withdrawal request and sends confirmation
5. **Response** → Returns encrypted response to WhatsApp

## ✅ **Validation**

### **Flow JSON Structure**:
```json
{
  "version": "7.2",
  "screens": ["WITHDRAWAL_DETAILS", "WITHDRAWAL_CONFIRMATION"],
  "data_exchange": {
    "payload": {
      "amount": "${form.amount}",
      "screen": "WITHDRAWAL_DETAILS"
    }
  }
}
```

### **Controller Response Format**:
```typescript
return {
  screen: "WITHDRAWAL_CONFIRMATION",
  data: {
    amount: "50.00",
    evmAddress: "0x742d35...",
    chain: "Base",
    token: "USDT",
    status: "submitted"
  }
};
```

## 🚀 **Status**
- ✅ **Encryption handling**: Fixed
- ✅ **Flow JSON structure**: Updated
- ✅ **Controller logic**: Improved
- ✅ **Error handling**: Enhanced
- ✅ **Data validation**: Added

## 🧪 **Testing**
The flow should now properly:
1. Decrypt incoming WhatsApp flow data
2. Access the `amount` field correctly
3. Process withdrawal requests
4. Send encrypted responses back to WhatsApp
5. Handle errors gracefully

## 📋 **Next Steps**
1. Deploy the updated controller and flow JSON
2. Test the flow end-to-end with a real WhatsApp flow
3. Monitor logs for successful processing
4. Verify withdrawal requests are created in database

---

**Fix Applied**: March 16, 2026  
**Status**: ✅ Ready for testing