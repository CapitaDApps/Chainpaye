# Referral Dashboard WhatsApp Flow Implementation

## Overview
Interactive WhatsApp Flow for referral dashboard with withdrawal functionality.

## Flow Structure

### Screens
1. **REFERRAL_DASHBOARD** (Entry point, non-terminal)
   - Shows referral stats (code, balance, earnings, volume, fees)
   - Radio button selection for next action:
     - Share Referral
     - Request Withdrawal
     - View History
   - Backend routes based on user selection

2. **SHARE_REFERRAL** (Terminal)
   - Displays referral code and link
   - Shows earning instructions
   - Closes after viewing

3. **WITHDRAWAL_REQUEST** (Non-terminal)
   - Shows current balance and BNB wallet address
   - Conditional display:
     - If eligible: Shows amount input form
     - If insufficient balance: Shows error message
     - If withdrawal limit reached: Shows wait time
   - Sends data to backend via `data_exchange`
   - Backend validates and routes to confirmation

4. **WITHDRAWAL_CONFIRMATION** (Terminal)
   - Shows withdrawal request details
   - Status: "Under Review"
   - Processing time: 24-48 hours
   - Displays new balance and next withdrawal date
   - Closes after viewing

5. **WITHDRAWAL_HISTORY** (Terminal)
   - Shows list of past withdrawals with status
   - Displays formatted history text
   - Closes after viewing

### Routing Model
```
REFERRAL_DASHBOARD → [SHARE_REFERRAL, WITHDRAWAL_REQUEST, WITHDRAWAL_HISTORY]
WITHDRAWAL_REQUEST → [WITHDRAWAL_CONFIRMATION]
SHARE_REFERRAL → []
WITHDRAWAL_CONFIRMATION → []
WITHDRAWAL_HISTORY → []
```

## Data Requirements

### Backend Must Format as Strings
All monetary values must be pre-formatted with 2 decimal places:
- `currentBalance: "125.50"` (not number)
- `totalEarned: "450.75"`
- `totalVolume: "12500.00"`
- `totalFees: "125.00"`
- `minWithdrawal: "20.00"`
- `withdrawalAmount: "50.00"`

### REFERRAL_DASHBOARD Data
```typescript
{
  referralCode: string;        // "ABC123"
  referralLink: string;        // "wa.me/..."
  currentBalance: string;      // "125.50"
  totalEarned: string;         // "450.75"
  totalReferred: number;       // 15
  totalVolume: string;         // "12500.00"
  totalFees: string;          // "125.00"
}
```

### WITHDRAWAL_REQUEST Data
```typescript
{
  currentBalance: string;           // "125.50"
  bnbWalletAddress: string;        // "0x1234...5678"
  canWithdraw: boolean;            // true/false
  has_error: boolean;              // true/false
  error_message: string;           // Error text
  insufficientBalance: boolean;    // true/false
  withdrawalLimitReached: boolean; // true/false
  minWithdrawal: string;          // "20.00"
  lastWithdrawalDate: string;     // "Jan 15, 2024"
  daysRemaining: string;          // "3"
}
```

### WITHDRAWAL_CONFIRMATION Data
```typescript
{
  withdrawalAmount: string;     // "50.00"
  requestDate: string;          // "Jan 15, 2024"
  bnbWalletAddress: string;    // "0x1234...5678"
  newBalance: string;          // "75.50"
  nextWithdrawalDate: string;  // "Jan 22, 2024"
}
```

### WITHDRAWAL_HISTORY Data
```typescript
{
  historyText: string;    // Pre-formatted multi-line text
  hasWithdrawals: boolean; // true/false
}
```

## User Flow Examples

### Happy Path: Withdrawal
1. User types "referral"
2. Backend sends REFERRAL_DASHBOARD with data
3. User selects "Request Withdrawal"
4. Backend receives action="withdraw", sends WITHDRAWAL_REQUEST screen
5. User enters amount and clicks "Continue"
6. Backend validates, creates withdrawal, sends WITHDRAWAL_CONFIRMATION
7. Flow closes, user sees success message

### Insufficient Balance
1. User types "referral"
2. Backend sends REFERRAL_DASHBOARD
3. User selects "Request Withdrawal"
4. Backend sends WITHDRAWAL_REQUEST with canWithdraw=false, insufficientBalance=true
5. User sees error message, clicks "Continue"
6. Flow closes

### Share Referral
1. User types "referral"
2. Backend sends REFERRAL_DASHBOARD
3. User selects "Share Referral"
4. Backend sends SHARE_REFERRAL screen
5. User views code/link, clicks "Done"
6. Flow closes

## Validation Rules

### Withdrawal Eligibility
- Minimum balance: $20
- Maximum: Current balance
- Frequency: Once per 7 days
- Destination: User's BNB wallet
- Processing: 24-48 hours

### Data Formatting
- All monetary values as strings with 2 decimals
- Dates formatted as "Jan 15, 2024"
- No `.toFixed()` calls in flow JSON
- Pre-format all numbers in backend

## Next Steps
1. Create `webhooks/services/referralFlow.service.ts` with data formatting methods
2. Create `webhooks/controllers/referralFlow.controller.ts` for flow handling
3. Update `commands/route.ts` to send flow
4. Add flow response handlers in `webhooks/index.ts`
5. Upload flow JSON to WhatsApp and get Flow ID
6. Test end-to-end flow
