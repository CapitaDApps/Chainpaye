# Offramp Transaction Recording - Deployment Checklist

## Pre-Deployment Verification ✅

### 1. Code Quality Checks
- [x] All TypeScript errors resolved
- [x] Proper error handling implemented
- [x] Null safety checks in place
- [x] Code follows existing patterns
- [x] No breaking changes to existing functionality

### 2. Database Schema
- [x] Transaction model supports offramp fields
- [x] Proper indexing on referenceId field
- [x] Bank details schema defined
- [x] Status enum includes all required values

### 3. API Endpoints
- [x] User transaction history endpoint
- [x] Admin transaction history endpoint
- [x] Transaction details endpoint
- [x] Proper input validation
- [x] Pagination implemented
- [x] Error responses standardized

### 4. Integration Points
- [x] Crossmint transfer integration
- [x] DexPay completion integration
- [x] Redis pattern matching
- [x] Background processing
- [x] Idempotency protection

## Environment Configuration

### Required Environment Variables
```bash
# Existing variables (already configured)
MONGODB_URI=mongodb://...
REDIS_URL=redis://...

# Offramp specific (if not already set)
OFFRAMP_FLAT_FEE_USD=0.75
OFFRAMP_MIN_AMOUNT_NGN=5000
OFFRAMP_MAX_AMOUNT_NGN=10000000
OFFRAMP_SPREAD_NGN=60
```

### Database Indexes
Ensure these indexes exist for optimal performance:
```javascript
// Transaction collection indexes
db.transactions.createIndex({ "referenceId": 1 }, { unique: true })
db.transactions.createIndex({ "fromUser": 1, "createdAt": -1 })
db.transactions.createIndex({ "status": 1, "type": 1 })
db.transactions.createIndex({ "createdAt": -1 })
```

## Testing Checklist

### 1. Unit Tests
- [x] TransactionService.recordOfframp()
- [x] TransactionService.updateOfframpStatus()
- [x] TransactionService.getTransactionHistory()
- [x] API controller validation

### 2. Integration Tests
- [ ] End-to-end offramp flow
- [ ] API endpoint responses
- [ ] Database transaction recording
- [ ] Redis integration

### 3. Manual Testing
Run the test script:
```bash
npm run test:offramp-transactions
```

### 4. API Testing
Test all endpoints with curl or Postman:
```bash
# User history
curl -X GET "http://localhost:3000/api/transactions/user/USER_ID?page=1&limit=20"

# Admin history
curl -X GET "http://localhost:3000/api/transactions/admin?status=completed"

# Transaction details
curl -X GET "http://localhost:3000/api/transactions/REFERENCE_ID"
```

## Deployment Steps

### 1. Database Migration
No schema changes required - existing Transaction model supports new fields.

### 2. Code Deployment
1. Deploy updated code to staging environment
2. Run integration tests
3. Verify API endpoints work correctly
4. Test complete offramp flow
5. Deploy to production

### 3. Monitoring Setup
Monitor these metrics post-deployment:
- Transaction recording success rate
- API endpoint response times
- Database query performance
- Error rates in offramp flow

## Rollback Plan

### If Issues Occur:
1. **API Issues**: Disable transaction API routes in webhooks/index.ts
2. **Recording Issues**: Comment out recording calls in cryptoTopUp.service.ts
3. **Database Issues**: Revert to previous version and investigate

### Safe Rollback Points:
- Transaction recording is non-blocking (failures don't stop offramp)
- API endpoints are separate from core offramp flow
- All changes are additive (no existing functionality modified)

## Post-Deployment Verification

### 1. Functional Tests
- [ ] Complete an offramp transaction
- [ ] Verify transaction is recorded with PROCESSING status
- [ ] Verify status updates to COMPLETED after DexPay
- [ ] Check transaction appears in API endpoints

### 2. Performance Tests
- [ ] API response times < 500ms
- [ ] Database queries optimized
- [ ] No memory leaks in background processing

### 3. Error Handling Tests
- [ ] Failed transactions marked as FAILED
- [ ] API handles invalid inputs gracefully
- [ ] Background processing errors don't crash system

## Security Considerations

### 1. API Security
- [ ] Add authentication middleware (future enhancement)
- [ ] Rate limiting on API endpoints
- [ ] Input sanitization and validation
- [ ] Proper error messages (no sensitive data)

### 2. Data Privacy
- [ ] Bank details properly encrypted in database
- [ ] User data access controls
- [ ] Audit logging for admin access

## Monitoring & Alerts

### Key Metrics to Monitor:
1. **Transaction Recording Rate**: Should be 100% for successful offramps
2. **API Response Times**: Should be < 500ms for 95th percentile
3. **Database Performance**: Query execution times
4. **Error Rates**: Failed transaction recordings

### Recommended Alerts:
- Transaction recording failure rate > 5%
- API endpoint error rate > 1%
- Database query time > 1 second
- Redis connection failures

## Documentation Updates

### 1. API Documentation
- [ ] Update API documentation with new endpoints
- [ ] Add example requests/responses
- [ ] Document error codes and messages

### 2. Internal Documentation
- [ ] Update system architecture diagrams
- [ ] Document transaction flow
- [ ] Add troubleshooting guide

## Success Criteria

### Deployment is successful when:
- [x] All TypeScript errors resolved
- [x] Code deployed without breaking existing functionality
- [ ] Transaction recording works for new offramps
- [ ] API endpoints return correct data
- [ ] Performance metrics within acceptable ranges
- [ ] No critical errors in logs

## Contact Information

### For Issues:
- **Database Issues**: Contact DB team
- **API Issues**: Contact backend team  
- **Integration Issues**: Contact payments team

### Emergency Rollback:
If critical issues occur, immediately:
1. Revert to previous code version
2. Notify stakeholders
3. Investigate root cause
4. Plan fix and re-deployment

---

**Deployment Date**: _____________
**Deployed By**: _____________
**Verified By**: _____________