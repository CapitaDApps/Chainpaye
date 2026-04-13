# Referral System Review

## Overview
The ChainPaye referral system is a comprehensive implementation that allows users to earn rewards by referring new users. The system  tracks referral relationships, calculates earnings, and manages withdrawals.

## System Architecture

### Core Components

#### 1. **Referral Code Management**
- **Service**: `ReferralCodeGenerator.ts`
- **Functionality**: Generates unique 6-8 character alphanumeric codes
- **Trigger**: Automatically created after KYC completion
- **Storage**: Stored in `User.referralCode` field

#### 2. **Referral Relationship Management**
- **Service**: `ReferralService.ts`, `ReferralRelationshipService.ts`
- **Model**: `ReferralRelationship`
- **Key Features**:
  - Immutable relationships (one referral per user, cannot be changed)
  - Self-referral prevention
  - 30-day earning period from relationship creation
  - Validates referral codes before creating relationships

#### 3. **Earnings Calculation** (UPDATED)
- **Service**: `EarningsService.ts`
- **Current Model**: Flat $0.25 USD per offramp transaction
- **Previous Model**: 25% of 1.5% transaction fee (percentage-based)
- **Earning Period**: 30 days from referral relationship creation
- **Storage**: `PointsBalance` model tracks current balance and total earned

#### 4. **Points & Balance Management**
- **Model**: `PointsBalance`
- **Repository**: `PointsRepository.ts`
- **Conversion**: 1 point = 1 USD
- **Fields**:
  - `currentBalance`: Available points for withdrawal
  - `totalEarned`: Lifetime earnings (never decreases)
  - `lastUpdated`: Timestamp of last balance change

#### 5. **Withdrawal System**
- **Service**: `WithdrawalService.ts`
- **Model**: `WithdrawalRequest`
- **Rules**:
  - Minimum withdrawal: $100
  - Frequency limit: Once per 7 days
  - Security delay: 24-hour approval period
  - Atomic operations with MongoDB transactions

#### 6. **Leaderboard**
- **Service**: `LeaderboardService.ts`
- **Ranking**: By total points earned (descending)
- **Caching**: 5-minute TTL to reduce database load
- **Display**: Top 50 users by default

## User Journey

### 1. **Referrer Journey**
```
1. User completes KYC
   ↓
2. System generates unique referral code
   ↓
3. User shares referral code/link with friends
   ↓
4. Referred users sign up using the code
   ↓
5. Referrer earns $0.25 per offramp transaction (30 days)
   ↓
6. Points accumulate in PointsBalance
   ↓
7. User can withdraw when balance ≥ $100
```

### 2. **Referee Journey**
```
1. User receives referral link/code
   ↓
2. Code stored in Redis temporarily (optional)
   ↓
3. User starts signup flow
   ↓
4. Referral code pre-populated (if stored) or manually entered
   ↓
5. System validates code during signup
   ↓
6. Immutable referral relationship created
   ↓
7. User's offramp transactions generate earnings for referrer (30 days)
```

## Data Models

### ReferralRelationship
```typescript
{
  referrerId: string;        // User who owns the referral code
  referredUserId: string;    // User who used the code (unique)
  referralCode: string;      // The code that was used
  createdAt: Date;          // Relationship creation time
  expiresAt: Date;          // 30 days after createdAt
}
```

### PointsBalance
```typescript
{
  userId: string;           // User ID (unique)
  currentBalance: number;   // Available points (≥ 0)
  totalEarned: number;      // Lifetime earnings (≥ currentBalance)
  lastUpdated: Date;        // Last modification timestamp
}
```

### EarningsTransaction
```typescript
{
  userId: string;                // Referrer's user ID
  referredUserId: string;        // Referee's user ID
  offrampTransactionId: string;  // Transaction that generated earnings
  amount: number;                // Earnings amount ($0.25)
  feeAmount: number;             // Same as amount ($0.25)
  transactionAmount: number;     // Original transaction amount
  timestamp: Date;               // When earnings were credited
}
```

### WithdrawalRequest
```typescript
{
  userId: string;
  amount: number;
  status: 'pending' | 'approved' | 'completed' | 'failed';
  requestedAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  bankTransferId?: string;
  failureReason?: string;
}
```

## Business Rules

### Referral Code Rules
1. ✅ Generated after KYC completion
2. ✅ 6-8 characters, alphanumeric
3. ✅ Unique across all users
4. ✅ Case-insensitive validation
5. ✅ Permanent (never changes)

### Referral Relationship Rules
1. ✅ **Immutable**: One referral per user, cannot be changed
2. ✅ **Self-referral prevention**: Cannot use own code
3. ✅ **Validation**: Code must exist in system
4. ✅ **30-day earning period**: Earnings only for 30 days after relationship creation
5. ✅ **Relationship persistence**: Relationship data persists beyond 30 days (for analytics)

### Earnings Rules (UPDATED)
1. ✅ **Flat fee**: $0.25 USD per offramp transaction
2. ✅ **Time-bound**: Only transactions within 30 days of referral relationship
3. ✅ **Automatic**: Triggered on successful offramp completion
4. ✅ **Atomic**: Uses MongoDB transactions for consistency
5. ✅ **Audit trail**: All earnings logged in EarningsTransaction

### Withdrawal Rules
1. ✅ **Minimum amount**: $100
2. ✅ **Frequency**: Once per 7 days
3. ✅ **Security delay**: 24-hour approval period
4. ✅ **Sufficient balance**: Must have enough points
5. ✅ **Atomic operations**: Balance debit and transfer are transactional

## Integration Points

### 1. **KYC Completion**
- **Trigger**: User completes KYC verification
- **Action**: Generate referral code via `ReferralService.createReferralCode()`
- **Handler**: `webhooks/controllers/referral.controller.ts::handleKYCCompletion()`

### 2. **Signup Flow**
- **Pre-population**: Retrieve stored code from Redis
- **Validation**: Validate code during signup
- **Relationship Creation**: Create immutable relationship
- **Service**: `SignupIntegrationService.ts`

### 3. **Offramp Transaction**
- **Trigger**: Successful offramp completion
- **Action**: Credit $0.25 to referrer if within 30-day period
- **Handler**: `services/crypto-off-ramp/TransactionManager.ts`
- **Flow**: TransactionManager → handleOfframpTransaction → processTransactionEarnings

### 4. **WhatsApp Commands**
- **`referral`**: Display dashboard with stats
- **`withdraw [amount]`**: Request withdrawal
- **Handler**: `commands/handlers/referralHandler.ts`

## Redis Integration

### Purpose
Temporarily store referral codes when users click referral links before signup.

### Flow
```
1. User clicks referral link
   ↓
2. Code stored in Redis with phone number as key
   ↓
3. TTL: 24 hours
   ↓
4. During signup, code retrieved and pre-populated
   ↓
5. After relationship creation, Redis entry deleted
```

### Services
- **ReferralRedisService.ts**: Store/retrieve/remove codes
- **ReferralCaptureService.ts**: Handle link clicks and storage

## Validation Layers

### 1. **Format Validation**
- Code length (6-8 characters)
- Alphanumeric only
- Case-insensitive

### 2. **Business Rule Validation**
- Code exists in system
- Not self-referral
- No existing referral relationship
- User exists

### 3. **Timing Validation**
- Within 30-day earning period
- Withdrawal frequency (7 days)
- Withdrawal approval delay (24 hours)

## Error Handling

### Custom Errors
- `InvalidReferralCodeError`: Code doesn't exist or invalid format
- `SelfReferralError`: User trying to use own code
- `DuplicateReferralError`: User already has referral relationship

### Error Types
- `INVALID_CODE`: Code validation failed
- `SELF_REFERRAL`: Self-referral attempt
- `DUPLICATE_RELATIONSHIP`: Already referred
- `USER_NOT_FOUND`: User doesn't exist
- `SYSTEM_ERROR`: Unexpected error

## Testing Coverage

### Unit Tests
- ✅ Earnings calculation (flat $0.25)
- ✅ Referral code generation
- ✅ Validation logic
- ✅ Withdrawal rules

### Property-Based Tests
- ✅ Flat earnings consistency
- ✅ Earnings within referral period
- ✅ No earnings after period
- ✅ Relationship persistence
- ✅ Decimal precision

### Integration Tests
- ✅ End-to-end referral flow
- ✅ Signup integration
- ✅ Redis cleanup

## Security Considerations

### 1. **Immutability**
- Referral relationships cannot be modified after creation
- Prevents gaming the system

### 2. **Self-Referral Prevention**
- Validates referrer ≠ referee
- Prevents users from referring themselves

### 3. **Withdrawal Security**
- 24-hour delay before approval
- Frequency limits (once per 7 days)
- Minimum threshold ($100)

### 4. **Atomic Operations**
- MongoDB transactions for balance updates
- Rollback on failure
- Prevents double-spending

### 5. **Audit Trail**
- All earnings logged in EarningsTransaction
- Withdrawal history maintained
- Timestamps for all operations

## Performance Optimizations

### 1. **Database Indexes**
- `ReferralRelationship.referredUserId` (unique)
- `ReferralRelationship.referrerId` (query all referrals)
- `ReferralRelationship.referralCode` (fast validation)
- `PointsBalance.userId` (unique)
- `PointsBalance.totalEarned` (leaderboard queries)

### 2. **Caching**
- Leaderboard cached for 5 minutes
- Reduces database load for frequent queries

### 3. **Redis for Temporary Storage**
- Referral codes stored temporarily
- 24-hour TTL
- Reduces database writes

## Monitoring & Analytics

### Key Metrics
1. **Total referral relationships created**
2. **Active relationships (within 30 days)**
3. **Expired relationships**
4. **Total earnings distributed**
5. **Total withdrawals processed**
6. **Average earnings per referrer**
7. **Conversion rate (clicks → signups)**

### Audit Capabilities
- All earnings transactions logged
- Withdrawal history maintained
- Relationship creation timestamps
- Balance change history

## Known Limitations

### 1. **One-Time Referral**
- Users can only be referred once
- Cannot change referrer after relationship creation
- **Rationale**: Prevents gaming and maintains data integrity

### 2. **30-Day Earning Window**
- Earnings only for 30 days after referral
- **Rationale**: Encourages active referrals and limits liability

### 3. **Withdrawal Constraints**
- Minimum $100
- Once per 7 days
- 24-hour delay
- **Rationale**: Prevents abuse and manages cash flow

### 4. **No Partial Withdrawals**
- Must withdraw full requested amount
- **Consideration**: Could add partial withdrawal support

## Recommendations

### Potential Improvements

#### 1. **Analytics Dashboard**
- Add detailed analytics for referrers
- Show earnings breakdown by referee
- Transaction history per referee

#### 2. **Notification System**
- Notify referrers when they earn
- Notify when withdrawal is approved
- Remind users of pending withdrawals

#### 3. **Referral Tiers**
- Consider tiered rewards for high-volume referrers
- Bonus for reaching milestones (10, 50, 100 referrals)

#### 4. **Withdrawal Flexibility**
- Consider lowering minimum to $50
- Add option for crypto withdrawals
- Faster processing for verified users

#### 5. **Referral Link Tracking**
- Track which channels drive most conversions
- A/B test different referral messages
- Attribution analytics

#### 6. **Fraud Detection**
- Monitor for suspicious patterns
- Flag rapid signups from same IP
- Velocity checks on withdrawals

## Summary

### Strengths
✅ Comprehensive validation and error handling
✅ Immutable relationships prevent gaming
✅ Atomic operations ensure data consistency
✅ Well-tested with unit and property-based tests
✅ Clear separation of concerns
✅ Audit trail for all operations
✅ Security measures (delays, limits, validation)

### Areas for Enhancement
⚠️ Analytics and reporting could be more detailed
⚠️ Notification system not implemented
⚠️ Fraud detection is basic
⚠️ Withdrawal process could be more flexible
⚠️ No referral link tracking/attribution

### Recent Changes
🆕 Updated from percentage-based (25% of 1.5% fee) to flat $0.25 per transaction
🆕 Simplified earnings calculation
🆕 More predictable earnings for referrers
🆕 All tests updated to reflect new model

The referral system is well-architected, secure, and production-ready with the recent flat fee update making it more transparent and easier to understand for users.
