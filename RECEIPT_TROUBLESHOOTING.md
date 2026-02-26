# Receipt Generation Troubleshooting Guide

## Issue: Receipts Not Showing After Failed Deposits

This guide helps diagnose and fix issues with receipt generation and delivery.

---

## Quick Diagnosis

Run the test script to verify receipt generation works:

```bash
tsx utils/testReceiptGeneration.ts
```

If this succeeds, the issue is likely with:
- Transaction data
- WhatsApp API
- Background job execution

If this fails, the issue is with:
- Puppeteer/Chromium installation
- File permissions
- Template files

---

## Common Issues & Solutions

### 1. Chromium Not Installed

**Symptoms:**
- Error: `Failed to launch browser`
- Error: `Could not find Chromium`

**Solution:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y chromium-browser

# Or try:
sudo apt-get install -y chromium

# Verify installation
which chromium-browser
which chromium
```

**Alternative:** Set custom path in environment:
```bash
export PUPPETEER_EXECUTABLE_PATH=/path/to/chromium
```

---

### 2. Missing Dependencies

**Symptoms:**
- Error: `error while loading shared libraries`
- Browser crashes immediately

**Solution:**
```bash
# Install required libraries
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils
```

---

### 3. Logo Files Missing

**Symptoms:**
- Error: `ENOENT: no such file or directory`
- Error reading logo files

**Solution:**
```bash
# Verify logo files exist
ls -la public/logo.jpg
ls -la public/logo-icon.jpg

# Check file permissions
chmod 644 public/logo.jpg
chmod 644 public/logo-icon.jpg
```

---

### 4. Template File Missing

**Symptoms:**
- Error: `ENOENT: no such file or directory`
- Cannot find template

**Solution:**
```bash
# Verify template exists
ls -la templates/transactionReceipts.hbs

# Check permissions
chmod 644 templates/transactionReceipts.hbs
```

---

### 5. WhatsApp API Issues

**Symptoms:**
- Receipt generates but doesn't send
- Error: `Request failed with status code 400/401/403`

**Check logs for:**
```
[WhatsApp Upload] Error uploading image
[WhatsApp Send] Error sending image message
```

**Solution:**
1. Verify environment variables:
   ```bash
   echo $GRAPH_API_TOKEN
   echo $BUSINESS_PHONE_NUMBER_ID
   ```

2. Check token permissions in Meta Business Suite
3. Verify phone number is registered
4. Check WhatsApp API rate limits

---

### 6. Transaction Data Issues

**Symptoms:**
- Receipt generates but shows wrong data
- Missing transaction details

**Check logs for:**
```
[Receipt] Transaction found: {...}
[Receipt] User found: ...
```

**Solution:**
1. Verify transaction exists in database
2. Check transaction has required fields:
   - `type`
   - `status`
   - `amount`
   - `currency`
   - `referenceId`
3. Verify user data is populated

---

### 7. Background Job Not Running

**Symptoms:**
- No receipt logs appear at all
- Job completes but receipt never sent

**Check:**
1. Verify Agenda is running:
   ```typescript
   await agenda.start();
   ```

2. Check job is scheduled:
   ```bash
   # Look for job scheduling logs
   grep "Scheduling PROCESS_DEPOSIT" logs/combined.log
   ```

3. Verify `sendTransactionReceipt` is called:
   ```bash
   grep "\[Receipt\] Starting receipt generation" logs/combined.log
   ```

---

## Monitoring Receipt Generation

### Enable Detailed Logging

The code now includes comprehensive logging at each step:

1. **Receipt Request:**
   ```
   [Receipt] Starting receipt generation for transaction: {id}
   ```

2. **Data Fetching:**
   ```
   [Receipt] Transaction found: {...}
   [Receipt] User found: {name}
   ```

3. **Receipt Generation:**
   ```
   [Receipt Generation] Starting Puppeteer...
   [Receipt Generation] Puppeteer launched successfully
   [Receipt Generation] Creating new page...
   [Receipt Generation] Reading logo files...
   [Receipt Generation] Reading template...
   [Receipt Generation] Taking screenshot...
   [Receipt Generation] Receipt generated successfully
   ```

4. **WhatsApp Upload:**
   ```
   [WhatsApp Upload] Starting image upload...
   [WhatsApp Upload] Buffer created, size: {bytes}
   [WhatsApp Upload] Upload successful, media ID: {id}
   ```

5. **WhatsApp Send:**
   ```
   [WhatsApp Send] Sending image message to {phone}
   [WhatsApp Send] Image message sent successfully
   ```

### Check Logs

```bash
# Watch logs in real-time
tail -f logs/combined.log | grep "\[Receipt"

# Check for errors
grep "Error" logs/error.log | grep -i receipt

# Check specific transaction
grep "transaction-id-here" logs/combined.log
```

---

## Testing Receipt Generation

### 1. Test Receipt Generation Only

```bash
tsx utils/testReceiptGeneration.ts
```

This tests:
- Puppeteer launch
- Template rendering
- Image generation
- File I/O

### 2. Test Full Flow (Manual)

```typescript
import { sendTransactionReceipt } from "./utils/sendReceipt";

// Replace with actual transaction ID and phone number
await sendTransactionReceipt(
  "65f1234567890abcdef12345",
  "+2348012345678"
);
```

### 3. Check Transaction Status

```bash
# In MongoDB shell or using a script
db.transactions.findOne({ _id: ObjectId("transaction-id-here") })
```

Verify:
- `status` is set correctly (COMPLETED, FAILED, etc.)
- `receiptImageId` is populated after receipt is sent
- All required fields exist

---

## Performance Considerations

### Receipt Generation Time

Typical timing:
- Puppeteer launch: 1-3 seconds
- Page render: 0.5-1 second
- Screenshot: 0.2-0.5 seconds
- WhatsApp upload: 0.5-2 seconds
- **Total: 2-7 seconds**

### Memory Usage

- Chromium uses ~100-200MB RAM per instance
- Ensure server has adequate memory
- Puppeteer closes browser after each receipt

### Optimization Tips

1. **Keep Chromium Updated:**
   ```bash
   sudo apt-get update
   sudo apt-get upgrade chromium-browser
   ```

2. **Monitor Memory:**
   ```bash
   free -h
   ```

3. **Check Disk Space:**
   ```bash
   df -h
   ```

---

## Environment Variables

Required for receipt generation:

```bash
# WhatsApp API
GRAPH_API_TOKEN=your_token_here
BUSINESS_PHONE_NUMBER_ID=your_phone_id_here

# Optional: Custom Chromium path
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

---

## Support

If issues persist after following this guide:

1. Collect logs:
   ```bash
   grep "\[Receipt" logs/combined.log > receipt-logs.txt
   grep "Error" logs/error.log >> receipt-logs.txt
   ```

2. Run test script and save output:
   ```bash
   tsx utils/testReceiptGeneration.ts > test-output.txt 2>&1
   ```

3. Check system info:
   ```bash
   uname -a
   which chromium-browser
   chromium-browser --version
   node --version
   npm list puppeteer
   ```

4. Contact support with the collected information.
