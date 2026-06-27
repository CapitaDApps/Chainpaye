# Idempotency Implementation - Deployment Checklist

## Pre-Deployment

### 1. Code Review
- [ ] Review all changes in `cryptoTopUp.service.ts`
- [ ] Review all changes in `offrampHandler.ts`
- [ ] Review flow changes in `offramp_flow.json`
- [ ] Verify no TypeScript errors: `npm run build` or `tsc --noEmit`

### 2. Environment Check
- [ ] Verify Redis is running and accessible
- [ ] Test Redis connection: `redis-cli ping` should return `PONG`
- [ ] Verify Redis has sufficient memory for keys
- [ ] Check Redis persistence settings (optional but recommended)

### 3. Testing (Staging/Development)
- [ ] Test normal offramp flow (should work as before)
- [ ] Test duplicate PIN submission (should be blocked)
- [ ] Test duplicate flow submission (should be blocked)
- [ ] Test retry after failure (should work)
- [ ] Test retry after 10+ minutes (should work)
- [ ] Verify error messages display correctly in flow
- [ ] Verify error messages display correctly in WhatsApp chat

## Deployment Steps

### Step 1: Deploy Code Changes
```bash
# Pull latest changes
git pull origin main

# Install dependencies (if needed)
npm install

# Build TypeScript
npm run build

# Restart application
pm2 restart chainpaye
# OR
npm run start
```

### Step 2: Update WhatsApp Flow
**CRITICAL**: The flow JSON must be updated in Meta Business Suite

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Navigate to: WhatsApp Manager → Flows
3. Find your "Off-Ramp (Sell Crypto)" flow
4. Click "Edit"
5. Go to "JSON" tab
6. Upload the updated `offramp_flow.json` file
7. Click "Publish"
8. Wait for flow to be approved (usually instant for minor changes)

**Note**: Code changes won't show error messages properly until flow is updated!

### Step 3: Verify Deployment
- [ ] Check application logs for startup errors
- [ ] Verify Redis connection in logs
- [ ] Test a small offramp transaction end-to-end
- [ ] Verify idempotency logs appear: `[OFFRAMP] Idempotency check passed`

## Post-Deployment Monitoring

### First Hour
- [ ] Monitor application logs for errors
- [ ] Check Redis memory usage
- [ ] Monitor for blocked duplicate attempts
- [ ] Verify no legitimate transactions are blocked

### First Day
- [ ] Review blocked duplicate attempt count
- [ ] Check for any expired locks (indicates crashes)
- [ ] Monitor user complaints about blocked transactions
- [ ] Verify cleanup logic is working (keys expire properly)

### First Week
- [ ] Analyze duplicate attempt patterns
- [ ] Review average time between duplicate attempts
- [ ] Check for any edge cases not covered
- [ ] Gather user feedback

## Monitoring Commands

### Check Redis Keys
```bash
# Count active offramp transaction keys
redis-cli KEYS "offramp:transaction:*" | wc -l

# Count active PIN submission keys
redis-cli KEYS "offramp:pin:*" | wc -l

# View a specific key
redis-cli GET "offramp:transaction:abc123..."

# Check TTL of a key
redis-cli TTL "offramp:transaction:abc123..."
```

### Check Application Logs
```bash
# View recent idempotency logs
pm2 logs chainpaye | grep "Idempotency"

# View blocked duplicate attempts
pm2 logs chainpaye | grep "Duplicate transaction attempt"

# View duplicate PIN submissions
pm2 logs chainpaye | grep "Duplicate PIN submission"
```

### Monitor Redis Memory
```bash
# Check Redis memory usage
redis-cli INFO memory

# Check number of keys
redis-cli DBSIZE
```

## Rollback Plan

If critical issues arise:

### Option 1: Quick Disable (Keep Code, Disable Checks)
1. Comment out idempotency check blocks in code
2. Redeploy application
3. Flow changes are harmless (just won't show errors)

### Option 2: Full Rollback
1. Revert to previous git commit
2. Redeploy application
3. Revert flow in Meta Business Suite (optional)

```bash
# Find previous commit
git log --oneline -10

# Revert to previous commit
git revert <commit-hash>

# Or reset (if not pushed to production yet)
git reset --hard <previous-commit-hash>

# Redeploy
npm run build
pm2 restart chainpaye
```

## Troubleshooting

### Issue: Legitimate transactions being blocked
**Symptoms**: Users report "Transaction already in progress" but they haven't submitted before

**Possible Causes**:
1. Previous transaction crashed and left lock
2. TTL too long
3. Transaction identifier collision (very rare)

**Solution**:
```bash
# Manually delete stuck key
redis-cli DEL "offramp:transaction:<key>"

# Or flush all offramp keys (use with caution!)
redis-cli KEYS "offramp:*" | xargs redis-cli DEL
```

### Issue: Duplicate transactions still going through
**Symptoms**: Users charged twice for same transaction

**Possible Causes**:
1. Redis connection failed
2. Code not deployed properly
3. Race condition in Redis operations

**Solution**:
1. Check Redis connection in logs
2. Verify code is deployed: check file timestamps
3. Add Redis transaction (MULTI/EXEC) for atomic operations

### Issue: Error messages not showing in flow
**Symptoms**: Users don't see idempotency errors in WhatsApp flow

**Possible Causes**:
1. Flow not updated in Meta Business Suite
2. Flow not published
3. Flow approval pending

**Solution**:
1. Re-upload flow JSON to Meta Business Suite
2. Publish the flow
3. Wait for approval (usually instant)

### Issue: High Redis memory usage
**Symptoms**: Redis memory growing continuously

**Possible Causes**:
1. Keys not expiring (TTL not set)
2. Too many transactions
3. Memory leak

**Solution**:
```bash
# Check keys without TTL
redis-cli KEYS "offramp:*" | while read key; do
  ttl=$(redis-cli TTL "$key")
  if [ "$ttl" = "-1" ]; then
    echo "Key without TTL: $key"
  fi
done

# Set TTL on keys without expiration
redis-cli KEYS "offramp:*" | while read key; do
  redis-cli EXPIRE "$key" 600
done
```

## Success Metrics

### Week 1 Targets
- [ ] Zero double-spending incidents
- [ ] < 5% false positive blocks (legitimate transactions blocked)
- [ ] < 10ms average latency increase
- [ ] > 95% user satisfaction (no complaints about blocks)

### Month 1 Targets
- [ ] Zero double-spending incidents
- [ ] < 2% false positive blocks
- [ ] Identify and fix any edge cases
- [ ] Optimize TTL values based on data

## Configuration Tuning

Based on monitoring data, you may want to adjust:

### TTL Values
```typescript
// In cryptoTopUp.service.ts and offrampHandler.ts

// Processing state TTL (currently 10 minutes)
'EX', 600  // Increase if transactions take longer
           // Decrease if you want faster recovery from crashes

// Completed state TTL (currently 5 minutes)
'EX', 300  // Increase to prevent more duplicate attempts
           // Decrease to allow faster legitimate retries
```

### Transaction Identifier
```typescript
// If you get false positives (different transactions blocked)
// Consider adding more fields to make identifier more unique:
const transactionIdentifier = `${userId}:${amount}:${bank}:${account}:${asset}:${chain}:${timestamp}`;
```

## Support

### User Reports Blocked Transaction
1. Get transaction details from user
2. Check Redis for key: `redis-cli KEYS "*${userId}*"`
3. Check key value: `redis-cli GET "offramp:transaction:..."`
4. If stuck, delete key: `redis-cli DEL "offramp:transaction:..."`
5. Ask user to retry

### Developer Debugging
```bash
# Enable debug logging
export LOG_LEVEL=debug

# Watch Redis operations in real-time
redis-cli MONITOR | grep "offramp"

# Check application logs
tail -f logs/combined.log | grep "OFFRAMP"
```

## Documentation Links

- [Idempotency Implementation Details](./IDEMPOTENCY_IMPLEMENTATION.md)
- [Offramp Fee Update Summary](./OFFRAMP_FEE_UPDATE_SUMMARY.md)
- [Redis Documentation](https://redis.io/docs/)
- [WhatsApp Flows Documentation](https://developers.facebook.com/docs/whatsapp/flows)

---

**Deployment Date**: _____________
**Deployed By**: _____________
**Verified By**: _____________
**Status**: ⬜ Pending / ⬜ In Progress / ⬜ Complete / ⬜ Rolled Back
