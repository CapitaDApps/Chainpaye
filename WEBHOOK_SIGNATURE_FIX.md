# Webhook Signature Verification Error Fix

## Problem
```
Error: Request Signature did not match
Invalid webhook signature received
```

This means the `APP_SECRET` in your `.env` file doesn't match what Meta/WhatsApp has configured.

---

## Solution

### Step 1: Get Your App Secret from Meta

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Select your app
3. Go to **App Settings** → **Basic**
4. Find **App Secret** (click "Show" to reveal it)
5. Copy the secret

### Step 2: Update Your .env File

```bash
# Open your .env file
nano .env

# Update or add this line:
APP_SECRET=your_actual_app_secret_here

# Save and exit (Ctrl+X, then Y, then Enter)
```

### Step 3: Restart Your Application

```bash
# If using PM2
pm2 restart chainpaye-whatsapp

# If using systemd
sudo systemctl restart chainpaye-whatsapp

# Or just restart the process
```

### Step 4: Verify It Works

Check the logs:
```bash
# With PM2
pm2 logs chainpaye-whatsapp --lines 50

# Or tail the log file
tail -f logs/combined.log
```

You should no longer see "Request Signature did not match" errors.

---

## Troubleshooting

### Issue 1: Still Getting Signature Errors

**Check if APP_SECRET is set:**
```bash
cat .env | grep APP_SECRET
```

**Check the length:**
The enhanced logging now shows:
```
APP_SECRET configured: Yes (length: 32)
```

If the length is wrong, you copied the wrong value.

---

### Issue 2: APP_SECRET is Correct But Still Failing

**Possible causes:**

1. **Whitespace in .env file**
   ```bash
   # Wrong (has spaces)
   APP_SECRET = abc123

   # Correct (no spaces)
   APP_SECRET=abc123
   ```

2. **Quotes in .env file**
   ```bash
   # Wrong (has quotes)
   APP_SECRET="abc123"

   # Correct (no quotes)
   APP_SECRET=abc123
   ```

3. **Wrong app in Meta**
   - Make sure you're copying the secret from the correct app
   - Check if you have multiple apps (staging/production)

---

### Issue 3: Want to Temporarily Disable Verification

**For development/testing only:**

In `webhooks/utils/validSignature.ts`, temporarily return `true`:

```typescript
export function isRequestSignatureValid(req: Request) {
  // TEMPORARY: Skip verification for testing
  console.warn("⚠️ Signature verification disabled for testing");
  return true;
  
  // ... rest of the code
}
```

**⚠️ WARNING:** Never deploy this to production! It's a security risk.

---

### Issue 4: Different Secrets for Different Environments

If you have staging and production:

**Staging .env:**
```bash
APP_SECRET=your_staging_app_secret
```

**Production .env:**
```bash
APP_SECRET=your_production_app_secret
```

Make sure each environment uses the correct secret for its Meta app.

---

## Enhanced Logging

The code now logs more details when signature verification fails:

```
Error: Request Signature did not match
Expected signature length: 64
Received signature length: 64
APP_SECRET configured: Yes (length: 32)
```

This helps diagnose:
- If APP_SECRET is missing
- If signature lengths don't match
- If there's a configuration issue

---

## Security Best Practices

1. **Never commit APP_SECRET to git**
   - It should only be in `.env` (which is in `.gitignore`)

2. **Use different secrets for staging/production**
   - Each environment should have its own Meta app and secret

3. **Rotate secrets periodically**
   - Change your APP_SECRET every few months
   - Update in both Meta and your `.env` file

4. **Keep .env file secure**
   ```bash
   # Set proper permissions
   chmod 600 .env
   ```

---

## Quick Fix Checklist

- [ ] Get APP_SECRET from Meta for Developers
- [ ] Update `.env` file with correct secret
- [ ] Remove any spaces or quotes around the value
- [ ] Restart application
- [ ] Check logs for signature errors
- [ ] Test with a real webhook from WhatsApp

---

## Verification

After fixing, you should see:
```
✅ No "Request Signature did not match" errors
✅ Webhooks processing successfully
✅ Messages being received and handled
```

If you still see errors, check the enhanced logging output for clues.
