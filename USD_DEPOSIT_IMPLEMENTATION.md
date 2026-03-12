# USD Deposit Implementation

## Overview

This implementation creates a new USD deposit system that allows users to deposit USD via bank transfer using a two-phase flow approach, separate from the existing mixed-currency deposit system.

## Architecture

### Two-Phase Flow System

1. **Phase 1**: USD Deposit Flow (`usd_deposit_flow.json`)
   - User enters USD amount
   - Flow ends with "Return to Chat" instruction
   - Triggers bot messages with bank details

2. **Phase 2**: Bank Details Flow (`bank_details_flow.json`)
   - User confirms transfer amount and transaction ID
   - Completes the deposit process

### Key Components

#### 1. Flow Definitions
- `webhooks/usd_deposit_flow.json` - First flow for amount input
- `webhooks/bank_details_flow.json` - Second flow for confirmation

#### 2. Command Handler
- `commands/handlers/usdDepositHandler.ts` - Handles "deposit usd"/"USD" commands
- Added to `commands/handlers/index.ts` exports

#### 3. Flow Services
- `webhooks/services/usdDepositFlow.service.ts` - Business logic for both flows
  - `getUsdDepositScreen()` - Handles first flow
  - `getBankDetailsScreen()` - Handles second flow

#### 4. Flow Controllers
- `webhooks/controllers/usdDepositFlow.controller.ts` - HTTP controller for first flow
- `webhooks/controllers/bankDetailsFlow.controller.ts` - HTTP controller for second flow

#### 5. WhatsApp Service Extensions
- Added `sendUsdDepositFlowById()` method
- Added `sendBankDetailsFlowById()` method

#### 6. Command Configuration
- Added `usdDeposit` command with high priority (7) in `commands/config.ts`
- Triggers: "deposit usd", "USD", "usd", "deposit USD", etc.

#### 7. Routing
- Added route handler in `commands/route.ts`
- Added webhook endpoints in `webhooks/route/route.ts`:
  - `/flow/usd-deposit` - First flow endpoint
  - `/flow/bank-details` - Second flow endpoint

## User Experience Flow

1. **User Command**: User types "deposit usd" or "deposit USD"
2. **First Flow**: USD deposit flow opens for amount input
3. **Return to Chat**: Flow ends, user returns to chat
4. **Bot Messages**: Bot sends Chase Bank details and transaction ID
5. **Second Flow**: Bot sends bank details flow showing transaction details
6. **Complete Transfer**: User taps "Complete Transfer" button to confirm
7. **Completion**: System processes the deposit and sends confirmation

## Bank Details (Hardcoded)

```
Bank Name: Chase Bank
Account Name: Connect Word Ink INC
Account Number: 839128227
Routing Number: 021000021
Bank Address: Chase Bank, N.A., 270 Park Avenue, New York, NY 10017
```

## Data Storage

### Transaction Creation
- Uses `walletService.deposit(phone, amount, "USD")` to create proper transaction
- Returns transaction data with `transactionId`, `refId`, and bank details
- Transaction is recorded in database with PENDING status

### Redis Keys
- `USD_DEPOSIT_{transactionId}` - Stores deposit record (7 days expiry)
- `BANK_DETAILS_FLOW_{phoneNumber}` - Stores flow data for second flow (24 hours)

### Transaction Processing
- Uses existing `scheduleProcessDeposit(transactionId)` for background processing
- Integrates with existing deposit processing infrastructure

## Environment Variables

Added to `.env.example`:
```bash
# Production
WHATSAPP_USD_DEPOSIT_FLOW_ID=your_usd_deposit_flow_id
WHATSAPP_BANK_DETAILS_FLOW_ID=your_bank_details_flow_id

# Staging
WHATSAPP_STAGING_USD_DEPOSIT_FLOW_ID=your_staging_usd_deposit_flow_id
WHATSAPP_STAGING_BANK_DETAILS_FLOW_ID=your_staging_bank_details_flow_id
```

## Configuration Updates

### WhatsApp Config (`config/whatsapp.ts`)
- Added USD_DEPOSIT and BANK_DETAILS flow IDs for both production and staging

### Command Priority
- USD deposit commands have priority 7 (higher than regular deposit priority 3)
- Ensures "USD" triggers USD deposit instead of regular deposit

## Error Handling

- Session expiry handling in both flows
- Input validation for amounts and transaction IDs
- Graceful fallback messages for errors
- Redis cleanup on completion

## Integration Points

- **Transaction Creation**: Uses `walletService.deposit()` to properly initiate USD deposits
- **Database Integration**: Transactions are recorded in the database with PENDING status
- **Processing**: Uses existing `scheduleProcessDeposit()` for background processing
- **Infrastructure**: Leverages existing deposit processing and job scheduling
- Separate from existing `topup_flow.json` system
- Uses existing Redis infrastructure
- Leverages existing WhatsApp service methods
- Follows established flow controller patterns

## Next Steps

1. **Upload Flows**: Upload `usd_deposit_flow.json` and `bank_details_flow.json` to Meta Business Suite
2. **Update Environment**: Set actual flow IDs in environment variables
3. **Testing**: Test the complete user journey
4. **Processing**: Implement backend processing for USD deposits (if needed)

## Files Created/Modified

### New Files
- `webhooks/usd_deposit_flow.json`
- `webhooks/bank_details_flow.json`
- `commands/handlers/usdDepositHandler.ts`
- `webhooks/services/usdDepositFlow.service.ts`
- `webhooks/controllers/usdDepositFlow.controller.ts`
- `webhooks/controllers/bankDetailsFlow.controller.ts`

### Modified Files
- `commands/handlers/index.ts` - Added export
- `commands/config.ts` - Added USD deposit command
- `commands/route.ts` - Added route handler and import
- `services/WhatsAppBusinessService.ts` - Added new methods
- `config/whatsapp.ts` - Added flow IDs
- `webhooks/route/route.ts` - Added endpoints
- `.env.example` - Added environment variables

## Command Triggers

The following commands will trigger the USD deposit flow:
- "deposit usd"
- "deposit USD" 
- "usd deposit"
- "USD deposit"
- "deposit dollar"
- "deposit dollars"
- And many more variations (see `commands/config.ts`)

**Note**: Standalone "USD" and "usd" triggers were removed to avoid conflicts with currency conversion commands like "usd to ngn".

This implementation provides a complete, separate USD deposit system that follows the existing patterns while meeting the specific requirements for the two-phase flow approach.