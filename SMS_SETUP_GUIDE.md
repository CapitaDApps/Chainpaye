# 📱 SMS Integration Setup Guide

## Overview

Your reset PIN flow now sends OTP codes via SMS text messages instead of WhatsApp. This provides better security and user experience.

## 🚀 Quick Start (Testing)

For immediate testing, the system is configured with a **Mock SMS provider** that logs messages to the console.

1. **Start your server:**
   ```bash
   npm run dev
   # or double-click start-dev.bat
   ```

2. **Test SMS functionality:**
   ```bash
   node scripts/test-sms.js
   ```

3. **Test reset PIN flow:**
   - Send "reset pin" to your WhatsApp bot
   - Check console logs for the OTP code
   - Use the logged OTP to complete the flow

## 📡 SMS Provider Setup (Production)

Choose one of these SMS providers for production:

### Option 1: Twilio (Recommended - Global)

**Pros:** Reliable, global coverage, good documentation
**Cons:** Higher cost

1. **Sign up:** https://www.twilio.com/
2. **Get credentials:** https://console.twilio.com/
3. **Buy a phone number** in Twilio Console
4. **Update .env:**
   ```env
   SMS_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token_here
   TWILIO_FROM_NUMBER=+1234567890
   ```

### Option 2: Termii (Nigeria/Africa)

**Pros:** Lower cost, optimized for Africa
**Cons:** Limited to African countries

1. **Sign up:** https://termii.com/
2. **Get API key:** https://accounts.termii.com/
3. **Update .env:**
   ```env
   SMS_PROVIDER=termii
   TERMII_API_KEY=your_api_key_here
   TERMII_SENDER_ID=ChainPaye
   ```

### Option 3: AWS SNS (AWS Users)

**Pros:** Integrates with AWS ecosystem
**Cons:** Requires AWS setup

1. **Configure AWS credentials**
2. **Enable SNS in your region**
3. **Update .env:**
   ```env
   SMS_PROVIDER=aws
   AWS_ACCESS_KEY_ID=your_access_key_here
   AWS_SECRET_ACCESS_KEY=your_secret_key_here
   AWS_REGION=us-east-1
   ```

## 🧪 Testing Your SMS Setup

### 1. Test SMS Service
```bash
node scripts/test-sms.js
```

### 2. Test Reset PIN Flow
```bash
# Test via API
node scripts/test-reset-pin.js

# Test via WhatsApp
# Send: "reset pin"
# Check your phone for SMS
# Complete the flow
```

### 3. Monitor Logs
Watch for these log messages:
```
✅ Sending SMS via Twilio to +1234567890
✅ Twilio SMS sent successfully to +1234567890
✅ PIN reset completed successfully for +1234567890
```

## 🔧 Configuration Details

### Environment Variables

```env
# Required
SMS_PROVIDER=twilio  # or termii, aws, mock

# Twilio (if using Twilio)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890

# Termii (if using Termii)
TERMII_API_KEY=your_api_key
TERMII_SENDER_ID=ChainPaye

# AWS SNS (if using AWS)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

### SMS Message Templates

**OTP Message:**
```
🔐 ChainPaye Security Code: 123456

This code expires in 10 minutes. Do not share this code with anyone.

If you didn't request this, please ignore this message.
```

**Confirmation Message:**
```
✅ ChainPaye PIN Reset Successful

Your transaction PIN has been successfully updated. You can now use your new PIN for all transactions.

For security:
• Keep your PIN confidential
• Don't share it with anyone
• Contact support if you didn't make this change
```

## 🔄 How It Works

### Flow-based Reset (WhatsApp Flows)
1. User sends "reset pin" → Bot sends WhatsApp Flow
2. User clicks "Send Verification Code" → **SMS sent to user's phone**
3. User enters SMS code in flow → Verification
4. User sets new PIN → Success + **SMS confirmation**

### Conversational Reset (Fallback)
1. User sends "reset pin" → **SMS sent to user's phone**
2. Bot notifies via WhatsApp: "Check your SMS"
3. User replies with SMS code → Bot asks for new PIN
4. User sets PIN → Success + **SMS confirmation**

## 🛠️ Troubleshooting

### Issue: "SMS Delivery Failed"
**Solutions:**
1. Check SMS provider credentials
2. Verify phone number format (+1234567890)
3. Check provider account balance/limits
4. Review provider-specific error logs

### Issue: "Mock SMS" in production
**Solution:** Update SMS_PROVIDER in .env file

### Issue: SMS not received
**Solutions:**
1. Check phone number is correct
2. Verify SMS provider is configured
3. Check spam/blocked messages
4. Try different SMS provider

### Issue: High SMS costs
**Solutions:**
1. Use Termii for African users (cheaper)
2. Implement rate limiting (already included)
3. Add phone number verification before sending

## 📊 Cost Comparison

| Provider | Cost per SMS | Coverage | Best For |
|----------|-------------|----------|----------|
| Twilio | $0.0075-0.05 | Global | International |
| Termii | $0.02-0.04 | Africa | Nigeria/Africa |
| AWS SNS | $0.00645-0.05 | Global | AWS users |
| Mock | Free | N/A | Testing |

## 🔒 Security Features

✅ **Rate Limiting:** 3 reset attempts per hour
✅ **OTP Expiration:** 10 minutes
✅ **PIN Hashing:** Argon2 encryption
✅ **Session Cleanup:** Automatic cleanup after completion
✅ **Phone Validation:** Format validation before sending
✅ **Dual Confirmation:** SMS + WhatsApp notifications

## 📱 Testing Checklist

- [ ] SMS service configured and tested
- [ ] OTP SMS received on test phone
- [ ] Confirmation SMS received after PIN reset
- [ ] WhatsApp notifications working
- [ ] Error handling tested (wrong OTP, expired code)
- [ ] Rate limiting tested (multiple attempts)
- [ ] Database PIN update verified

## 🚀 Production Deployment

1. **Choose SMS provider** (Twilio recommended)
2. **Configure credentials** in production .env
3. **Test with real phone numbers**
4. **Monitor SMS delivery rates**
5. **Set up alerts** for failed SMS deliveries
6. **Monitor costs** and usage

## 📞 Support

If you need help with SMS integration:

1. **Check logs** for error messages
2. **Test with Mock SMS** first
3. **Verify provider credentials**
4. **Contact SMS provider support** for delivery issues

Your reset PIN flow now provides enterprise-grade security with SMS OTP delivery!