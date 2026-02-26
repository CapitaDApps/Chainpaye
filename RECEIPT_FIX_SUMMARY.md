# Receipt Generation Fix - Summary

## Problem
Receipts have stopped displaying to users after transactions (deposits, withdrawals, transfers, etc.)

## Root Cause Analysis

The issue could be caused by several factors:

1. **Async Execution Issue**: The original code used `setImmediate()` which may not work reliably in all Node.js environments
2. **Browser Not Closing**: Puppeteer browser instances might not be closing properly, causing memory leaks
3. **Silent Failures**: Errors in receipt generation were being caught but not properly logged
4. **Missing Chromium**: Chromium might not be installed or accessible on the server

## Fixes Applied

### 1. Fixed Async Execution (`utils/sendReceipt.ts`)

**Before:**
```typescript
setImmediate(async () => {
  // receipt generation code
});
```

**After:**
```typescript
(async () => {
  // receipt generation code
})().catch((err) => {
  console.error(`[Receipt] Unhandled error in receipt generation:`, err);
});
```

This ensures:
- Async execution without blocking
- Proper error handling
- Works in all Node.js environments

### 2. Improved Browser Cleanup (`utils/generateReceipt.ts`)

**Added:**
- Explicit browser close after screenshot
- Try-catch around browser close in error handler
- Logging of browser close operations

This prevents:
- Memory leaks from unclosed browsers
- Zombie Chromium processes
- Resource exhaustion

### 3. Enhanced Error Logging

Added comprehensive logging throughout:
- Transaction and user data fetching
- Receipt data formatting
- Puppeteer launch and operations
- WhatsApp upload and sending
- Full error stack traces

### 4. Improved Chromium Detection

**Added:**
- Multiple common Chromium paths
- Support for `PUPPETEER_EXECUTABLE_PATH` env variable
- Helpful error messages if Chromium not found

## New Diagnostic Tools

### 1. System Setup Checker
```bash
bash scripts/check-receipt-setup.sh
```

Checks:
- Chromium installation
- Required files (logos, template)
- Node.js dependencies
- Environment variables
- System resources
- File permissions

### 2. Test Receipt Generation
```bash
tsx utils/testReceiptGeneration.ts
```

Tests receipt generation in isolation and creates `test-receipt.png`

### 3. Find Transactions Without Receipts
```bash
tsx scripts/find-transactions-without-receipts.ts 24
```

Finds transactions from last 24 hours that don't have receipts

### 4. Send Receipt for Specific Transaction
```bash
tsx scripts/test-receipt-for-transaction.ts <transactionId> <phoneNumber>
```

Manually sends receipt for a specific transaction

## How to Diagnose the Issue

### Step 1: Check System Setup

```bash
bash scripts/check-receipt-setup.sh
```

This will identify any system-level issues:
- ❌ Chromium not installed → Install with `sudo apt-get install chromium-browser`
- ❌ Logo files missing → Verify files exist in `public/` directory
- ❌ Environment variables missing → Check `.env` file
- ❌ Low memory → Ensure >200MB available

### Step 2: Test Receipt Generation

```bash
tsx utils/testReceiptGeneration.ts
```

If this fails:
- Check Chromium installation
- Check logo files exist
- Check template file exists
- Review error messages

If this succeeds, the issue is with:
- Transaction data
- WhatsApp API
- Background job execution

### Step 3: Find Affected Transactions

```bash
tsx scripts/find-transactions-without-receipts.ts 24
```

This shows all transactions from last 24 hours without receipts.

### Step 4: Test Specific Transaction

```bash
tsx scripts/test-receipt-for-transaction.ts <transactionId> <phoneNumber>
```

This will:
1. Verify transaction exists
2. Send receipt
3. Show detailed logs
4. Wait for processing

### Step 5: Monitor Logs

```bash
# Watch receipt logs in real-time
tail -f logs/combined.log | grep "\[Receipt"
```

Look for:
- `[Receipt] Starting receipt generation` - Receipt process started
- `[Receipt Generation] Puppeteer launched successfully` - Chromium working
- `[WhatsApp Upload] Upload successful` - WhatsApp API working
- `[Receipt] Receipt sent successfully` - Complete success

Or errors:
- `Failed to launch Puppeteer` - Chromium issue
- `ENOENT: no such file` - Missing files
- `Response status: 400` - WhatsApp API issue

## Common Issues & Quick Fixes

### Issue 1: Chromium Not Installed

**Error:**
```
[Receipt Generation] Failed to launch Puppeteer
```

**Fix:**
```bash
sudo apt-get update
sudo apt-get install chromium-browser
```

### Issue 2: Logo Files Missing

**Error:**
```
ENOENT: no such file or directory, open 'public/logo.jpg'
```

**Fix:**
```bash
# Verify files exist
ls -la public/logo.jpg public/logo-icon.jpg

# If missing, restore from backup or repository
```

### Issue 3: WhatsApp API Error

**Error:**
```
[WhatsApp Upload] Response status: 400
```

**Fix:**
1. Check environment variables:
   ```bash
   echo $GRAPH_API_TOKEN
   echo $BUSINESS_PHONE_NUMBER_ID
   ```
2. Verify token is valid in Meta Business Suite
3. Check token permissions include media upload

### Issue 4: Low Memory

**Error:**
```
Browser crashed
```

**Fix:**
```bash
# Check available memory
free -h

# If low, restart services or upgrade server
```

### Issue 5: Receipts Were Working, Now Stopped

**Possible causes:**
1. Server restarted and Chromium not installed
2. Environment variables lost
3. Disk space full
4. WhatsApp token expired

**Diagnosis:**
```bash
# Run full system check
bash scripts/check-receipt-setup.sh

# Check recent logs
tail -100 logs/combined.log | grep -i error

# Check disk space
df -h
```

## Resending Receipts for Past Transactions

If receipts stopped working and you need to resend them:

```bash
# 1. Find transactions without receipts
tsx scripts/find-transactions-without-receipts.ts 168  # Last 7 days

# 2. For each transaction, send receipt
tsx scripts/test-receipt-for-transaction.ts <transactionId> <phoneNumber>
```

Or create a batch script:
```bash
#!/bin/bash
# resend-receipts.sh

tsx scripts/test-receipt-for-transaction.ts 65f123... +2348012345678
tsx scripts/test-receipt-for-transaction.ts 65f456... +2348087654321
# ... add more as needed
```

## Monitoring Receipt Health

### Daily Check
```bash
# Check if any transactions from today are missing receipts
tsx scripts/find-transactions-without-receipts.ts 24
```

### Real-time Monitoring
```bash
# Watch receipt generation in real-time
tail -f logs/combined.log | grep "\[Receipt"
```

### Weekly Audit
```bash
# Find all transactions from last week without receipts
tsx scripts/find-transactions-without-receipts.ts 168
```

## Prevention

To prevent receipts from stopping in the future:

1. **Monitor Chromium**: Ensure Chromium stays installed
   ```bash
   which chromium-browser || echo "Chromium missing!"
   ```

2. **Monitor Disk Space**: Ensure adequate space
   ```bash
   df -h | grep -E "Use%|/$"
   ```

3. **Monitor Memory**: Ensure adequate RAM
   ```bash
   free -h
   ```

4. **Check Logs Daily**: Look for receipt errors
   ```bash
   grep "\[Receipt\].*Error" logs/combined.log
   ```

5. **Test Weekly**: Run test script weekly
   ```bash
   tsx utils/testReceiptGeneration.ts
   ```

## Files Modified

- `utils/sendReceipt.ts` - Fixed async execution, enhanced logging
- `utils/generateReceipt.ts` - Improved browser cleanup, Chromium detection, logging
- `services/WhatsAppBusinessService.ts` - Enhanced logging for upload/send

## Files Created

- `scripts/check-receipt-setup.sh` - System setup checker
- `scripts/find-transactions-without-receipts.ts` - Find transactions without receipts
- `scripts/test-receipt-for-transaction.ts` - Send receipt for specific transaction
- `utils/testReceiptGeneration.ts` - Test receipt generation
- `RECEIPT_TROUBLESHOOTING.md` - Comprehensive troubleshooting guide
- `RECEIPT_QUICK_REFERENCE.md` - Quick command reference
- `RECEIPT_DEBUGGING_SUMMARY.md` - Debugging summary
- `RECEIPT_FIX_SUMMARY.md` - This file

## Next Steps

1. **Deploy the fixes** to your server
2. **Run system check**: `bash scripts/check-receipt-setup.sh`
3. **Test receipt generation**: `tsx utils/testReceiptGeneration.ts`
4. **Find affected transactions**: `tsx scripts/find-transactions-without-receipts.ts 168`
5. **Resend receipts** for affected transactions
6. **Monitor logs** to ensure receipts are working
7. **Set up monitoring** to catch future issues early

## Support

If issues persist after following this guide:

1. Run: `bash scripts/check-receipt-setup.sh > setup-check.txt`
2. Run: `tsx utils/testReceiptGeneration.ts > test-output.txt 2>&1`
3. Collect: `grep "\[Receipt" logs/combined.log > receipt-logs.txt`
4. Share all three files for further diagnosis

The enhanced logging will pinpoint exactly where receipt generation fails.
