# Receipt Generation - Quick Reference

## Quick Diagnosis Commands

```bash
# 1. Check system setup
bash scripts/check-receipt-setup.sh

# 2. Test receipt generation (creates test image)
tsx utils/testReceiptGeneration.ts

# 3. Find transactions without receipts (last 24 hours)
tsx scripts/find-transactions-without-receipts.ts 24

# 4. Send receipt for specific transaction
tsx scripts/test-receipt-for-transaction.ts <transactionId> <phoneNumber>

# 5. Watch receipt logs in real-time
tail -f logs/combined.log | grep "\[Receipt"

# 6. Check for receipt errors
grep "\[Receipt" logs/error.log

# 7. Find specific transaction logs
grep "transaction-id-here" logs/combined.log
```

---

## Log Patterns to Look For

### ✅ Successful Receipt Generation

```
[Receipt] Starting receipt generation for transaction: {id}
[Receipt] Transaction found: {type: "DEPOSIT", status: "FAILED", ...}
[Receipt] User found: John Doe
[Receipt] Formatting transaction data...
[Receipt] Receipt data formatted: {transactionType: "Deposit", status: "Failed"}
[Receipt] Generating receipt image...
[Receipt Generation] Starting Puppeteer...
[Receipt Generation] Puppeteer launched successfully
[Receipt Generation] Creating new page...
[Receipt Generation] Reading logo files...
[Receipt Generation] Logos loaded successfully
[Receipt Generation] Reading template...
[Receipt Generation] Preparing template data...
[Receipt Generation] Setting page content...
[Receipt Generation] Setting viewport...
[Receipt Generation] Finding receipt container...
[Receipt Generation] Taking screenshot...
[Receipt Generation] Receipt generated successfully
[Receipt] Receipt image generated, size: 123456 bytes
[Receipt] Uploading receipt to WhatsApp...
[WhatsApp Upload] Starting image upload...
[WhatsApp Upload] Base64 cleaned, length: 123456
[WhatsApp Upload] Buffer created, size: 123456 bytes
[WhatsApp Upload] Blob created, size: 123456 bytes
[WhatsApp Upload] Uploading to WhatsApp API...
[WhatsApp Upload] Upload successful, media ID: 1234567890
[Receipt] Receipt uploaded, image ID: 1234567890
[Receipt] Sending receipt to user: +2348012345678
[WhatsApp Send] Sending image message to +2348012345678, media ID: 1234567890
[WhatsApp Send] Image message sent successfully, message ID: wamid.xxx
[Receipt] Receipt sent successfully for transaction: {id}
```

### ❌ Common Failure Patterns

**Chromium Not Found:**
```
[Receipt Generation] Starting Puppeteer...
[Receipt Generation] Failed to launch Puppeteer: Error: Could not find Chromium
```
→ **Fix:** `sudo apt-get install chromium-browser`

**Logo Files Missing:**
```
[Receipt Generation] Reading logo files...
Error: ENOENT: no such file or directory, open 'public/logo.jpg'
```
→ **Fix:** Verify logo files exist in `public/` directory

**WhatsApp API Error:**
```
[WhatsApp Upload] Error uploading image: AxiosError
[WhatsApp Upload] Response status: 400
[WhatsApp Upload] Response data: {error: {...}}
```
→ **Fix:** Check `GRAPH_API_TOKEN` and `BUSINESS_PHONE_NUMBER_ID`

**Transaction Not Found:**
```
[Receipt] Transaction not found: 65f1234567890abcdef12345
```
→ **Fix:** Verify transaction exists in database

**User Not Found:**
```
[Receipt] User not found: +2348012345678
```
→ **Fix:** Verify user exists with correct phone number

---

## Installation Commands

### Ubuntu/Debian

```bash
# Install Chromium
sudo apt-get update
sudo apt-get install -y chromium-browser

# Install all dependencies
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libgbm1 \
  libgtk-3-0 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2

# Verify installation
which chromium-browser
chromium-browser --version
```

---

## Environment Variables

```bash
# Required for WhatsApp
GRAPH_API_TOKEN=your_token_here
BUSINESS_PHONE_NUMBER_ID=your_phone_id_here

# Optional: Custom Chromium path
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

---

## File Checklist

- [ ] `public/logo.jpg` exists and readable
- [ ] `public/logo-icon.jpg` exists and readable
- [ ] `templates/transactionReceipts.hbs` exists and readable
- [ ] `node_modules/puppeteer` installed
- [ ] `node_modules/handlebars` installed
- [ ] `node_modules/fs-extra` installed
- [ ] Chromium installed (`which chromium-browser`)
- [ ] `.env` file with WhatsApp credentials

---

## Testing Flow

1. **System Check:**
   ```bash
   bash scripts/check-receipt-setup.sh
   ```
   Should show all green checkmarks.

2. **Isolated Test:**
   ```bash
   tsx utils/testReceiptGeneration.ts
   ```
   Should create `test-receipt.png` file.

3. **Real Transaction Test:**
   - Trigger a deposit
   - Let it fail (or succeed)
   - Check logs for receipt generation
   - Verify receipt received on WhatsApp

---

## Monitoring

### Real-time Monitoring

```bash
# Terminal 1: Watch all logs
tail -f logs/combined.log

# Terminal 2: Watch receipt logs only
tail -f logs/combined.log | grep "\[Receipt"

# Terminal 3: Watch errors
tail -f logs/error.log
```

### Post-mortem Analysis

```bash
# Get all receipt logs for today
grep "$(date +%Y-%m-%d)" logs/combined.log | grep "\[Receipt"

# Count successful receipts
grep "\[Receipt\] Receipt sent successfully" logs/combined.log | wc -l

# Find failed receipts
grep "\[Receipt\] Error sending receipt" logs/combined.log

# Get logs for specific transaction
grep "65f1234567890abcdef12345" logs/combined.log
```

---

## Performance Benchmarks

| Step | Expected Time |
|------|---------------|
| Puppeteer launch | 1-3 seconds |
| Page render | 0.5-1 second |
| Screenshot | 0.2-0.5 seconds |
| WhatsApp upload | 0.5-2 seconds |
| **Total** | **2-7 seconds** |

If taking longer:
- Check server resources (memory, CPU)
- Check network latency to WhatsApp API
- Check Chromium version (update if old)

---

## Common Fixes

| Issue | Command |
|-------|---------|
| Chromium missing | `sudo apt-get install chromium-browser` |
| Dependencies missing | See `RECEIPT_TROUBLESHOOTING.md` section 2 |
| Permissions error | `chmod 644 public/*.jpg templates/*.hbs` |
| Low memory | `free -h` (ensure >200MB available) |
| Node modules missing | `pnpm install` |

---

## Support Checklist

Before asking for help, collect:

1. ✅ Output of `bash scripts/check-receipt-setup.sh`
2. ✅ Output of `tsx utils/testReceiptGeneration.ts`
3. ✅ Recent logs: `grep "\[Receipt" logs/combined.log > receipt-logs.txt`
4. ✅ System info:
   ```bash
   uname -a
   node --version
   chromium-browser --version
   free -h
   df -h
   ```

---

## Related Documentation

- **Full troubleshooting guide:** `RECEIPT_TROUBLESHOOTING.md`
- **Implementation summary:** `RECEIPT_DEBUGGING_SUMMARY.md`
- **Test script:** `utils/testReceiptGeneration.ts`
- **Setup checker:** `scripts/check-receipt-setup.sh`
