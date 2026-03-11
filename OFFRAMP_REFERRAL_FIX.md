# Offramp Referral Earnings Fix

## Issue
Referral points were not being added for the referrer after the referee completed an offramp transaction.

## Root Cause
The offramp transaction flow in `webhooks/services/cryptoTopUp.service.ts` was not calling the referral earnings processing after completing the transaction. While the `TransactionManager` class had referral earnings processing built-in, the actual offramp flow bypassed this manager and processed transactions directly.

## Solution
Added referral earnings processing to the `processOfframpInBackground` function in `webhooks/services/cryptoTopUp.service.ts`.

### Changes Made

**File**: `webhooks/services/cryptoTopUp.service.ts`

Added the following code after the success notification is sent:

```typescript
// Process referral earnings (if applicable)
try {
  const { handleOfframpTransaction } = await import("../controllers/referral.controller");
  
  // Calculate USD amount from NGN using the exchange rate
  const rateData = await dexPayService.getCurrentRates(
    normalizedAsset,
    dexPayChain,
    ngnAmount,
  );
  const exchangeRate = rateData.rate;
  const sellAmountUsd = ngnAmount / exchangeRate;
  
  await handleOfframpTransaction({
    id: quoteId,
    userId: userId,
    amount: totalInUsd,
    sellAmountUsd: sellAmountUsd,
    timestamp: new Date(),
  });
  logger.info(`[OFFRAMP-BG] Referral earnings processed for transaction ${quoteId}`);
} catch (referralError) {
  logger.error(
    `[OFFRAMP-BG] Warning: Failed to process referral earnings for transaction ${quoteId}: ${(referralError as Error).message}`,
  );
  // Don't fail the transaction if referral processing fails
}
```

## How It Works

1. After the offramp transaction completes successfully, the system now calls `handleOfframpTransaction` from the referral controller
2. The function calculates the USD amount from the NGN amount using the current exchange rate
3. It passes the transaction details to the `EarningsService.processTransactionEarnings` method
4. The earnings service:
   - Checks if the user has a referral relationship
   - Validates the relationship is within the 30-day earning period
   - Calculates earnings (1% of offramp volume)
   - Credits earnings to the referrer atomically using MongoDB transactions
   - Logs the earnings transaction for audit trail

## Earnings Calculation

- **Rate**: 1% of the USD value of the crypto being sold (with spread included)
- **Formula**: `earnings = sellAmountUsd * 0.01`
- **Example**: If a user sells crypto worth $100 USD, the referrer earns $1.00

## Error Handling

- If referral processing fails, it logs a warning but doesn't fail the main transaction
- This ensures that offramp transactions complete successfully even if there are issues with referral processing
- All errors are logged for debugging purposes

## Testing

All existing tests pass, including:
- Unit tests for earnings calculation
- Property-based tests for earnings accuracy
- Tests for referral period validation
- Tests for relationship persistence

## Verification

To verify the fix is working:

1. Create a referral relationship between two users
2. Have the referred user complete an offramp transaction
3. Check the referrer's points balance - it should increase by 1% of the transaction USD value
4. Check the logs for `[OFFRAMP-BG] Referral earnings processed for transaction`

## Related Files

- `webhooks/services/cryptoTopUp.service.ts` - Main fix location
- `webhooks/controllers/referral.controller.ts` - Referral webhook handler
- `services/EarningsService.ts` - Earnings calculation and processing
- `services/ReferralService.ts` - Referral relationship management
- `models/PointsBalance.ts` - Points balance storage
- `models/EarningsTransaction.ts` - Earnings audit trail
