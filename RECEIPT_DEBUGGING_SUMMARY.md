# Receipt Generation Debugging - Summary

## What Was Done

Added comprehensive logging and debugging tools to diagnose why receipts aren't showing after failed deposits.

---

## Changes Made

### 1. Enhanced Logging in `utils/sendReceipt.ts`

Added detailed logs at each step:
- Transaction fetching and validation
- User data retrieval
- Receipt data formatting
- Image generation
- WhatsApp upload
- Message sending
- Error stack traces

**Log prefix:** `[Receipt]`

### 2. Enhanced Logging in `utils/generateReceipt.ts`

Added detailed logs for:
- Puppeteer launch
- Browser initialization
- Page creation
- Logo file reading
- Template compilation
- Screenshot generation
- Error handling with stack traces

**Log prefix:** `[Receipt Generation]`

### 3. Enhanced Logging in `services/WhatsAppBusinessService.ts`

Added detailed logs for:
- Image upload process
- Buffer/Blob creation
- API requests
- Response handling
- Error details (status codes, response data)

**Log prefixes:** `[WhatsApp Upload]`, `[WhatsApp Send]`

### 4. Improved Chromium Path Detection

Modified `utils/generateReceipt.ts` to:
- Try multiple common Chromium paths
- Support `PUPPETEER_EXECUTABLE_PATH` environment variable
- Provide helpful error messages if Chromium not found
- Log which path was attempted

### 5. Created Test Script

**File:** `utils/testReceiptGeneration.ts`

Allows testing receipt generation in isolation:
```bash
tsx utils/testReceiptGeneration.ts
```

Tests:
- Puppeteer launch
- Template rendering
- Image generation
- Saves test receipt to `test-receipt.png`

### 6. Created Setup Checker Script

**File:** `scripts/check-receipt-setup.sh`

Comprehensive system check:
```bash
bash scripts/check-receipt-setup.sh
```

Checks:
- Chromium installation and version
- Required files (logos, template)
- Node.js dependencies
- Environment variables
- System resources (memory, disk)
- File permissions

### 7. Created Troubleshooting Guide

**File:** `RECEIPT_TROUBLESHOOTING.md`

Comprehensive guide covering:
- Common issues and solutions
- Chromium installation
- Missing dependencies
- WhatsApp API issues
- Transaction data problems
- Background job issues
- Monitoring and testing
- Performance considerations

---

## How to Debug

### Step 1: Run Setup Checker

```bash
bash scripts/check-receipt-setup.sh
```

This will identify any system-level issues.

### Step 2: Test Receipt Generation

```bash
tsx utils/testReceiptGeneration.ts
```

This tests if Puppeteer and receipt generation work.

### Step 3: Monitor Logs

```bash
# Watch receipt-related logs in real-time
tail -f logs/combined.log | grep "\[Receipt"

# Or check all receipt logs
grep "\[Receipt" logs/combined.log

# Check for errors
grep "Error" logs/error.log | grep -i receipt
```

### Step 4: Trigger a Test Deposit

1. Create a test deposit transaction
2. Let it fail (or succeed)
3. Watch the logs for receipt generation

Look for these log sequences:

**Success:**
```
[Receipt] Starting receipt generation for transaction: {id}
[Receipt] Transaction found: {...}
[Receipt] User found: {name}
[Receipt] Formatting transaction data...
[Receipt Generation] Starting Puppeteer...
[Receipt Generation] Puppeteer launched successfully
[Receipt Generation] Receipt generated successfully
[WhatsApp Upload] Upload successful, media ID: {id}
[WhatsApp Send] Image message sent successfully
[Receipt] Receipt sent successfully
```

**Failure - will show where it breaks:**
```
[Receipt] Starting receipt generation for transaction: {id}
[Receipt Generation] Failed to launch Puppeteer: ...
```

---

## Common Issues

### Issue 1: Chromium Not Found

**Symptoms:**
```
[Receipt Generation] Failed to launch Puppeteer
Error: Could not find Chromium
```

**Solution:**
```bash
sudo apt-get update
sudo apt-get install chromium-browser
```

### Issue 2: Missing Dependencies

**Symptoms:**
```
error while loading shared libraries
```

**Solution:**
See `RECEIPT_TROUBLESHOOTING.md` section 2 for full dependency list.

### Issue 3: WhatsApp API Error

**Symptoms:**
```
[WhatsApp Upload] Response status: 400
[WhatsApp Upload] Response data: {...}
```

**Solution:**
- Check `GRAPH_API_TOKEN` is valid
- Check `BUSINESS_PHONE_NUMBER_ID` is correct
- Verify token permissions in Meta Business Suite

### Issue 4: No Logs at All

**Symptoms:**
- No `[Receipt]` logs appear

**Possible causes:**
1. Job not running (check Agenda)
2. `sendTransactionReceipt` not called
3. Transaction not found in database

**Check:**
```bash
# Look for job scheduling
grep "PROCESS_DEPOSIT" logs/combined.log

# Check if sendTransactionReceipt is called
grep "sendTransactionReceipt" logs/combined.log
```

---

## Next Steps

1. **Run the setup checker** to verify system configuration
2. **Run the test script** to verify receipt generation works
3. **Monitor logs** during a real deposit failure
4. **Review logs** to identify where the process breaks
5. **Consult troubleshooting guide** for specific error solutions

---

## Files Modified

- `utils/sendReceipt.ts` - Enhanced logging
- `utils/generateReceipt.ts` - Enhanced logging + Chromium path detection
- `services/WhatsAppBusinessService.ts` - Enhanced logging

## Files Created

- `utils/testReceiptGeneration.ts` - Test script
- `scripts/check-receipt-setup.sh` - Setup checker
- `RECEIPT_TROUBLESHOOTING.md` - Comprehensive guide
- `RECEIPT_DEBUGGING_SUMMARY.md` - This file

---

## Support

If issues persist:

1. Run setup checker and save output
2. Run test script and save output
3. Collect logs with receipt-related entries
4. Share all outputs for further diagnosis

The enhanced logging will pinpoint exactly where the receipt generation fails.
