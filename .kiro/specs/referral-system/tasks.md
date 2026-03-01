# Implementation Plan: Referral System

## Overview

This implementation plan breaks down the referral system into discrete coding tasks. The system will be built incrementally, starting with core data models and services, then adding earnings calculation, withdrawal processing, and finally dashboard/leaderboard features. Each major section includes property-based tests to validate correctness properties from the design document.

## Tasks

- [ ] 1. Set up data models and database schemas
  - [x] 1.1 Extend User model with referral fields
    - Add referralCode, referredBy, and referredAt fields to User schema
    - Create database migration for existing users
    - _Requirements: 1.1, 1.4_
  
  - [x] 1.2 Create ReferralRelationship model
    - Define schema with referrerId, referredUserId, referralCode, createdAt, expiresAt
    - Add indexes: referredUserId (unique), referrerId, referralCode
    - _Requirements: 2.2, 8.1_
  
  - [x] 1.3 Create PointsBalance model
    - Define schema with userId, currentBalance, totalEarned, lastUpdated
    - Add indexes: userId (unique), totalEarned (descending)
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [x] 1.4 Create EarningsTransaction model
    - Define schema with userId, referredUserId, offrampTransactionId, amount, feeAmount, transactionAmount, timestamp
    - Add indexes: userId, referredUserId, timestamp
    - _Requirements: 9.4_
  
  - [x] 1.5 Create WithdrawalRequest model
    - Define schema with userId, amount, status, requestedAt, approvedAt, completedAt, failureReason, bankTransferId
    - Add indexes: userId, status, requestedAt
    - _Requirements: 5.3, 9.5_

- [ ] 2. Implement referral code generation service
  - [x] 2.1 Create ReferralCodeGenerator class
    - Implement generateCode() method using crypto.randomBytes
    - Generate alphanumeric codes between 6-12 characters
    - Implement isCodeUnique() method to check database
    - Add retry logic for collision handling (max 5 attempts)
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 2.2 Write property test for code uniqueness
    - **Property 1: Referral code uniqueness**
    - **Validates: Requirements 1.2**
  
  - [x] 2.3 Write property test for code format compliance
    - **Property 2: Referral code format compliance**
    - **Validates: Requirements 1.3**
  
  - [x] 2.4 Write property test for code generation persistence
    - **Property 3: Code generation persistence**
    - **Validates: Requirements 1.1, 1.4**

- [ ] 3. Implement ReferralService for relationship management
  - [x] 3.1 Create ReferralService class
    - Implement createReferralCode() method
    - Implement validateReferralCode() method
    - Implement createReferralRelationship() method with validation
    - Implement getReferralRelationship() method
    - Implement isWithinReferralPeriod() method (check 30-day window)
    - Add self-referral prevention logic
    - Add immutability checks (prevent duplicate referrals)
    - _Requirements: 1.1, 2.1, 2.2, 2.4, 2.5, 8.2_
  
  - [x] 3.2 Write property test for valid code acceptance
    - **Property 4: Valid code acceptance**
    - **Validates: Requirements 2.1, 2.2**
  
  - [x] 3.3 Write property test for invalid code rejection
    - **Property 5: Invalid code rejection**
    - **Validates: Requirements 2.3**
  
  - [x] 3.4 Write property test for referral relationship immutability
    - **Property 6: Referral relationship immutability**
    - **Validates: Requirements 2.4, 9.2**
  
  - [x] 3.5 Write property test for self-referral prevention
    - **Property 7: Self-referral prevention**
    - **Validates: Requirements 2.5**
  
  - [x] 3.6 Write property test for relationship timestamp persistence
    - **Property 8: Relationship timestamp persistence**
    - **Validates: Requirements 8.1**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement earnings calculation service
  - [x] 5.1 Create EarningsService class
    - Implement calculateFee() method (amount * 0.015)
    - Implement calculateReferrerEarnings() method (fee * 0.25)
    - Implement processTransactionEarnings() method
    - Add logic to check referral relationship exists
    - Add logic to check if within 30-day period
    - Add logic to credit points atomically using MongoDB transactions
    - Add earnings transaction logging
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 9.3, 9.4_
  
  - [x] 5.2 Write property test for fee calculation accuracy
    - **Property 9: Fee calculation accuracy**
    - **Validates: Requirements 3.1**
  
  - [x] 5.3 Write property test for referrer earnings calculation accuracy
    - **Property 10: Referrer earnings calculation accuracy**
    - **Validates: Requirements 3.2**
  
  - [x] 5.4 Write property test for earnings within referral period
    - **Property 11: Earnings within referral period**
    - **Validates: Requirements 3.3, 8.3**
  
  - [x] 5.5 Write property test for no earnings after referral period
    - **Property 12: No earnings after referral period**
    - **Validates: Requirements 3.4, 8.4**
  
  - [x] 5.6 Write property test for relationship persistence beyond earning period
    - **Property 13: Relationship persistence beyond earning period**
    - **Validates: Requirements 3.5, 8.5**
  
  - [x] 5.7 Write property test for decimal precision in calculations
    - **Property 14: Decimal precision in calculations**
    - **Validates: Requirements 9.3**

- [ ] 6. Implement PointsRepository for balance management
  - [x] 6.1 Create PointsRepository class
    - Implement getBalance() method
    - Implement getTotalEarned() method
    - Implement creditPoints() method with atomic updates
    - Implement debitPoints() method with atomic updates and validation
    - Implement getEarningsHistory() method
    - Add negative balance prevention logic
    - _Requirements: 4.2, 4.3, 4.4, 4.5_
  
  - [x] 6.2 Write property test for balance increase on earnings
    - **Property 15: Balance increase on earnings**
    - **Validates: Requirements 4.2**
  
  - [x] 6.3 Write property test for balance decrease on withdrawal
    - **Property 16: Balance decrease on withdrawal**
    - **Validates: Requirements 4.3**
  
  - [x] 6.4 Write property test for total earned invariant
    - **Property 17: Total earned invariant**
    - **Validates: Requirements 4.4**
  
  - [x] 6.5 Write property test for non-negative balance invariant
    - **Property 18: Non-negative balance invariant**
    - **Validates: Requirements 4.5**

- [ ] 7. Implement withdrawal service
  - [x] 7.1 Create WithdrawalService class
    - Implement canWithdraw() validation method (check balance >= $100, check 7-day frequency)
    - Implement requestWithdrawal() method
    - Implement approveWithdrawal() method (24-hour delay logic)
    - Implement processWithdrawal() method (debit points, initiate bank transfer)
    - Add error handling with rollback for failed transfers
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_
  
  - [x] 7.2 Write property test for minimum withdrawal validation
    - **Property 19: Minimum withdrawal validation**
    - **Validates: Requirements 5.1, 5.6**
  
  - [x] 7.3 Write property test for withdrawal frequency validation
    - **Property 20: Withdrawal frequency validation**
    - **Validates: Requirements 5.2, 5.6**
  
  - [x] 7.4 Write property test for pending withdrawal creation
    - **Property 21: Pending withdrawal creation**
    - **Validates: Requirements 5.3**
  
  - [x] 7.5 Write property test for withdrawal approval balance deduction
    - **Property 22: Withdrawal approval balance deduction**
    - **Validates: Requirements 5.5**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement dashboard service
  - [x] 9.1 Create DashboardService class
    - Implement getDashboard() method
    - Aggregate referral count from ReferralRelationship collection
    - Aggregate total volume from referred users' transactions
    - Aggregate total fees from referred users' transactions
    - Query current balance and total earned from PointsBalance
    - Format referral link with base URL + referral code
    - Add caching with 30-second TTL
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  
  - [x] 9.2 Write property test for dashboard completeness
    - **Property 23: Dashboard completeness**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8**
  
  - [x] 9.3 Write property test for referral count accuracy
    - **Property 24: Referral count accuracy**
    - **Validates: Requirements 6.3**
  
  - [x] 9.4 Write property test for volume aggregation accuracy
    - **Property 25: Volume aggregation accuracy**
    - **Validates: Requirements 6.6**
  
  - [x] 9.5 Write property test for fee aggregation accuracy
    - **Property 26: Fee aggregation accuracy**
    - **Validates: Requirements 6.7**

- [ ] 10. Implement leaderboard service
  - [x] 10.1 Create LeaderboardService class
    - Implement getLeaderboard() method
    - Query PointsBalance sorted by totalEarned descending
    - Join with User collection for username
    - Aggregate referral count for each user
    - Add rank calculation
    - Limit results to top 50 users
    - Add caching with 5-minute TTL
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [x] 10.2 Write property test for leaderboard sorting correctness
    - **Property 27: Leaderboard sorting correctness**
    - **Validates: Requirements 7.1**
  
  - [x] 10.3 Write property test for leaderboard entry completeness
    - **Property 28: Leaderboard entry completeness**
    - **Validates: Requirements 7.2, 7.3**

- [ ] 11. Implement command handlers for WhatsApp integration
  - [x] 11.1 Create StartCommandHandler
    - Parse "start [referral_code]" command
    - Call ReferralService.validateReferralCode()
    - Call ReferralService.createReferralRelationship()
    - Return success or error message to user
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 11.2 Create ReferralCommandHandler
    - Handle "referral" command
    - Call DashboardService.getDashboard()
    - Format dashboard data for WhatsApp display
    - Include leaderboard access option
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  
  - [x] 11.3 Create WithdrawCommandHandler
    - Parse withdrawal amount from command
    - Call WithdrawalService.canWithdraw()
    - Call WithdrawalService.requestWithdrawal()
    - Return confirmation or error message to user
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

- [ ] 12. Implement webhook handlers
  - [x] 12.1 Create KYCCompletionWebhook handler
    - Listen for KYC completion events
    - Call ReferralService.createReferralCode()
    - Update User record with generated code
    - _Requirements: 1.1, 1.4_
  
  - [x] 12.2 Create OfframpTransactionWebhook handler
    - Listen for offramp transaction completion events
    - Call EarningsService.processTransactionEarnings()
    - Handle errors gracefully with retry logic
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 13. Implement scheduled jobs
  - [x] 13.1 Create WithdrawalApprovalJob
    - Run every hour
    - Query withdrawal requests with status "pending" and requestedAt > 24 hours ago
    - Call WithdrawalService.approveWithdrawal() for each
    - Call WithdrawalService.processWithdrawal() for approved withdrawals
    - _Requirements: 5.4, 5.5_
  
  - [x] 13.2 Create LeaderboardCacheRefreshJob
    - Run every 5 minutes
    - Call LeaderboardService.getLeaderboard() to refresh cache
    - _Requirements: 7.1_

- [ ] 14. Write audit trail property tests
  - [x] 14.1 Write property test for earnings transaction audit trail
    - **Property 29: Earnings transaction audit trail**
    - **Validates: Requirements 9.4**
  
  - [x] 14.2 Write property test for withdrawal request audit trail
    - **Property 30: Withdrawal request audit trail**
    - **Validates: Requirements 9.5**

- [ ] 15. Integration and error handling
  - [x] 15.1 Add error handling middleware
    - Implement error response formatting
    - Add logging for all errors
    - Add monitoring alerts for critical errors
    - _Requirements: All error handling requirements_
  
  - [x] 15.2 Wire all components together
    - Register command handlers with WhatsApp bot
    - Register webhook handlers with event system
    - Register scheduled jobs with job scheduler
    - Configure MongoDB connection and transactions
    - _Requirements: All integration requirements_
  
  - [x] 15.3 Write integration tests
    - Test complete referral flow (KYC → code → registration → transaction → earnings)
    - Test withdrawal flow (accumulate → request → approve → complete)
    - Test dashboard flow (multiple referrals → transactions → display)
    - _Requirements: All requirements_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- All property tests should use fast-check library with minimum 100 iterations
- MongoDB transactions ensure atomic operations for financial data
- Caching improves performance for dashboard and leaderboard queries
- Scheduled jobs handle time-based operations (withdrawal approval)
- Error handling includes rollback logic for failed financial operations
