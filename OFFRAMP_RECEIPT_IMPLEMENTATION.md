# Offramp Receipt Implementation

## Overview
A dedicated receipt system for crypto offramp transactions that sends detailed transaction receipts to users via WhatsApp. This system is completely separate from the existing transaction receipt infrastructure.

## Features

### Receipt Information
The offramp receipt displays:
1. **NGN Amount** - The amount received in the user's bank account (₦X,XXX.XX)
2. **Crypto Spent (USD)** - The USD value of crypto spent ($X.XX)
3. **Crypto Amount** - The actual crypto amount (X.XXXXXX USDC/USDT)
4. **Exchange Rate** - The USD to NGN exchange rate used (1 USD = ₦X.XX)
5. **Bank Name** - The recipient bank
6. **Account Name** - The recipient account name
7. **Account Number** - The recipient account number
8. **Date & Time** - Transaction timestamp
9. **Transaction Reference** - Quote ID for tracking
10. **Status** - Transaction status (Successful/Pending/Failed)

## Architecture

### New Files Created

#### 1. `utils/generateOfframpReceipt.ts`
- **Purpose**: Generate offramp receipt images
- **Key Functions**:
  - `prepareOfframpReceiptData()` - Formats transaction data for receipt
  - `generateOfframpReceipt()` - Creates receipt image using Puppeteer
- **Features**:
  - Currency formatting (NGN with ₦ symbol, USD with $ symbol)
  - Date formatting (e.g., "Monday, March 11, 2026, 10:30 AM")
  - Exchange rate display
  - Status-based styling

#### 2. `templates/offrampReceipt.hbs`
- **Purpose**: Handlebars template for offramp receipt HTML
- **Design**:
  - Clean, professional layout
  - ChainPaye branding with logo
  - Success icon at the top
  - Color-coded status tags
  - Scalloped bottom edge (receipt style)
  - Watermark background
- **Styling**:
  - Responsive design (400px width)
  - Inter font family
  - Blue/green color scheme matching brand
  - High-resolution rendering (2x device scale)

#### 3. `utils/sendOfframpReceipt.ts`
- **Purpose**: Send offramp receipts via WhatsApp
- **Key Functions**:
  - `sendOfframpReceipt()` - Synchronous receipt sending
  - `sendOfframpReceiptAsync()` - Non-blocking receipt sending
- **Process**:
  1. Prepare receipt data
  2. Generate receipt image (base64)
  3. Upload to WhatsApp
  4. Send to user
  5. Log success/failure

### Integration Point

#### `webhooks/services/cryptoTopUp.service.ts`
The receipt is sent in the `processOfframpInBackground()` function after:
1. ✅ Crypto transfer completes
2. ✅ DexPay quote is created
3. ✅ Offramp is finalized
4. ✅ Success notification is sent
5. **→ Receipt is generated and sent** (NEW)
6. ✅ Referral earnings are processed

## Data Flow

```
Offramp Transaction Completes
         ↓
processOfframpInBackground()
         ↓
Send Success Notification (text message)
         ↓
Generate & Send Receipt (image)
    ↓                    ↓
Prepare Data    →   Generate Image
    ↓                    ↓
Format Currency  →  Render Template
    ↓                    ↓
Get Exchange Rate → Upload to WhatsApp
    ↓                    ↓
Create Receipt Data → Send to User
```

## Usage Example

```typescript
import { sendOfframpReceiptAsync } from "../../utils/sendOfframpReceipt";

// After offramp completes successfully
sendOfframpReceiptAsync(phoneNumber, {
  ngnAmount: 150000,              // ₦150,000.00
  cryptoSpentUsd: 100.50,         // $100.50
  cryptoAmount: 100.50,           // 100.50 USDC
  cryptoSymbol: "USDC",
  bankName: "GTBank",
  accountName: "John Doe",
  accountNumber: "0123456789",
  transactionDate: new Date(),
  transactionReference: "quote_abc123",
  exchangeRate: 1492.54,          // 1 USD = ₦1,492.54
  status: "Successful",
});
```

## Error Handling

- Receipt generation failures are logged but don't fail the transaction
- Uses try-catch blocks to prevent blocking the main flow
- Async sending ensures non-blocking operation
- All errors are logged with `[Offramp Receipt]` prefix for easy tracking

## Technical Details

### Image Generation
- **Engine**: Puppeteer (headless Chromium)
- **Format**: PNG with transparent background
- **Resolution**: 600x1200px at 2x scale (high DPI)
- **Output**: Base64-encoded data URI

### Template Rendering
- **Engine**: Handlebars
- **Fonts**: Inter (loaded from Google Fonts)
- **Images**: Embedded as base64 data URIs
- **Styling**: Inline CSS for consistent rendering

### WhatsApp Integration
- Uses existing `WhatsAppBusinessService`
- Uploads image to WhatsApp media API
- Sends via `sendImageMessageById()`
- No changes to existing WhatsApp infrastructure

## Separation from Existing System

This implementation is completely separate from the existing transaction receipt system:

| Feature | Existing System | Offramp System |
|---------|----------------|----------------|
| Generator | `utils/generateReceipt.ts` | `utils/generateOfframpReceipt.ts` |
| Sender | `utils/sendReceipt.ts` | `utils/sendOfframpReceipt.ts` |
| Template | `templates/transactionReceipts.hbs` | `templates/offrampReceipt.hbs` |
| Data Format | `ReceiptData` (union type) | `OfframpReceiptData` (specific) |
| Use Case | Transfers, Deposits, Withdrawals | Crypto Offramp only |
| Integration | Transaction model | Offramp flow |

## Benefits

1. **User Experience**: Users receive a professional receipt for their records
2. **Transparency**: All transaction details clearly displayed
3. **Compliance**: Provides audit trail for financial transactions
4. **Branding**: Reinforces ChainPaye brand identity
5. **Support**: Reduces support queries with clear transaction information
6. **Separation**: No risk of breaking existing receipt system

## Testing

To test the offramp receipt:

1. Complete an offramp transaction
2. Check WhatsApp for the receipt image
3. Verify all fields are displayed correctly:
   - NGN amount matches transaction
   - Crypto spent (USD) is accurate
   - Bank details are correct
   - Date/time is formatted properly
   - Transaction reference is included
4. Check logs for `[Offramp Receipt]` entries

## Future Enhancements

Potential improvements:
- Add QR code with transaction reference
- Include fee breakdown
- Add transaction timeline
- Support multiple languages
- Email receipt option
- PDF download link

## Dependencies

- `puppeteer` - Browser automation for image generation
- `handlebars` - Template rendering
- `fs-extra` - File system operations
- Existing `WhatsAppBusinessService` - Message sending
- Existing `logger` utility - Logging

## Maintenance

- Template updates: Edit `templates/offrampReceipt.hbs`
- Styling changes: Modify CSS in template
- Data format changes: Update `OfframpReceiptData` interface
- Logo updates: Replace files in `public/` directory
