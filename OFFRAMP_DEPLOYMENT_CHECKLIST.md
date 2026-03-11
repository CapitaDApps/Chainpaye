# Offramp Updates - Deployment Checklist

## Pre-Deployment

### Code Review
- [x] All TypeScript files compile without errors
- [x] No diagnostic issues found
- [x] All existing tests pass
- [x] Code follows project conventions
- [x] Error handling implemented properly
- [x] Logging added for debugging

### Files to Deploy

#### New Files (3)
- [ ] `utils/generateOfframpReceipt.ts`
- [ ] `utils/sendOfframpReceipt.ts`
- [ ] `templates/offrampReceipt.hbs`

#### Modified Files (1)
- [ ] `webhooks/services/cryptoTopUp.service.ts`

#### Documentation (4)
- [ ] `OFFRAMP_REFERRAL_FIX.md`
- [ ] `OFFRAMP_RECEIPT_IMPLEMENTATION.md`
- [ ] `OFFRAMP_UPDATES_SUMMARY.md`
- [ ] `OFFRAMP_QUICK_REFERENCE.md`

### Dependencies Check
- [ ] Puppeteer installed (`npm list puppeteer`)
- [ ] Chromium browser available at `/usr/bin/chromium-browser`
- [ ] Handlebars installed (`npm list handlebars`)
- [ ] fs-extra installed (`npm list fs-extra`)

### Server Requirements
- [ ] MongoDB transactions enabled
- [ ] WhatsApp Business API configured
- [ ] Sufficient disk space for Puppeteer
- [ ] Memory available for browser rendering (min 512MB)

## Deployment Steps

### 1. Backup
```bash
# Backup current version
git stash
git checkout -b backup-before-offramp-updates
git stash pop
git commit -am "Backup before offramp updates"
```

### 2. Deploy Files
```bash
# Pull latest changes
git pull origin main

# Install dependencies (if needed)
npm install

# Build TypeScript
npm run build
```

### 3. Restart Services
```bash
# Using PM2
pm2 restart all

# Or using your deployment method
npm run restart
```

### 4. Verify Deployment
```bash
# Check logs for startup errors
pm2 logs

# Verify no TypeScript errors
npm run build
```

## Post-Deployment Testing

### Test 1: Referral Earnings
- [ ] Create test referral relationship
- [ ] Complete test offramp transaction
- [ ] Verify referrer points increased
- [ ] Check logs: `grep "Referral earnings processed" logs`
- [ ] Verify earnings transaction in database

### Test 2: Receipt Generation
- [ ] Complete test offramp transaction
- [ ] Verify receipt received on WhatsApp
- [ ] Check all fields are correct:
  - [ ] NGN amount
  - [ ] Crypto spent (USD)
  - [ ] Bank name
  - [ ] Account name
  - [ ] Account number
  - [ ] Date/time
  - [ ] Transaction reference
- [ ] Check logs: `grep "Offramp Receipt" logs`

### Test 3: Error Handling
- [ ] Test with invalid referral data (should not break)
- [ ] Test with receipt generation failure (should not break)
- [ ] Verify offramp still completes successfully
- [ ] Check error logs are informative

### Test 4: Performance
- [ ] Measure offramp completion time
- [ ] Verify no blocking delays
- [ ] Check memory usage during receipt generation
- [ ] Monitor CPU usage

## Monitoring

### Logs to Watch (First 24 Hours)
```bash
# Success patterns
grep "Referral earnings processed" logs | wc -l
grep "Receipt sent successfully" logs | wc -l

# Error patterns
grep "Failed to process referral earnings" logs
grep "Error sending receipt" logs

# Performance
grep "Receipt generated successfully" logs
```

### Metrics to Track
- [ ] Referral earnings success rate (target: >95%)
- [ ] Receipt delivery success rate (target: >90%)
- [ ] Average receipt generation time (target: <3s)
- [ ] Offramp transaction success rate (should remain unchanged)

### Alerts to Set Up
- [ ] Alert if referral processing fails >5% of time
- [ ] Alert if receipt generation fails >10% of time
- [ ] Alert if offramp success rate drops
- [ ] Alert on memory/CPU spikes

## Rollback Plan

### If Issues Occur

#### Quick Disable (No Deployment)
Comment out the new code blocks in `webhooks/services/cryptoTopUp.service.ts`:

```typescript
// Comment out receipt block (lines ~165-195)
// Comment out referral block (lines ~197-220)
```

Then restart:
```bash
pm2 restart all
```

#### Full Rollback
```bash
# Revert to previous version
git revert HEAD
git push origin main

# Redeploy
npm run build
pm2 restart all
```

## Success Criteria

### Must Have (Blocking)
- [x] Code compiles without errors
- [ ] Offramp transactions complete successfully
- [ ] No increase in error rates
- [ ] Services start without issues

### Should Have (Non-Blocking)
- [ ] Receipts delivered to >90% of users
- [ ] Referral earnings credited correctly
- [ ] Logs show expected patterns
- [ ] Performance within acceptable range

## Sign-Off

- [ ] Developer: Code reviewed and tested
- [ ] QA: Test cases passed
- [ ] DevOps: Deployment successful
- [ ] Product: Features working as expected

## Notes

Date Deployed: _______________
Deployed By: _______________
Version/Commit: _______________
Issues Encountered: _______________
Resolution: _______________
