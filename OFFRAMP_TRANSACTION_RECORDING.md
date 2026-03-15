# Offramp Transaction Recording Implementation

## Overview

This implementation adds comprehensive database recording for offramp transactions with proper status tracking and API endpoints for transaction history management.

## Features Implemented

### 1. Database Transaction Recording

**Two-Phase Recording System:**
- **Phase 1**: Record transaction immediately after successful Crossmint token transfer (status: `PROCESSING`)
- **Phase 2**: Update transaction status after DexPay completion (status: `COMPLETED` or `FAILED`)

### 2. Transaction Data Captured

**Core Transaction Fields:**
- `referenceId` - Unique transaction identifier (auto-generated)
- `type` - `OFF_RAMP`
- `status` - `PROCESSING` → `COMPLETED`/`FAILED`
- `fromUser` - User performing the offramp
- `amount` - NGN amount sent to bank
- `totalAmount` - Total crypto spent (including fees)
- `currency` - Token format (e.g., `USDCBASE`, `USDTBSC`)
- `fees` - Transaction fees in USD
- `exchangeRate` - NGN/USD rate used
- `bankDetails` - Recipient bank information
- `description` - Transaction description with DexPay quote ID

**Offramp-Specific Data:**
- `crossmintTransactionId` - Crossmint transfer ID
- `dexPayQuoteId` - DexPay quote ID (added after completion)
- Bank account details (number, name, bank name)
- Chain information (solana, bsc, base, etc.)

### 3. API Endpoints

#### User Transaction History
```
GET /api/transactions/user/:userId
```
**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `status` - Filter by status (pending, processing, completed, failed, cancelled)
- `type` - Filter by type (off_ramp, transfer, deposit, etc.)

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

#### Admin Transaction History
```
GET /api/transactions/admin
```
**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `status` - Filter by status
- `type` - Filter by type
- `userId` - Filter by specific user
- `startDate` - Filter from date (future enhancement)
- `endDate` - Filter to date (future enhancement)

#### Transaction Details
```
GET /api/transactions/:referenceId
```
Returns detailed information for a specific transaction.

## Implementation Details

### 1. TransactionService Extensions

**New Methods Added:**
- `recordOfframp()` - Create initial offramp transaction record
- `updateOfframpStatus()` - Update transaction status and add DexPay quote ID
- `getTransactionHistory()` - Retrieve paginated transaction history with filters
- `getTransactionByReference()` - Get transaction details by reference ID

### 2. Database Integration Points

**In `cryptoTopUp.service.ts`:**

**After Successful Crossmint Transfer:**
```typescript
// Record transaction with PROCESSING status
const offrampTransaction = await TransactionService.recordOfframp({
  refId: `OFFRAMP-${user.userId}-${Date.now()}`,
  crossmintTxId: transferResult.transactionId,
  currency: normalizedAsset,
  status: TransactionStatus.PROCESSING,
  // ... other fields
});
```

**After DexPay Completion (Background):**
```typescript
// Update status to COMPLETED
await TransactionService.updateOfframpStatus({
  referenceId: transactionRef,
  status: TransactionStatus.COMPLETED,
  dexPayQuoteId: quoteId,
});
```

**On Error (Background):**
```typescript
// Update status to FAILED
await TransactionService.updateOfframpStatus({
  referenceId: transactionRef,
  status: TransactionStatus.FAILED,
  failureReason: error.message,
});
```

### 3. Redis Integration

**Transaction Reference Tracking:**
- Store transaction reference ID in Redis for background processing
- Key format: `${idempotencyKey}:txn_ref`
- TTL: 10 minutes (600 seconds)

**Pattern Matching:**
- Added `keys()` method to RedisClient for pattern-based key lookup
- Used to find transaction reference during background processing

### 4. Error Handling

**Graceful Degradation:**
- Database recording failures don't stop the offramp process
- Errors are logged but don't affect user experience
- Background status updates are attempted but failures are handled gracefully

**Transaction Status Flow:**
```
User Submits → PIN Validation → Crossmint Transfer → [DB: PROCESSING]
                                                           ↓
                                                    Background Process
                                                           ↓
                                              DexPay Success/Failure
                                                           ↓
                                                [DB: COMPLETED/FAILED]
```

## API Usage Examples

### Get User Transaction History
```bash
# Basic request
curl "http://localhost:3000/api/transactions/user/60f7b3b3b3b3b3b3b3b3b3b3"

# With filters and pagination
curl "http://localhost:3000/api/transactions/user/60f7b3b3b3b3b3b3b3b3b3b3?page=2&limit=10&status=completed&type=off_ramp"
```

### Get Admin Transaction History
```bash
# All transactions
curl "http://localhost:3000/api/transactions/admin"

# Filtered by status and type
curl "http://localhost:3000/api/transactions/admin?status=processing&type=off_ramp&page=1&limit=50"

# Specific user transactions
curl "http://localhost:3000/api/transactions/admin?userId=60f7b3b3b3b3b3b3b3b3b3b3"
```

### Get Transaction Details
```bash
curl "http://localhost:3000/api/transactions/OFFRAMP-user123-1640995200000"
```

## Database Schema

**Transaction Model Extensions:**
- Existing `OFF_RAMP` transaction type is used
- `bankDetails` field stores recipient information
- `description` field includes DexPay quote ID
- `exchangeRate` field stores NGN/USD rate
- `fees` field stores USD fee amount
- `completedAt` timestamp for completion tracking

## Benefits

### 1. Complete Audit Trail
- Every offramp attempt is recorded from initiation to completion
- Full transaction lifecycle tracking
- Detailed error information for failed transactions

### 2. User Experience
- Users can view their complete offramp history
- Transaction status tracking (processing → completed)
- Detailed transaction information available

### 3. Admin Capabilities
- Comprehensive transaction monitoring
- Filtering and pagination for large datasets
- Transaction analytics and reporting capabilities

### 4. Compliance & Support
- Complete transaction records for regulatory compliance
- Detailed information for customer support
- Reconciliation with external services (Crossmint, DexPay)

### 5. Analytics & Monitoring
- Track offramp success rates
- Monitor transaction volumes
- Identify popular banks and chains
- Performance metrics and trends

## Security Considerations

### 1. Data Protection
- Sensitive bank details are stored securely
- User information is properly referenced via ObjectId
- No sensitive data in logs (transaction IDs only)

### 2. Access Control
- API endpoints should be protected with authentication (not implemented yet)
- User endpoints should validate user ownership
- Admin endpoints should require admin privileges

### 3. Rate Limiting
- Transaction history endpoints should have rate limiting
- Prevent abuse of pagination features
- Monitor for suspicious access patterns

## Future Enhancements

### 1. Authentication & Authorization
- Add JWT-based authentication
- Implement role-based access control
- User session management

### 2. Advanced Filtering
- Date range filtering
- Amount range filtering
- Bank-specific filtering
- Chain-specific filtering

### 3. Real-time Updates
- WebSocket notifications for status changes
- Push notifications for mobile apps
- Email notifications for important events

### 4. Analytics Dashboard
- Transaction volume charts
- Success rate metrics
- Popular banks and chains
- Revenue tracking

### 5. Export Capabilities
- CSV export for transaction history
- PDF reports for specific periods
- Integration with accounting systems

## Testing

### 1. Unit Tests
- Test TransactionService methods
- Test API endpoint responses
- Test error handling scenarios

### 2. Integration Tests
- Test complete offramp flow with database recording
- Test background processing status updates
- Test Redis integration

### 3. Load Testing
- Test API endpoints under load
- Test database performance with large datasets
- Test pagination efficiency

## Deployment Checklist

- [ ] Database migrations (if needed)
- [ ] Environment variables configured
- [ ] Redis `keys()` method available
- [ ] API endpoints accessible
- [ ] Error monitoring in place
- [ ] Performance monitoring configured
- [ ] Backup procedures updated

## Monitoring & Alerts

### 1. Key Metrics
- Transaction recording success rate
- API endpoint response times
- Database query performance
- Background processing success rate

### 2. Alerts
- Failed transaction recordings
- High API error rates
- Database connection issues
- Redis connectivity problems

### 3. Logging
- All transaction operations logged
- API access patterns tracked
- Error details captured
- Performance metrics recorded