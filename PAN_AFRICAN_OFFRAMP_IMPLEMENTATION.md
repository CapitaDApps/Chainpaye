# Pan African Offramp Implementation

## Overview
This document describes the implementation of the Pan African offramp feature that allows users to spend their crypto (USDC/USDT) and receive fiat currency in Ghana Cedis (GHS) or Kenyan Shillings (KES) directly to their bank accounts.

## User Flow

### 1. Currency Selection
When a user types "spend crypto", they are presented with a currency selection screen:
- Nigerian Naira (NGN) - redirects to normal offramp flow
- Ghana Cedis (GHS) - Pan African offramp
- Kenyan Shillings (KES) - Pan African offramp

### 2. Transaction Details
User provides:
- Asset: USDC or USDT
- Amount: Minimum $15 USD
- Chain: BSC (BNB Smart Chain) or Base Network

### 3. Beneficiary Selection
User selects from their saved beneficiaries for the selected country (Ghana or Kenya).
The dropdown shows only the beneficiary names, and the system retrieves the payout ID.

### 4. Rate Quote
System fetches a rate quote from Linkio API:
```
GET https://api.linkio.world/transactions/v2/direct_ramp/rate_quote
Parameters:
- customer_id: User's Linkio customer ID
- asset: Selected asset (USDC/USDT)
- amount: Selected amount in USD
- trx_type: offramp
- payment_method: bank_transfer_gh (for GHS) or bank_transfer_kenya (for KES)
```

Response includes:
- quoteId: Quote identifier
- rate: Exchange rate
- payoutAmount: Amount user will receive in local currency
- validity: Quote validity period (typically 120 seconds)

### 5. Preview & Confirmation
User reviews:
- Amount to send (in USD)
- Exchange rate
- Amount to receive (in GHS/KES)
- Quote validity period

### 6. PIN Verification
User enters their 4-digit PIN to confirm the transaction.

System performs:
- PIN validation
- Balance check (ensures sufficient crypto balance)
- Wallet address retrieval

### 7. Transaction Processing
System sends withdrawal request to Linkio:
```
POST https://api.linkio.world/transactions/v2/direct_ramp/withdraw
Parameters:
- payout_currency: GHS or KES
- quoteId: Quote ID from step 4
- payout_id: Beneficiary's payout ID
- stables: USDC or USDT
- offramp_amount: Amount in USD
- sender_address: User's wallet address (based on selected chain)
- network: bsc or base
```

### 8. Success
User receives confirmation that the transaction is processing.

## Technical Implementation

### Files Created/Modified

#### New Files:
1. `webhooks/pan_african_offramp_flow.json` - WhatsApp Flow definition
2. `webhooks/services/panAfricanOfframpFlow.service.ts` - Flow logic
3. `webhooks/controllers/panAfricanOfframpFlow.controller.ts` - Flow controller

#### Modified Files:
1. `webhooks/route/route.ts` - Added Pan African offramp route
2. `config/whatsapp.ts` - Added flow ID configuration
3. `services/WhatsAppBusinessService.ts` - Added sendPanAfricanOfframpFlow method
4. `commands/handlers/offrampHandler.ts` - Added "spend crypto" detection
5. `.env.example` - Added environment variables

### Environment Variables

Add to your `.env` file:

```bash
# Pan African Offramp Flow IDs
WHATSAPP_PAN_AFRICAN_OFFRAMP_FLOW_ID=your_production_flow_id
WHATSAPP_STAGING_PAN_AFRICAN_OFFRAMP_FLOW_ID=your_staging_flow_id

# Linkio API Key
LINKIO_SEC_KEY=
```

### API Endpoints

#### Webhook Endpoint
```
POST /webhooks/pan-african-offramp
```

This endpoint handles the WhatsApp Flow interactions.

### Database Schema

The User model already includes the `payoutAccounts` field which stores beneficiary information:

```typescript
interface IPayoutAccount {
  payoutId: string;       // payout_id from Linkio
  payoutMethod: string;   // e.g. bank_transfer_gh / bank_transfer_kenya
  bankName: string;
  accountNumber: string;
  accountName: string;
  destination: string;    // first_party | third_party
  country: string;        // ghana | kenya
  createdAt: Date;
}
```

Users must add beneficiaries using the "Add Beneficiary" flow before they can use Pan African offramp.

## Linkio API Integration

### Authentication
All Linkio API requests require the `ngnc-sec-key` header:
```
ngnc-sec-key: 
```

### Payment Methods
- Ghana: `bank_transfer_gh`
- Kenya: `bank_transfer_kenya`

### Payout Currencies
- Ghana: `GHS`
- Kenya: `KES`

### Supported Networks
- BSC (BNB Smart Chain): `bsc`
- Base Network: `base`

### Supported Assets
- USDC
- USDT

## Testing

### Prerequisites
1. User must have a Linkio customer ID (`linkioCustomerId` in User model)
2. User must have added at least one beneficiary for Ghana or Kenya
3. User must have sufficient crypto balance (USDC or USDT) on BSC or Base

### Test Flow
1. Type "spend crypto" in WhatsApp
2. Select "Ghana Cedis (GHS)" or "Kenyan Shillings (KES)"
3. Enter transaction details:
   - Asset: USDC
   - Amount: 15 (minimum)
   - Chain: base
4. Select a beneficiary from the dropdown
5. Review the quote (rate, payout amount, validity)
6. Enter PIN to confirm
7. Verify transaction is processing

### Error Scenarios
- No beneficiaries: User is prompted to add a beneficiary first
- Insufficient balance: User is shown available balance and asked to deposit more
- Invalid PIN: User is prompted to try again
- Quote expired: User must restart the flow to get a new quote
- Minimum amount not met: User is shown minimum amount ($15 USD)

## Security Considerations

1. PIN verification before transaction
2. Balance check before processing
3. Quote validity ensures rates don't change during transaction
4. Linkio API key stored in environment variables
5. User's Linkio customer ID required for all operations

## Future Enhancements

1. Support for more African countries
2. Transaction history for Pan African offramps
3. Recurring payments to beneficiaries
4. Multiple beneficiary selection for batch payments
5. Real-time exchange rate updates
6. Transaction receipts via email/WhatsApp

## Support

For issues or questions:
- Check logs in `logs/combined.log` and `logs/error.log`
- Review Linkio API documentation
- Contact Linkio support for API-related issues
- Type "support" in WhatsApp for user assistance

## Deployment Checklist

- [ ] Upload `pan_african_offramp_flow.json` to WhatsApp Flow Manager
- [ ] Get Flow ID and add to `.env` file
- [ ] Verify Linkio API key is correct
- [ ] Test with staging environment first
- [ ] Ensure users have Linkio customer IDs
- [ ] Test beneficiary addition flow
- [ ] Test full offramp flow with real transactions
- [ ] Monitor logs for errors
- [ ] Set up alerts for failed transactions
