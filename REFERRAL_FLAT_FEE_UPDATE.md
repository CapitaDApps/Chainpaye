# Referral System Update: Flat Fee Implementation

## Summary
Updated the referral earnings system from a percentage-based model to a flat fee model.

## Changes Made

### Previous System
- Referrer earned 25% of 1.5% transaction fee
- Earnings = Transaction Amount × 0.015 × 0.25
- Variable earnings based on transaction size

### New System
- Referrer earns flat $0.25 USD per offramp transaction
- Earnings = $0.25 (constant)
- Fixed earnings regardless of transaction size

## Modified Files

### 1. services/EarningsService.ts
- **Removed**: `calculateFee()` method (no longer needed)
- **Removed**: `calculateReferrerEarnings(fee: number)` method
- **Added**: `getReferrerEarnings()` method - returns flat $0.25
- **Added**: `FLAT_REFERRAL_EARNINGS_USD` constant = 0.25
- **Updated**: `processTransactionEarnings()` to use flat fee
  - Now credits exactly $0.25 per transaction
  - `feeAmount` in EarningsTransaction now equals earnings (both $0.25)

### 2. models/EarningsTransaction.ts
- **Updated**: `feeAmount` field description
  - Old: "Original transaction fee (1.5% of transaction amount)"
  - New: "Flat referral earnings amount ($0.25 USD per transaction)"

### 3. services/EarningsService.test.ts
- **Removed**: Tests for `calculateFee()` method
- **Removed**: Tests for `calculateReferrerEarnings()` method
- **Added**: Tests for `getReferrerEarnings()` method
- **Updated**: All property-based tests to verify flat $0.25 earnings
  - Property 9: Verifies earnings are always $0.25
  - Property 11: Verifies balance increases by $0.25 per transaction
  - Property 14: Verifies flat earnings precision
- **Updated**: Integration test expectations to use $0.25 flat fee

## Integration Points

### Transaction Flow
The referral earnings are processed in:
1. `services/crypto-off-ramp/TransactionManager.ts` - Calls `handleOfframpTransaction` after successful offramp
2. `webhooks/controllers/referral.controller.ts` - Handles the webhook and calls `processTransactionEarnings`
3. `services/EarningsService.ts` - Credits $0.25 to referrer's points balance

### No Changes Required
- `services/crypto-off-ramp/TransactionManager.ts` - No changes needed (already passes transaction data)
- `webhooks/controllers/referral.controller.ts` - No changes needed (interface unchanged)

## Testing
All tests updated to reflect the new flat fee model:
- Unit tests verify `getReferrerEarnings()` returns 0.25
- Property-based tests verify earnings are always $0.25 regardless of transaction amount
- Integration tests verify balance increases by exactly $0.25 per transaction

## Backward Compatibility
- Existing `EarningsTransaction` records remain valid
- The `feeAmount` field now represents the flat $0.25 instead of calculated percentage
- Historical data interpretation may need adjustment for analytics

## Deployment Notes
- No database migrations required
- No environment variable changes needed
- Existing referral relationships continue to work
- 30-day earning period remains unchanged
