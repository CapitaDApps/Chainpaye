# Image Payment Without Caption Feature

## Summary
Added support for users to send payment images without a caption. The system extracts bank details, stores them temporarily, and waits for the user to reply with the amount.

## Changes Made

### 1. Webhook Handler (`webhooks/index.ts`)

#### Image Message Handler (No Caption)
When user sends an image without a caption:
1. Extracts bank details from image (account number, bank name)
2. Resolves account name via Toronet
3. Stores details in Redis with key `image_payment_pending:{phone}` (30 min expiry)
4. Sends confirmation message with detected details
5. Prompts user to reply with amount

**Message sent to user:**
```
✅ Bank Details Detected

🏦 Bank: GTBank
🔢 Account: 0123456789
👤 Name: John Doe

💬 Reply with the amount you want to send
Example: send 5000 or just 5000
```

#### Text Message Handler (Amount Reply)
When user sends a text message:
1. Checks if there's a pending image payment in Redis
2. If found:
   - Parses amount from message using existing regex
   - Combines bank details with amount
   - Clears Redis entry
   - Launches image payment flow
3. If not found:
   - Routes to normal command handler

### 2. ImagePaymentService (`services/ImagePaymentService.ts`)

#### New Method: `extractBankDetailsFromImage`
```typescript
async extractBankDetailsFromImage(
  mediaId: string,
): Promise<Omit<ExtractedPaymentDetails, "amount"> | { error: string }>
```

**Functionality:**
- Downloads image from WhatsApp
- Extracts account number and bank name via OpenAI Vision
- Matches bank name to Toronet bank list
- Resolves account name via Toronet API
- Returns bank details without amount

**Returns:**
```typescript
{
  accountNumber: string;
  bankName: string;
  bankCode: string;
  accountName: string;
}
```

## User Experience

### Scenario 1: Image with Caption (Original Flow)
```
User: [Sends image with caption "send 5000"]
Bot: 🔍 Scanning your image for payment details...
Bot: [Launches flow with all details]
```

### Scenario 2: Image without Caption (New Flow)
```
User: [Sends image without caption]
Bot: 🔍 Scanning your image for payment details...
Bot: ✅ Bank Details Detected
     
     🏦 Bank: GTBank
     🔢 Account: 0123456789
     👤 Name: John Doe
     
     💬 Reply with the amount you want to send
     Example: send 5000 or just 5000

User: 5000
Bot: [Launches flow with bank details + amount]
```

### Scenario 3: Invalid Amount Reply
```
User: [Sends image without caption]
Bot: [Shows bank details and asks for amount]

User: hello
Bot: ❌ Could not find an amount in your message.
     
     💬 Please reply with the amount you want to send.
     Example: send 5000 or just 5000

User: send 5000
Bot: [Launches flow]
```

## Technical Details

### Redis Storage
- **Key:** `image_payment_pending:{phone}`
- **Value:** JSON string with bank details
- **Expiry:** 1800 seconds (30 minutes)

**Stored Data:**
```json
{
  "accountNumber": "0123456789",
  "bankName": "GTBank",
  "bankCode": "000013",
  "accountName": "John Doe"
}
```

### Amount Parsing
Uses existing `parseAmountFromCaption` method:
- Accepts: "send 5000", "5000", "pay 2500.50"
- Regex: `/[\d,]+(?:\.\d{1,2})?/`
- Removes commas from result

### Error Handling
1. **Image download fails:** "Could not download the image. Please try again."
2. **No account number detected:** "Could not detect an account number in the image..."
3. **No bank name detected:** "Could not detect a bank name in the image..."
4. **Bank not supported:** "Detected bank 'X' is not supported..."
5. **Account verification fails:** "Could not verify account number..."
6. **Account not found:** "Account number X not found at Y bank."
7. **Invalid amount reply:** "Could not find an amount in your message..."

## Benefits

1. **Flexibility:** Users can send image first, think about amount later
2. **Verification:** Users see detected bank details before committing to amount
3. **Error Recovery:** If amount parsing fails, user can retry without re-sending image
4. **Session Management:** 30-minute window to provide amount
5. **No Breaking Changes:** Original flow (image with caption) still works

## Edge Cases Handled

1. **User sends another command while pending:** Normal command processing works, pending payment remains in Redis
2. **User sends another image:** New extraction overwrites pending payment
3. **Session expires (30 min):** Redis auto-deletes, user needs to send image again
4. **Invalid amount format:** Clear error message, user can retry
5. **User sends image with caption:** Bypasses pending flow, processes immediately

## Testing Checklist

### Image Without Caption Flow
- [ ] Send image without caption
- [ ] Verify bank details are extracted correctly
- [ ] Verify account name is resolved
- [ ] Verify confirmation message shows all details
- [ ] Reply with "5000"
- [ ] Verify flow launches with correct details
- [ ] Verify Redis entry is cleared

### Amount Parsing
- [ ] Reply with "5000" → Works
- [ ] Reply with "send 5000" → Works
- [ ] Reply with "5,000" → Works (comma removed)
- [ ] Reply with "2500.50" → Works (decimals supported)
- [ ] Reply with "hello" → Shows error, allows retry

### Edge Cases
- [ ] Send image without caption, wait 31 minutes, reply with amount → Should fail gracefully
- [ ] Send image without caption, send another command → Command works, pending remains
- [ ] Send image without caption, send another image → New extraction replaces old
- [ ] Send image with caption → Bypasses pending flow, works immediately

### Error Cases
- [ ] Image with no visible account number → Shows error
- [ ] Image with no visible bank name → Shows error
- [ ] Image with unsupported bank → Shows error
- [ ] Invalid account number → Shows error
- [ ] Account not found at bank → Shows error

## Future Enhancements

1. **Edit Amount:** Allow user to change amount after providing it
2. **Cancel Pending:** Add command to cancel pending image payment
3. **Multiple Pending:** Support multiple pending payments (currently overwrites)
4. **Amount Suggestions:** Show common amounts (₦1000, ₦5000, ₦10000) as quick replies
5. **Expiry Notification:** Notify user when pending payment is about to expire
