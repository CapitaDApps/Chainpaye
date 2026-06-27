# Referral System Update - Deployment Checklist

## 📋 Pre-Deployment Checklist

### 1. Code Changes ✅
- [x] Updated EarningsService to 1% calculation
- [x] Updated WithdrawalService minimum to $20
- [x] Updated referral handler dashboard messages
- [x] Updated EarningsTransaction model description
- [x] Updated TransactionManager to pass sellAmountUsd
- [x] Updated all tests for new model
- [x] Created validation script

### 2. Testing 🧪

#### Unit Tests
```bash
npm test services/EarningsService.test.ts
npm test services/WithdrawalService.test.ts
```
- [ ] All EarningsService tests pass
- [ ] All WithdrawalService tests pass
- [ ] Property-based tests pass

#### Validation Script
```bash
npm run validate-referral
```
- [ ] Sample validation runs successfully
- [ ] Calculations are accurate (1% of volume)
- [ ] Break-even point is $25

#### Live Database Validation (if applicable)
```bash
npm run validate-referral:live
```
- [ ] No invalid balances found
- [ ] CSV report generated successfully
- [ ] Transaction distribution looks reasonable

### 3. Code Review 👀
- [ ] Review EarningsService changes
- [ ] Review TransactionManager sellAmountUsd calculation
- [ ] Verify exchange rate direction (NGN/USD not USD/NGN)
- [ ] Check that 60 NGN spread is included
- [ ] Review test coverage

### 4. Documentation 📚
- [ ] Review REFERRAL_PERCENTAGE_UPDATE.md
- [ ] Review VALIDATION_QUICKSTART.md
- [ ] Update user-facing documentation
- [ ] Update API documentation (if applicable)
- [ ] Update FAQ/help docs

### 5. Environment Configuration 🔧
- [ ] Verify MONGODB_URI is set
- [ ] Verify OFFRAMP_FLAT_FEE_USD is set ($0.75)
- [ ] Verify OFFRAMP_SPREAD_NGN is set (60)
- [ ] Check all other environment variables

### 6. Database Preparation 💾
- [ ] Backup production database
- [ ] Verify database indexes are in place
- [ ] Check PointsBalance collection integrity
- [ ] Check EarningsTransaction collection

### 7. Monitoring Setup 📊
- [ ] Set up alerts for earnings calculation errors
- [ ] Set up alerts for withdrawal validation failures
- [ ] Set up dashboard for monitoring earnings
- [ ] Prepare to monitor first few transactions closely

## 🚀 Deployment Steps

### Step 1: Deploy to Staging
```bash
# Deploy code to staging environment
git checkout main
git pull origin main
# Deploy to staging
```

- [ ] Code deployed to staging
- [ ] Run validation script in staging
- [ ] Test complete offramp flow
- [ ] Verify earnings calculation
- [ ] Test withdrawal with $20 minimum
- [ ] Check logs for errors

### Step 2: Staging Validation
Create test referral relationship and complete test transactions:

```bash
# In staging environment
npm run validate-referral:live -- --limit=10
```

- [ ] Test $10 transaction (should earn $0.10)
- [ ] Test $25 transaction (should earn $0.25)
- [ ] Test $50 transaction (should earn $0.50)
- [ ] Test $100 transaction (should earn $1.00)
- [ ] Verify earnings are credited correctly
- [ ] Test withdrawal with $20 minimum

### Step 3: Production Deployment
```bash
# Deploy to production
git checkout main
git pull origin main
# Deploy to production
```

- [ ] Code deployed to production
- [ ] Verify deployment successful
- [ ] Check application is running
- [ ] Monitor logs for errors

### Step 4: Post-Deployment Monitoring

#### First Hour
- [ ] Monitor first 5 transactions closely
- [ ] Verify earnings calculations are correct
- [ ] Check for any errors in logs
- [ ] Verify points balances update correctly

#### First Day
- [ ] Review all earnings transactions
- [ ] Check withdrawal requests
- [ ] Monitor error rates
- [ ] Review user feedback (if any)

#### First Week
- [ ] Analyze earnings distribution
- [ ] Compare with projections
- [ ] Monitor withdrawal patterns
- [ ] Check for any anomalies

## 🔍 Validation Queries

### Check Recent Earnings
```javascript
// MongoDB query
db.earningstransactions.find().sort({timestamp: -1}).limit(10)
```

### Verify Calculation
```javascript
// For each transaction, verify:
// earnings = feeAmount
// feeAmount ≈ transactionAmount * 0.01 (within rounding)
```

### Check Points Balances
```javascript
// Verify integrity
db.pointsbalances.find({
  $expr: { $lt: ["$totalEarned", "$currentBalance"] }
})
// Should return 0 documents
```

## 🚨 Rollback Plan

If critical issues are found:

### Step 1: Immediate Actions
1. Stop processing new referral earnings
2. Document the issue
3. Notify team

### Step 2: Rollback Code
```bash
# Revert to previous version
git revert <commit-hash>
git push origin main
# Deploy previous version
```

### Step 3: Data Cleanup (if needed)
- Review affected transactions
- Calculate correct earnings
- Manual adjustment if necessary
- Document all changes

## ✅ Success Criteria

Deployment is successful if:
- [x] All tests pass
- [x] Validation script runs without errors
- [x] First 10 transactions calculate correctly
- [x] No invalid balances detected
- [x] Withdrawals work with $20 minimum
- [x] No critical errors in logs
- [x] User feedback is positive (or neutral)

## 📈 Key Metrics to Track

### Earnings Metrics
- Average earnings per transaction
- Total earnings distributed per day
- Earnings distribution by transaction size
- Comparison with old model projections

### Withdrawal Metrics
- Number of withdrawals per day
- Average withdrawal amount
- Withdrawals in $20-$100 range (new minimum)
- Withdrawal approval time

### System Health
- Error rate in earnings calculation
- Failed transactions
- Balance inconsistencies
- API response times

## 📞 Emergency Contacts

- **Technical Lead**: [Name/Contact]
- **Database Admin**: [Name/Contact]
- **DevOps**: [Name/Contact]
- **Product Owner**: [Name/Contact]

## 📝 Post-Deployment Tasks

### Immediate (Day 1)
- [ ] Send update notification to users
- [ ] Update help documentation
- [ ] Monitor first transactions
- [ ] Review error logs

### Short-term (Week 1)
- [ ] Analyze earnings distribution
- [ ] Review withdrawal patterns
- [ ] Gather user feedback
- [ ] Optimize if needed

### Long-term (Month 1)
- [ ] Generate monthly report
- [ ] Compare with projections
- [ ] Identify optimization opportunities
- [ ] Plan next improvements

## 🎯 Expected Outcomes

### For Referrers
- Higher earnings on transactions > $25
- More transparent earnings (1% is easy to calculate)
- Lower withdrawal barrier ($20 vs $100)
- Better alignment with transaction value

### For Platform
- More predictable cost structure
- Incentivizes referring high-volume users
- Easier to explain to users
- Scales with platform growth

### Metrics Expectations
- Average earnings per transaction: Likely to increase
- Withdrawal frequency: May increase (lower minimum)
- User satisfaction: Should improve (more earnings)
- Referral activity: May increase (better incentives)

## ✨ Final Notes

- This is a significant change to the referral system
- Monitor closely for the first week
- Be prepared to make adjustments
- Communicate clearly with users
- Document any issues and resolutions

**Good luck with the deployment! 🚀**
