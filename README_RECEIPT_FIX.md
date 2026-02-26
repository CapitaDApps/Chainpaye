# Receipt Generation - Complete Fix & Diagnostic Guide

## 🚨 Problem
Receipts have stopped displaying to users after transactions.

## ✅ Solution Applied

Fixed async execution issues, improved error handling, added comprehensive logging, and created diagnostic tools.

---

## 🔧 Quick Fix Steps

### 1. Deploy the Code Changes
The following files have been updated with fixes:
- `utils/sendReceipt.ts` - Fixed async execution
- `utils/generateReceipt.ts` - Improved browser cleanup and Chromium detection
- `services/WhatsAppBusinessService.ts` - Enhanced logging

### 2. Check System Setup
```bash
bash scripts/check-receipt-setup.sh
```

This will verify:
- ✅ Chromium is installed
- ✅ Logo files exist
- ✅ Template file exists
- ✅ Dependencies installed
- ✅ Environment variables set
- ✅ Sufficient resources

### 3. Test Receipt Generation
```bash
tsx utils/testReceiptGeneration.ts
```

This creates a test receipt (`test-receipt.png`) to verify Puppeteer works.

### 4. Find Affected Transactions
```bash
# Find transactions from last 24 hours without receipts
tsx scripts/find-transactions-without-receipts.ts 24

# Or last 7 days
tsx scripts/find-transactions-without-receipts.ts 168
```

### 5. Resend Receipts
```bash
# For each transaction found, run:
tsx scripts/test-receipt-for-transaction.ts <transactionId> <phoneNumber>
```

---

## 📊 Diagnostic Tools

### Tool 1: System Setup Checker
**File:** `scripts/check-receipt-setup.sh`

**Usage:**
```bash
bash scripts/check-receipt-setup.sh
```

**What it checks:**
- Chromium installation and version
- Required files (logos, template)
- Node.js dependencies (puppeteer, handlebars, fs-extra)
- Environment variables (GRAPH_API_TOKEN, BUSINESS_PHONE_NUMBER_ID)
- System resources (memory, disk space)
- File permissions

**Output:**
- ✅ Green checkmarks for passing checks
- ❌ Red X for failing checks
- ⚠️ Yellow warnings for potential issues

---

### Tool 2: Test Receipt Generation
**File:** `utils/testReceiptGeneration.ts`

**Usage:**
```bash
tsx utils/testReceiptGeneration.ts
```

**What it does:**
- Creates test transaction data (failed deposit)
- Generates receipt image
- Saves to `test-receipt.png`
- Shows detailed logs

**Use when:**
- Testing if Puppeteer works
- Verifying template renders correctly
- Checking logo files are accessible

---

### Tool 3: Find Transactions Without Receipts
**File:** `scripts/find-transactions-without-receipts.ts`

**Usage:**
```bash
tsx scripts/find-transactions-without-receipts.ts [hours]

# Examples:
tsx scripts/find-transactions-without-receipts.ts 24   # Last 24 hours
tsx scripts/find-transactions-without-receipts.ts 168  # Last 7 days
```

**What it does:**
- Queries database for completed/failed transactions
- Filters transactions without `receiptImageId`
- Shows transaction details and user info
- Provides command to resend receipt

**Output:**
```
Transaction ID: 65f1234567890abcdef12345
Type: DEPOSIT
Status: FAILED
Amount: 5000 NGN
Reference: TXN-123456
Created: 2026-02-26T10:30:00.000Z
User: John Doe
Phone: +2348012345678

To send receipt: tsx scripts/test-receipt-for-transaction.ts 65f1234567890abcdef12345 +2348012345678
```

---

### Tool 4: Send Receipt for Specific Transaction
**File:** `scripts/test-receipt-for-transaction.ts`

**Usage:**
```bash
tsx scripts/test-receipt-for-transaction.ts <transactionId> <phoneNumber>

# Example:
tsx scripts/test-receipt-for-transaction.ts 65f1234567890abcdef12345 +2348012345678
```

**What it does:**
- Connects to database
- Verifies transaction exists
- Displays transaction details
- Sends receipt to specified phone number
- Waits 10 seconds for processing
- Shows detailed logs

**Use when:**
- Manually resending receipts
- Testing specific transactions
- Debugging receipt issues

---

## 📝 Monitoring & Logs

### Watch Receipt Logs in Real-Time
```bash
tail -f logs/combined.log | grep "\[Receipt"
```

### Check for Receipt Errors
```bash
grep "\[Receipt" logs/error.log
```

### Find Logs for Specific Transaction
```bash
grep "transaction-id-here" logs/combined.log
```

### Successful Receipt Log Pattern
```
[Receipt] Starting receipt generation for transaction: {id}
[Receipt] Transaction found: {type: "DEPOSIT", status: "FAILED"}
[Receipt] User found: John Doe
[Receipt] Formatting transaction data...
[Receipt] Receipt data formatted: {transactionType: "Deposit", status: "Failed"}
[Receipt] Generating receipt image...
[Receipt Generation] Starting Puppeteer...
[Receipt Generation] Puppeteer launched successfully
[Receipt Generation] Receipt generated successfully
[Receipt] Receipt image generated, size: 123456 bytes
[Receipt] Uploading receipt to WhatsApp...
[WhatsApp Upload] Upload successful, media ID: 1234567890
[Receipt] Sending receipt to user: +2348012345678
[WhatsApp Send] Image message sent successfully
[Receipt] Receipt sent successfully for transaction: {id}
```

---

## 🐛 Common Issues & Fixes

### Issue 1: Chromium Not Installed
**Symptoms:**
```
[Receipt Generation] Failed to launch Puppeteer
Error: Could not find Chromium
```

**Fix:**
```bash
sudo apt-get update
sudo apt-get install chromium-browser

# Verify
which chromium-browser
chromium-browser --version
```

---

### Issue 2: Logo Files Missing
**Symptoms:**
```
ENOENT: no such file or directory, open 'public/logo.jpg'
```

**Fix:**
```bash
# Check if files exist
ls -la public/logo.jpg public/logo-icon.jpg

# If missing, restore from repository or backup
```

---

### Issue 3: WhatsApp API Error
**Symptoms:**
```
[WhatsApp Upload] Response status: 400
[WhatsApp Upload] Response data: {error: {...}}
```

**Fix:**
1. Check environment variables:
   ```bash
   cat .env | grep GRAPH_API_TOKEN
   cat .env | grep BUSINESS_PHONE_NUMBER_ID
   ```

2. Verify token in Meta Business Suite
3. Check token permissions include media upload
4. Verify phone number is registered

---

### Issue 4: Low Memory
**Symptoms:**
```
Browser crashed
```

**Fix:**
```bash
# Check available memory
free -h

# Ensure at least 200MB available
# If low, restart services or upgrade server
```

---

### Issue 5: Template Not Found
**Symptoms:**
```
ENOENT: no such file or directory, open 'templates/transactionReceipts.hbs'
```

**Fix:**
```bash
# Check if template exists
ls -la templates/transactionReceipts.hbs

# Verify permissions
chmod 644 templates/transactionReceipts.hbs
```

---

## 📚 Documentation Files

- **RECEIPT_FIX_SUMMARY.md** - Complete fix summary and prevention guide
- **RECEIPT_TROUBLESHOOTING.md** - Comprehensive troubleshooting guide
- **RECEIPT_QUICK_REFERENCE.md** - Quick command reference
- **RECEIPT_DEBUGGING_SUMMARY.md** - Debugging changes summary
- **README_RECEIPT_FIX.md** - This file

---

## 🔄 Workflow for Fixing Receipt Issues

```
1. Deploy code changes
   ↓
2. Run: bash scripts/check-receipt-setup.sh
   ↓
3. Fix any system issues found
   ↓
4. Run: tsx utils/testReceiptGeneration.ts
   ↓
5. If test passes:
   ├─→ Run: tsx scripts/find-transactions-without-receipts.ts 168
   ├─→ For each transaction, run:
   │   tsx scripts/test-receipt-for-transaction.ts <id> <phone>
   └─→ Monitor logs: tail -f logs/combined.log | grep "\[Receipt"
   
6. If test fails:
   ├─→ Check Chromium: which chromium-browser
   ├─→ Check logo files: ls -la public/
   ├─→ Check template: ls -la templates/
   └─→ Review error logs
```

---

## 🎯 Success Criteria

Receipts are working when:
- ✅ System check passes all tests
- ✅ Test receipt generation succeeds
- ✅ No transactions without receipts
- ✅ Logs show successful receipt generation
- ✅ Users receive receipts on WhatsApp

---

## 📞 Support

If issues persist:

1. Run and save output:
   ```bash
   bash scripts/check-receipt-setup.sh > setup-check.txt
   tsx utils/testReceiptGeneration.ts > test-output.txt 2>&1
   grep "\[Receipt" logs/combined.log > receipt-logs.txt
   ```

2. Collect system info:
   ```bash
   uname -a > system-info.txt
   node --version >> system-info.txt
   chromium-browser --version >> system-info.txt
   free -h >> system-info.txt
   df -h >> system-info.txt
   ```

3. Share all files for diagnosis

---

## ✨ What Changed

### Code Fixes
1. **Async Execution** - Replaced `setImmediate()` with IIFE for better compatibility
2. **Browser Cleanup** - Improved Puppeteer browser closing in error cases
3. **Error Handling** - Added comprehensive error logging with stack traces
4. **Chromium Detection** - Added multiple path detection and helpful error messages

### New Tools
1. **System Setup Checker** - Verifies all requirements
2. **Test Receipt Generator** - Tests Puppeteer in isolation
3. **Transaction Finder** - Finds transactions without receipts
4. **Receipt Resender** - Manually sends receipts for specific transactions

### Enhanced Logging
- Transaction and user data fetching
- Receipt data formatting
- Puppeteer operations
- WhatsApp upload and sending
- Full error stack traces

All logs use `[Receipt]` prefix for easy filtering.

---

## 🚀 Quick Start

```bash
# 1. Check system
bash scripts/check-receipt-setup.sh

# 2. Test generation
tsx utils/testReceiptGeneration.ts

# 3. Find affected transactions
tsx scripts/find-transactions-without-receipts.ts 24

# 4. Resend receipts (if needed)
tsx scripts/test-receipt-for-transaction.ts <id> <phone>

# 5. Monitor
tail -f logs/combined.log | grep "\[Receipt"
```

Done! Receipts should now be working. 🎉
