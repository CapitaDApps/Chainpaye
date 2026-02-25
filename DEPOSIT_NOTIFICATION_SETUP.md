# Deposit Notification Setup Guide

This guide explains how to set up deposit notifications so users receive WhatsApp messages when crypto is deposited into their wallets.

## Overview

The system uses Crossmint webhooks to detect deposits and automatically notify users via WhatsApp.

## Setup Steps

### 1. Add Environment Variables

Add these to your `.env` file:

```bash
# Crossmint Configuration
CROSSMINT_API_KEY=your_crossmint_api_key_here
CROSSMINT_BASE_URL=https://www.crossmint.com/api/2022-06-09
CROSSMINT_WEBHOOK_SECRET=your_crossmint_webhook_secret_here
```

**Where to get these:**
- `CROSSMINT_API_KEY`: From Crossmint Console → API Keys
- `CROSSMINT_WEBHOOK_SECRET`: Generated when you create the webhook (step 2)

### 2. Register Webhook in Crossmint Dashboard

1. Go to [Crossmint Console](https://www.crossmint.com/console)
2. Navigate to **Settings** → **Webhooks** (or **Developers** → **Webhooks**)
3. Click **Add Webhook** or **Create Webhook**
4. Configure the webhook:
   - **URL**: `https://your-domain.com/webhooks/deposit-notification`
   - **Events**: Select `wallet.deposit` or `wallet.transaction.confirmed`
   - **Description**: "ChainPaye deposit notifications"
5. Click **Create** or **Save**
6. **Copy the Webhook Secret** and add it to your `.env` file as `CROSSMINT_WEBHOOK_SECRET`

### 3. Verify Your Server is Accessible

Make sure your webhook endpoint is publicly accessible:

```bash
# Test that your server is reachable
curl https://your-domain.com/webhooks/test-deposit-notification \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+2348012345678",
    "asset": "usdt",
    "amount": "10.5",
    "chain": "bsc"
  }'
```

If successful, the user should receive a WhatsApp notification.

### 4. Test with Crossmint

After registering the webhook, Crossmint usually sends a test event. You can also:

1. Make a small test deposit to one of your wallets
2. Check your server logs for incoming webhook requests
3. Verify the user receives a WhatsApp notification

## Webhook Payload Format

Crossmint sends webhooks in this format:

```json
{
  "type": "wallet.deposit",
  "data": {
    "walletId": "wallet-id-here",
    "owner": "userId:user-123",
    "address": "0x1234...",
    "chainType": "bsc",
    "transaction": {
      "hash": "0xabc...",
      "amount": "10.5",
      "token": "usdt",
      "from": "0x5678...",
      "to": "0x1234...",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  }
}
```

## Notification Message

Users receive a WhatsApp message like:

```
🎉 Crypto Deposit Received!

💰 Amount: 10.500000 USDT
🔗 Network: BSC
⏰ Time: Jan 1, 2024 12:00 PM

✅ Your deposit has been confirmed and is ready to use!

🚀 Ready to convert to NGN?
Type *spend crypto* to start your off-ramp transaction.

💡 What happens next?
• Choose your NGN amount
• Select your bank account
• Confirm with your PIN
• Receive money in seconds!

💰 Current Balance: 10.500000 USDT
📱 Type *balance* to check all your crypto balances.
```

## Security

The webhook endpoint is protected with signature verification:
- Crossmint signs each webhook with your webhook secret
- The middleware verifies the signature before processing
- Invalid signatures are rejected with 403 Forbidden

## Troubleshooting

### Webhook not receiving events

1. **Check webhook is active** in Crossmint dashboard
2. **Verify URL is correct** and publicly accessible
3. **Check server logs** for incoming requests
4. **Test with curl** to ensure endpoint works

### Signature verification failing

1. **Verify `CROSSMINT_WEBHOOK_SECRET`** matches the one in Crossmint dashboard
2. **Check webhook secret** hasn't been regenerated
3. **Review server logs** for signature mismatch errors

### User not receiving notification

1. **Check user exists** in database
2. **Verify phone number** is correct in E.164 format (+234...)
3. **Check WhatsApp API** credentials are valid
4. **Review logs** for WhatsApp API errors

## Endpoints

- **Production webhook**: `POST /webhooks/deposit-notification` (with signature verification)
- **Test endpoint**: `POST /webhooks/test-deposit-notification` (no verification, for testing)
- **Legacy endpoint**: `POST /webhooks/deposit-webhook` (with signature verification)

## Files Modified

- `webhooks/middleware.ts` - Added `verifyCrossmintWebhook` middleware
- `webhooks/route/route.ts` - Applied middleware to deposit routes
- `.env.example` - Added Crossmint configuration variables
- `webhooks/controllers/depositNotification.controller.ts` - Already implemented
- `commands/handlers/offrampHandler.ts` - Already has `handleDepositNotification`

## Next Steps

1. Add `CROSSMINT_WEBHOOK_SECRET` to your `.env` file
2. Register webhook in Crossmint dashboard
3. Test with a small deposit
4. Monitor logs to ensure notifications are sent

## Support

If you encounter issues:
- Check Crossmint documentation: https://docs.crossmint.com/webhooks
- Review server logs for errors
- Test with the `/test-deposit-notification` endpoint first
