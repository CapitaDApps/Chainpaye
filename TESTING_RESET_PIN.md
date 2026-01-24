# 🧪 Reset PIN Flow Testing Guide

## Prerequisites

### 1. Fix PowerShell Execution Policy (Run as Administrator)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 2. Environment Setup
Add to your `.env` file:
```env
RESET_PIN_FLOW_ID=YOUR_ACTUAL_FLOW_ID_HERE
SMS_PROVIDER=mock  # For testing, change to twilio/termii/aws for production
```

### 3. Start the Application
```bash
npm run dev
# or double-click start-dev.bat
```

## 📱 SMS Integration

**NEW:** OTP codes are now sent via SMS text messages instead of WhatsApp messages!

### Quick SMS Test
```bash
node scripts/test-sms.js
```

This will test SMS functionality and show you the OTP codes in console (when using Mock SMS provider).

## 🔄 Testing Methods

### **Method 1: WhatsApp Flow Testing (Recommended)**

#### Step 1: Upload Flow to Meta Business Suite
1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Navigate to WhatsApp Manager → Flows
3. Upload the `webhooks/reset_pin_flow.json` file
4. Get the Flow ID and update your `.env` file

#### Step 2: Test via WhatsApp
Send these messages to your WhatsApp Business number:

**Trigger Reset PIN:**
```
reset pin
```
```
forgot my pin
```
```
change pin
```
```
/resetpin
```

**Expected Flow:**
1. User sends "reset pin"
2. Bot sends WhatsApp Flow with "Start Reset" button
3. User clicks button → Flow opens with "REQUEST_RESET" screen
4. User clicks "Send Verification Code"
5. **Bot sends OTP via SMS to user's phone number**
6. **Bot sends WhatsApp notification: "Check your SMS messages"**
7. Flow shows "VERIFY_OTP" screen
8. User enters SMS code from their phone
9. Flow shows "SET_NEW_PIN" screen
10. User enters new PIN and confirms
11. Flow shows "SUCCESS" screen
12. **Bot sends SMS confirmation + WhatsApp confirmation**

### **Method 2: Conversational Testing (Fallback)**

If WhatsApp Flows fail, the system automatically uses conversational mode:

**Test Sequence:**
```
User: reset pin
Bot: 🔐 PIN Reset Started

We've sent a 6-digit verification code to your phone number via SMS.

📱 Please check your text messages and reply here with the verification code.

⏰ Code expires in 10 minutes
🔒 Do not share this code with anyone

Type *cancel reset* to cancel this process.

[User checks SMS and gets code: 123456]

User: 123456
Bot: ✅ Code Verified

Great! Now please enter your new 4-6 digit PIN.

🔒 Your new PIN should be:
• 4-6 digits long
• Numbers only
• Easy for you to remember
• Hard for others to guess

Type your new PIN now:

User: 1234
Bot: 🔄 Confirm Your New PIN

Please enter your new PIN again to confirm:

*1234*

Type the same PIN to confirm:

User: 1234
Bot: ✅ PIN Reset Successful

Your PIN has been successfully updated! You can now use your new PIN for all transactions.

🔒 Security Tips:
• Keep your PIN confidential
• Don't share it with anyone
• Use it only for ChainPaye transactions

Type *menu* to return to the main menu.

[User also receives SMS confirmation]
```

### **Method 3: API Testing with Postman/curl**

#### Test Webhook Endpoint
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "id": "test123",
            "from": "+1234567890",
            "type": "text",
            "text": {
              "body": "reset pin"
            }
          }],
          "contacts": [{
            "wa_id": "1234567890",
            "profile": {
              "name": "Test User"
            }
          }]
        }
      }]
    }]
  }'
```

#### Test Flow Webhook
```bash
curl -X POST http://localhost:3000/flow/resetPinFlow \
  -H "Content-Type: application/json" \
  -d '{
    "screen": "REQUEST_RESET",
    "data": {},
    "version": "6.0",
    "action": "INIT",
    "flow_token": "test-token-123"
  }'
```

## 🐛 Debugging & Monitoring

### **1. Check Logs**
Monitor your console for these log messages:
```
✅ Initiating PIN reset flow for +1234567890
✅ OTP sent successfully for PIN reset: +1234567890
✅ PIN reset completed successfully for +1234567890
❌ Error in handleRequestReset: [error details]
```

### **2. Redis Session Monitoring**
Check Redis for active sessions:
```bash
redis-cli
> KEYS reset_pin_*
> GET reset_pin_state:+1234567890
> GET reset_pin_session:+1234567890
```

### **3. Database Verification**
Check if PIN was updated in MongoDB:
```javascript
// In MongoDB shell or Compass
db.users.findOne({whatsappNumber: "+1234567890"}, {pin: 1})
```

## 🔍 Test Cases

### **Happy Path Tests**
- [x] User triggers reset with "reset pin"
- [x] OTP is sent and received
- [x] OTP verification works
- [x] PIN update succeeds
- [x] Confirmation message sent

### **Error Handling Tests**
- [x] Invalid OTP format
- [x] Expired OTP
- [x] Too many failed attempts
- [x] Session timeout
- [x] PIN format validation
- [x] PIN mismatch during confirmation

### **Security Tests**
- [x] Rate limiting (3 attempts per hour)
- [x] OTP expiration (10 minutes)
- [x] Session cleanup after completion
- [x] PIN hashing with Argon2

### **Edge Cases**
- [x] User not found
- [x] Multiple active sessions
- [x] Cancel during process
- [x] Network failures
- [x] Database connection issues

## 📱 WhatsApp Testing Commands

Send these exact messages to test different scenarios:

```
# Basic reset
reset pin
forgot my pin
change pin

# Cancel reset
cancel reset
cancel pin reset

# During OTP verification
123456
999999 (wrong OTP)

# During PIN setting
1234
12345
123456
abcd (invalid)

# Help/Support
support
help
```

## 🚨 Common Issues & Solutions

### **Issue: "Session expired" immediately**
**Solution:** Check Redis connection and flow_token storage

### **Issue: OTP not received**
**Solution:** Verify WhatsApp Business API credentials and phone number format

### **Issue: Flow doesn't open**
**Solution:** 
1. Verify RESET_PIN_FLOW_ID is correct
2. Check if flow is published in Meta Business Suite
3. Ensure webhook URL is accessible

### **Issue: PIN not updating**
**Solution:** Check MongoDB connection and User model schema

## 📊 Success Metrics

Monitor these metrics to ensure the flow works correctly:

- **Completion Rate:** % of users who complete the full reset process
- **OTP Success Rate:** % of OTPs that are successfully verified
- **Error Rate:** % of reset attempts that fail
- **Time to Complete:** Average time from start to finish
- **Abandonment Points:** Where users most commonly drop off

## 🔧 Development Tools

### **Useful Scripts**
Create these helper scripts for testing:

```javascript
// scripts/test-reset-pin.js
const { redisClient } = require('./services/redis');
const { User } = require('./models/User');

async function testResetPin(phoneNumber) {
  // Check user exists
  const user = await User.findOne({whatsappNumber: phoneNumber});
  console.log('User found:', !!user);
  
  // Check active sessions
  const session = await redisClient.get(`reset_pin_session:${phoneNumber}`);
  console.log('Active session:', session);
  
  // Check rate limiting
  const rateLimit = await redisClient.get(`reset_pin_rate_limit:${phoneNumber}`);
  console.log('Rate limit:', rateLimit);
}
```

### **Mock Data Setup**
```javascript
// Create test user
const testUser = new User({
  whatsappNumber: '+1234567890',
  userId: 'test-user-123',
  firstName: 'Test',
  lastName: 'User',
  country: 'NG',
  pin: 'hashed-pin-here'
});
await testUser.save();
```

This comprehensive testing guide will help you verify that your reset PIN flow works correctly in all scenarios!