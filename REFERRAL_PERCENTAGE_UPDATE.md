# Referral System Update: Percentage-Based Earnings

## Summary
Updated the referral earnings system from a flat fee model to a percentage-based model where referrers earn 1% of the offramp transaction volume.

## Changes Made

### Previous System (Flat Fee)
- Referrer earned flat $0.25 USD per transaction
- Earnings = $0.25 (constant)
- Fixed earnings regardless of transaction size

### New System (Percentage-Based)
- Referrer earns 1% of offramp transaction volume (USD)
- Earnings = Transaction Volume (USD) × 0.01
- Variable earnings based on transaction size
- Examples:
  - $1 offramp → $0.01 earnings
  - $10 offramp → $0.10 earnings
  - $100 offramp → $1.00 earnings
  - $1,000 offramp → $10.00 earnings

### Withdrawal Rules Updated
- Minimum withdrawal: $20 (changed from $100)
- Maximum withdrawal: Unlimited (no cap)
- Frequency: Once per 7 days (unchanged)
- Approval delay: 24 hours (unchanged)

## Modified Files

### 1. services/EarningsService.ts
**Changes:**
- Removed `FLAT_REFERRAL_EARNINGS_USD` constant
- Changed `getReferrerEarnings()` to `calculateReferrerEarnings(sellAmountUsd: number)`
- Added `REFERRAL_PERCENTAGE` constant = 0.01 (1%)
- Updated `processTransactionEarnings()` to calculate 1% of transaction volume
- Updated `OfframpTransaction` interface to include `sellAmountUsd` field

**Key Method:**
```typescript
calculateReferrerEarnings(sellAmountUsd: number): number {
  return sellAmountUsd * 0.01; // 1% of USD volume
}
```

### 2. services/WithdrawalService.ts
**Changes:**
- Updated minimum withdrawal from $100 to $20
- Updated validation error messages
- Updated documentation comments

**Before:**
```typescript
if (amount < 100) {
  return {
    canWithdraw: false,
    reason: `Minimum withdrawal amount is $100...`,
  };
}
```

**After:**
```typescript
if (amount < 20) {
  return {
    canWithdraw: false,
    reason: `Minimum withdrawal amount is $20...`,
  };
}
```

### 3. commands/handlers/referralHandler.ts
**Changes:**
- Updated dashboard message to reflect 1% earnings
- Changed minimum withdrawal message to $20
- Updated example withdrawal amount to $50

**Dashboard Message:**
```
• Earn 1% of offramp transaction volume from referrals
• Minimum withdrawal: $20
Example: withdraw 50
```

### 4. models/EarningsTransaction.ts
**Changes:**
- Updated `feeAmount` field description
- Old: "Flat referral earnings amount ($0.25 USD per transaction)"
- New: "Referral earnings amount (1% of offramp transaction volume in USD)"

### 5. services/crypto-off-ramp/TransactionManager.ts
**Changes:**
- Added calculation of `sellAmountUsd` from transaction data
- Passes `sellAmountUsd` to `handleOfframpTransaction`

**Calculation:**
```typescript
const sellAmountUsd = transaction.fiatAmount / transaction.exchangeRate;
```

**Note:** The `fiatAmount` is in NGN, and `exchangeRate` converts NGN to USD. The spread (60 NGN) is already included in the exchange rate.

### 6. services/EarningsService.test.ts
**Changes:**
- Removed flat fee tests
- Added percentage calculation tests
- Updated all property-based tests to verify 1% calculation
- Updated mock transaction objects to include `sellAmountUsd`

**Test Examples:**
```typescript
// Unit test
expect(earningsService.calculateReferrerEarnings(100)).toBe(1);
expect(earningsService.calculateReferrerEarnings(1000)).toBe(10);

// Property-based test
const earnings = earningsService.calculateReferrerEarnings(sellAmountUsd);
expect(earnings).toBeCloseTo(sellAmountUsd * 0.01, 10);
```

## Transaction Flow

### Offramp Transaction Completion
```
1. User completes offramp transaction
   ↓
2. TransactionManager marks transaction as COMPLETED
   ↓
3. Calculate sellAmountUsd = fiatAmount / exchangeRate
   ↓
4. Call handleOfframpTransaction with sellAmountUsd
   ↓
5. EarningsService.processTransactionEarnings()
   ↓
6. Check if user has referral relationship
   ↓
7. Check if within 30-day earning period
   ↓
8. Calculate earnings = sellAmountUsd * 0.01
   ↓
9. Credit earnings to referrer's PointsBalance
   ↓
10. Log transaction in EarningsTransaction
```

## Data Flow

### sellAmountUsd Calculation
The `sellAmountUsd` represents the USD value of the crypto being sold, with the 60 NGN spread already included:

1. **In WhatsApp Flow** (cryptoTopUp.service.ts):
   - User enters NGN amount they want to receive
   - System calculates USD equivalent using spread rate
   - `sellAmountUsd = ngnAmount / spreadRate`
   - Spread rate includes the 60 NGN spread

2. **In TransactionManager** (crypto-off-ramp/TransactionManager.ts):
   - Transaction has `fiatAmount` (NGN) and `exchangeRate`
   - `sellAmountUsd = fiatAmount / exchangeRate`
   - This gives the USD value with spread included

3. **In EarningsService**:
   - Receives `sellAmountUsd` from transaction
   - Calculates earnings: `sellAmountUsd * 0.01`
   - Credits 1% to referrer

## Business Rules

### Earnings Calculation
- **Formula**: Earnings = Transaction Volume (USD) × 1%
- **Timing**: Only for transactions within 30 days of referral relationship
- **Precision**: Maintains full decimal precision (no rounding during calculation)
- **Minimum**: No minimum transaction amount for earnings
- **Maximum**: No maximum earnings per transaction

### Withdrawal Rules
- **Minimum**: $20 (lowered from $100 to make it more accessible)
- **Maximum**: Unlimited (no cap on withdrawal amount)
- **Frequency**: Once per 7 days
- **Approval Delay**: 24 hours (security measure)
- **Balance Check**: Must have sufficient balance

### Unchanged Rules
- ✅ 30-day earning period (unchanged)
- ✅ Immutable referral relationships (unchanged)
- ✅ Self-referral prevention (unchanged)
- ✅ One referral per user (unchanged)
- ✅ Atomic transactions (unchanged)
- ✅ Audit trail (unchanged)

## Examples

### Earnings Scenarios

#### Small Transaction
- User offramps $5 USD worth of crypto
- Referrer earns: $5 × 0.01 = $0.05

#### Medium Transaction
- User offramps $50 USD worth of crypto
- Referrer earns: $50 × 0.01 = $0.50

#### Large Transaction
- User offramps $500 USD worth of crypto
- Referrer earns: $500 × 0.01 = $5.00

#### Very Large Transaction
- User offramps $5,000 USD worth of crypto
- Referrer earns: $5,000 × 0.01 = $50.00

### Withdrawal Scenarios

#### Minimum Withdrawal
- Referrer has $20.00 balance
- Can withdraw: $20.00 (minimum met)

#### Partial Withdrawal
- Referrer has $100.00 balance
- Can withdraw: Any amount from $20 to $100

#### Large Withdrawal
- Referrer has $1,000.00 balance
- Can withdraw: Any amount from $20 to $1,000 (no maximum)

## Testing

### Unit Tests
- ✅ 1% calculation accuracy
- ✅ Zero amount handling
- ✅ Decimal precision
- ✅ Various transaction amounts ($1, $10, $100, $1000)

### Property-Based Tests
- ✅ Earnings always exactly 1% of volume
- ✅ Earnings credited within 30-day period
- ✅ No earnings after 30-day period
- ✅ Decimal precision maintained
- ✅ Relationship persistence

### Integration Tests
- ✅ End-to-end offramp transaction flow
- ✅ Earnings calculation and crediting
- ✅ Withdrawal validation
- ✅ Balance updates

## Migration Notes

### Existing Data
- No database migration required
- Existing `EarningsTransaction` records remain valid
- Historical data interpretation:
  - Old records: `feeAmount` = $0.25 (flat fee)
  - New records: `feeAmount` = 1% of transaction volume
  - Can differentiate by timestamp or transaction amount

### Backward Compatibility
- ✅ Existing referral relationships continue to work
- ✅ Existing points balances remain valid
- ✅ Withdrawal requests in progress unaffected
- ✅ 30-day earning period calculation unchanged

## Deployment Checklist

- [ ] Deploy code changes
- [ ] Verify earnings calculation in staging
- [ ] Test withdrawal with new $20 minimum
- [ ] Monitor first few transactions for correct earnings
- [ ] Update user-facing documentation
- [ ] Update dashboard messages
- [ ] Notify users of new earning structure (optional)

## Monitoring

### Key Metrics to Watch
1. Average earnings per transaction
2. Total earnings distributed per day
3. Withdrawal request volume
4. Minimum withdrawal usage ($20-$100 range)
5. Large transaction earnings (>$1000 volume)

### Alerts
- Earnings calculation errors
- Withdrawal validation failures
- Balance inconsistencies
- Transaction processing failures

## Benefits of New System

### For Referrers
- ✅ Higher earnings potential on large transactions
- ✅ More transparent (1% is easy to calculate)
- ✅ Lower withdrawal minimum ($20 vs $100)
- ✅ Unlimited withdrawal maximum
- ✅ Scales with transaction volume

### For Platform
- ✅ Incentivizes referring high-volume users
- ✅ More predictable cost structure (1% of volume)
- ✅ Easier to explain to users
- ✅ Aligns referrer incentives with platform growth

### Comparison with Previous Models

#### Flat $0.25 Model
- Good for: Small transactions
- Bad for: Large transactions (referrer undercompensated)
- Example: $1000 transaction → $0.25 earnings (0.025%)

#### 1% Model (Current)
- Good for: All transaction sizes
- Scales proportionally with volume
- Example: $1000 transaction → $10 earnings (1%)

## Summary

The referral system has been successfully updated to a percentage-based model where referrers earn 1% of the offramp transaction volume. This provides:

- More transparent and predictable earnings
- Better alignment with transaction value
- Lower withdrawal minimum for accessibility
- Scalable earnings for high-volume referrers

All changes are backward compatible, and the system maintains its core features including the 30-day earning period, immutable relationships, and atomic transaction processing.
