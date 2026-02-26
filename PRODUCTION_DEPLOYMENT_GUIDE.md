# Production Deployment Guide - Receipt Fix

## Quick Summary

Receipts stopped working. The fix includes:
- Better async execution
- Improved error handling
- Snap Chromium support
- Comprehensive logging
- Diagnostic tools

---

## Deployment Steps

### 1. Deploy Code to Production Server

```bash
# On your local machine
git add .
git commit -m "Fix receipt generation with Snap Chromium support and enhanced logging"
git push origin main

# On production server
cd /path/to/your/app
git pull origin main
```

---

### 2. Install Dependencies (if needed)

```bash
# If you added any new dependencies
pnpm install
```

---

### 3. Check System Setup

```bash
# Run the setup checker
bash scripts/check-receipt-setup.sh
```

This will verify:
- ✅ Chromium is installed (including Snap)
- ✅ Logo files exist
- ✅ Template file exists
- ✅ Dependencies installed
- ✅ Environment variables set
- ✅ Sufficient resources

**Expected output:**
```
====================================
Receipt Generation Setup Checker
====================================

1. Checking Chromium Installation...
-----------------------------------
✓ Chromium (Snap) found at: /snap/bin/chromium
   Version: Chromium 120.0.6099.109 snap

2. Checking Required Files...
-----------------------------------
✓ Logo file exists: public/logo.jpg
✓ Logo icon exists: public/logo-icon.jpg
✓ Template file exists: templates/transactionReceipts.hbs

...

====================================
Summary
====================================
✓ All checks passed!
```

---

### 4. Test Receipt Generation

```bash
# Test if Puppeteer can generate receipts
npx tsx utils/testReceiptGeneration.ts
```

**Expected output:**
```
=== Testing Receipt Generation ===

[Receipt Generation] Starting Puppeteer...
[Receipt Generation] Platform: linux
[Receipt Generation] Possible Chromium paths: [
  '/snap/bin/chromium',
  ...
]
[Receipt Generation] Puppeteer launched successfully
[Receipt Generation] Receipt generated successfully

✅ Receipt generated successfully!
📁 Receipt saved to: test-receipt.png
```

**If this succeeds:** Receipt generation is working! ✅

**If this fails:** See troubleshooting section below.

---

### 5. Find Transactions Without Receipts

```bash
# Find transactions from last 7 days without receipts
npx tsx scripts/find-transactions-without-receipts.ts 168
```

This will show all transactions that should have received receipts but didn't.

**Example output:**
```
Found 5 transaction(s) without receipts:

────────────────────────────────────────────────────────
Transaction ID: 65f1234567890abcdef12345
Type: DEPOSIT
Status: FAILED
Amount: 5000 NGN
Reference: TXN-123456
Created: 2026-02-20T10:30:00.000Z
User: John Doe
Phone: +2348012345678

To send receipt: npx tsx scripts/test-receipt-for-transaction.ts 65f1234567890abcdef12345 +2348012345678
```

---

### 6. Resend Receipts (if needed)

For each transaction found in step 5:

```bash
npx tsx scripts/test-receipt-for-transaction.ts <transactionId> <phoneNumber>

# Example:
npx tsx scripts/test-receipt-for-transaction.ts 65f1234567890abcdef12345 +2348012345678
```

This will:
- Verify transaction exists
- Generate receipt
- Send to WhatsApp
- Show detailed logs

---

### 7. Restart Application

```bash
# If using PM2
pm2 restart chainpaye-whatsapp

# If using systemd
sudo systemctl restart chainpaye-whatsapp

# If using ecosystem.config.js
pm2 restart ecosystem.config.js
```

---

### 8. Monitor Logs

```bash
# Watch receipt generation in real-time
tail -f logs/combined.log | grep "\[Receipt"

# Or if using PM2
pm2 logs chainpaye-whatsapp --lines 100 | grep "\[Receipt"
```

**Look for:**
```
[Receipt] Starting receipt generation for transaction: {id}
[Receipt Generation] Puppeteer launched successfully
[Receipt] Receipt sent successfully for transaction: {id}
```

---

### 9. Test with Real Transaction

Trigger a real transaction (deposit, withdrawal, or transfer) and verify:

1. Transaction completes
2. Receipt logs appear in logs
3. User receives receipt on WhatsApp

---

## Troubleshooting

### Issue 1: Chromium Not Found

**Symptoms:**
```
[Receipt Generation] Failed to launch Puppeteer
Error: Browser was not found at the configured executablePath
```

**Fix:**

Check if Chromium is installed:
```bash
which chromium
```

If not found, install:
```bash
# Via Snap (recommended)
sudo snap install chromium

# Or via APT
sudo apt-get update
sudo apt-get install chromium-browser
```

Verify installation:
```bash
chromium --version
```

---

### Issue 2: Snap Chromium Not Detected

**Symptoms:**
```
[Receipt Generation] Possible Chromium paths: [...]
# /snap/bin/chromium not in the list
```

**Fix:**

Set environment variable in `.env`:
```bash
PUPPETEER_EXECUTABLE_PATH=/snap/bin/chromium
```

Restart application:
```bash
pm2 restart chainpaye-whatsapp
```

Test again:
```bash
npx tsx utils/testReceiptGeneration.ts
```

---

### Issue 3: Permission Denied

**Symptoms:**
```
Error: Failed to launch the browser process!
/snap/bin/chromium: Permission denied
```

**Fix:**

Check permissions:
```bash
ls -la /snap/bin/chromium
```

Reinstall Chromium:
```bash
sudo snap remove chromium
sudo snap install chromium
```

---

### Issue 4: WhatsApp API Error

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
3. Check token hasn't expired
4. Verify phone number is registered

---

### Issue 5: Low Memory

**Symptoms:**
```
Browser crashed
```

**Fix:**

Check available memory:
```bash
free -h
```

Ensure at least 200MB available. If low:
- Restart services
- Upgrade server
- Close unnecessary processes

---

### Issue 6: Template Error

**Symptoms:**
```
Error: Missing helper: "eq"
```

**Fix:**

This should be fixed in the new code. If you still see it:

1. Verify you deployed the latest code:
   ```bash
   git log -1
   # Should show the recent commit
   ```

2. Check the file was updated:
   ```bash
   grep "registerHelper" utils/generateReceipt.ts
   # Should show: handlebars.registerHelper('eq', ...)
   ```

3. Restart application

---

## Verification Checklist

After deployment, verify:

- [ ] Code deployed: `git log -1`
- [ ] Dependencies installed: `ls node_modules/puppeteer`
- [ ] System check passes: `bash scripts/check-receipt-setup.sh`
- [ ] Test receipt works: `npx tsx utils/testReceiptGeneration.ts`
- [ ] Application restarted: `pm2 status` or `systemctl status`
- [ ] Logs show receipts working: `tail -f logs/combined.log | grep "\[Receipt"`
- [ ] Real transaction sends receipt: Test with actual transaction
- [ ] No errors in logs: `grep "Error" logs/error.log | tail -20`

---

## Monitoring

### Daily Check

```bash
# Check if any transactions from today are missing receipts
npx tsx scripts/find-transactions-without-receipts.ts 24
```

### Real-time Monitoring

```bash
# Watch receipt generation
tail -f logs/combined.log | grep "\[Receipt"

# Or with PM2
pm2 logs chainpaye-whatsapp --lines 50 | grep "\[Receipt"
```

### Weekly Audit

```bash
# Find all transactions from last week without receipts
npx tsx scripts/find-transactions-without-receipts.ts 168
```

---

## Rollback Plan (if needed)

If the new code causes issues:

```bash
# Revert to previous version
git log --oneline -5  # Find previous commit hash
git revert <commit-hash>
git push origin main

# On server
git pull origin main
pm2 restart chainpaye-whatsapp
```

---

## Success Criteria

Receipts are working when:

1. ✅ System check passes all tests
2. ✅ Test receipt generation succeeds
3. ✅ No transactions without receipts
4. ✅ Logs show successful receipt generation
5. ✅ Users receive receipts on WhatsApp
6. ✅ No errors in error logs

---

## Commands Reference

```bash
# System check
bash scripts/check-receipt-setup.sh

# Test receipt generation
npx tsx utils/testReceiptGeneration.ts

# Find transactions without receipts (last 24 hours)
npx tsx scripts/find-transactions-without-receipts.ts 24

# Send receipt for specific transaction
npx tsx scripts/test-receipt-for-transaction.ts <id> <phone>

# Watch logs
tail -f logs/combined.log | grep "\[Receipt"

# Restart app
pm2 restart chainpaye-whatsapp

# Check app status
pm2 status

# View recent logs
pm2 logs chainpaye-whatsapp --lines 100
```

---

## Support

If issues persist after following this guide:

1. Collect diagnostic info:
   ```bash
   bash scripts/check-receipt-setup.sh > setup-check.txt
   npx tsx utils/testReceiptGeneration.ts > test-output.txt 2>&1
   grep "\[Receipt" logs/combined.log > receipt-logs.txt
   which chromium > chromium-info.txt
   chromium --version >> chromium-info.txt
   ```

2. Share the files for further diagnosis

---

## Additional Documentation

- **SNAP_CHROMIUM_SETUP.md** - Detailed Snap Chromium setup
- **RECEIPT_TROUBLESHOOTING.md** - Comprehensive troubleshooting
- **RECEIPT_QUICK_REFERENCE.md** - Quick command reference
- **README_RECEIPT_FIX.md** - Complete fix overview
