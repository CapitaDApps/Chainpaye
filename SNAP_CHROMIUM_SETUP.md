# Using Snap Chromium with Receipt Generation

## Issue
Chromium is installed via Snap, but Puppeteer can't find it automatically.

## Solution

The code now includes Snap paths, but you can also set an environment variable to explicitly tell Puppeteer where to find Chromium.

---

## Option 1: Let the Code Auto-Detect (Recommended)

The updated code now checks these paths in order:

1. `$PUPPETEER_EXECUTABLE_PATH` (environment variable)
2. `/snap/bin/chromium` (Snap installation)
3. `/snap/chromium/current/usr/lib/chromium-browser/chrome` (Snap alternative)
4. `/usr/bin/chromium-browser` (APT installation)
5. `/usr/bin/chromium` (Alternative APT)
6. `/usr/bin/google-chrome` (Chrome)
7. `/usr/bin/google-chrome-stable` (Chrome stable)

Just deploy the updated code and it should work automatically.

---

## Option 2: Set Environment Variable (If Auto-Detect Fails)

### Find Your Chromium Path

```bash
# Check if Chromium is in Snap
which chromium
# Output: /snap/bin/chromium

# Or check the actual binary location
ls -la /snap/bin/chromium
# This is usually a symlink to the actual binary

# Find the real path
readlink -f /snap/bin/chromium
# Output might be: /snap/chromium/2805/usr/lib/chromium-browser/chrome
```

### Set the Environment Variable

Add to your `.env` file:

```bash
PUPPETEER_EXECUTABLE_PATH=/snap/bin/chromium
```

Or if the above doesn't work, use the full path:

```bash
PUPPETEER_EXECUTABLE_PATH=/snap/chromium/current/usr/lib/chromium-browser/chrome
```

### Restart Your Application

```bash
# If using PM2
pm2 restart chainpaye-whatsapp

# If using systemd
sudo systemctl restart chainpaye-whatsapp

# Or just restart the process
```

---

## Verify It Works

### Test Receipt Generation

```bash
npx tsx utils/testReceiptGeneration.ts
```

You should see:

```
[Receipt Generation] Platform: linux
[Receipt Generation] Possible Chromium paths: [
  '/snap/bin/chromium',
  '/snap/chromium/current/usr/lib/chromium-browser/chrome',
  ...
]
[Receipt Generation] Puppeteer launched successfully
...
✅ Receipt generated successfully!
```

---

## Common Snap Chromium Issues

### Issue 1: Permission Denied

**Error:**
```
Error: Failed to launch the browser process!
/snap/bin/chromium: Permission denied
```

**Fix:**
```bash
# Check permissions
ls -la /snap/bin/chromium

# Chromium should be executable
# If not, reinstall:
sudo snap remove chromium
sudo snap install chromium
```

---

### Issue 2: Snap Confinement Issues

Snap apps run in a confined environment. If you get sandbox errors:

**Error:**
```
Failed to move to new namespace
```

**Fix:**
Add these args to Puppeteer launch (already included in the code):
```javascript
args: [
  "--no-sandbox",
  "--disable-setuid-sandbox",
]
```

---

### Issue 3: Missing Shared Libraries

**Error:**
```
error while loading shared libraries
```

**Fix:**
```bash
# Update Snap
sudo snap refresh chromium

# Or reinstall
sudo snap remove chromium
sudo snap install chromium
```

---

## Alternative: Install Chromium via APT

If Snap continues to cause issues, you can install Chromium via APT instead:

```bash
# Remove Snap version
sudo snap remove chromium

# Install via APT
sudo apt-get update
sudo apt-get install chromium-browser

# Verify
which chromium-browser
# Output: /usr/bin/chromium-browser
```

The code will automatically detect the APT version.

---

## Debugging

### Check Which Path is Being Used

Look at the logs when receipt generation runs:

```bash
tail -f logs/combined.log | grep "Chromium paths"
```

You'll see:
```
[Receipt Generation] Possible Chromium paths: ['/snap/bin/chromium', ...]
```

### Test Chromium Directly

```bash
# Test if Chromium launches
/snap/bin/chromium --version

# Test with Puppeteer args
/snap/bin/chromium --no-sandbox --disable-setuid-sandbox --version
```

### Check Snap Status

```bash
# List installed snaps
snap list | grep chromium

# Check Chromium info
snap info chromium

# Check Chromium connections
snap connections chromium
```

---

## Production Deployment Checklist

- [ ] Deploy updated code with Snap paths
- [ ] Verify Chromium is installed: `which chromium`
- [ ] Test receipt generation: `npx tsx utils/testReceiptGeneration.ts`
- [ ] Check logs for Chromium path detection
- [ ] If needed, set `PUPPETEER_EXECUTABLE_PATH` in `.env`
- [ ] Restart application
- [ ] Test with real transaction
- [ ] Monitor logs: `tail -f logs/combined.log | grep "\[Receipt"`

---

## Quick Test Command

```bash
# One-line test to verify Chromium works with Puppeteer
npx tsx utils/testReceiptGeneration.ts && echo "✅ Receipts working!" || echo "❌ Receipts failed!"
```

---

## Support

If issues persist:

1. Check Chromium path:
   ```bash
   which chromium
   ls -la /snap/bin/chromium
   readlink -f /snap/bin/chromium
   ```

2. Test Chromium directly:
   ```bash
   /snap/bin/chromium --version
   ```

3. Check logs:
   ```bash
   grep "Chromium paths" logs/combined.log
   grep "Puppeteer launched" logs/combined.log
   ```

4. Try setting explicit path in `.env`:
   ```bash
   PUPPETEER_EXECUTABLE_PATH=/snap/bin/chromium
   ```
