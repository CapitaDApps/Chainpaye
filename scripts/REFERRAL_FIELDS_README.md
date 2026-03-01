# User Model Referral Fields - Task 1.1

## Overview

This task extends the User model with referral system fields to support the referral system feature.

## Changes Made

### 1. User Model Extension (`models/User.ts`)

Added three new fields to the User schema:

- **`referralCode`** (String, optional, unique, 6-12 characters)
  - Unique referral code assigned to each user
  - Used for sharing with potential referrals
  - Sparse index allows multiple null values but enforces uniqueness when set

- **`referredBy`** (String, optional)
  - Stores the userId of the user who referred this user
  - Creates the referral relationship
  - Indexed for efficient queries

- **`referredAt`** (Date, optional)
  - Timestamp when the user was referred
  - Used to calculate the 30-day referral period

### 2. Database Indexes

Added indexes for efficient queries:
- `referralCode` - For looking up users by their referral code
- `referredBy` - For querying all users referred by a specific user

### 3. Migration Script (`scripts/add-referral-fields-migration.ts`)

A migration script that:
- Creates the necessary indexes on the users collection
- Initializes the new fields for existing users (sets to null)
- Verifies the migration was successful
- Provides detailed logging of the process

### 4. Verification Script (`scripts/verify-user-referral-fields.ts`)

A comprehensive verification script that tests:
- Creating users without referral fields
- Creating users with referral codes
- Creating referred users with referredBy and referredAt
- Querying users by referredBy
- Querying users by referral code
- Verifying indexes exist
- Testing unique constraint on referral codes

## Running the Migration

To migrate existing users and add the referral fields:

```bash
npm run start scripts/add-referral-fields-migration.ts
# or
tsx scripts/add-referral-fields-migration.ts
```

**Note:** This migration is safe to run multiple times. It will skip users that already have the fields initialized.

## Verifying the Changes

To verify that the referral fields work correctly:

```bash
npm run start scripts/verify-user-referral-fields.ts
# or
tsx scripts/verify-user-referral-fields.ts
```

This will run a series of tests and output the results to the console.

## Requirements Validated

This implementation satisfies the following requirements from the spec:

- **Requirement 1.1**: Users can have a unique referral code
- **Requirement 1.4**: Referral codes are persisted to the user's record

## Schema Details

```typescript
interface IUser extends Document {
  // ... existing fields ...
  referralCode?: string;  // Unique referral code (6-12 chars)
  referredBy?: string;    // User ID of referrer
  referredAt?: Date;      // Timestamp of referral
}
```

### Field Constraints

- `referralCode`:
  - Type: String
  - Unique: Yes (sparse index)
  - Min length: 6 characters
  - Max length: 12 characters
  - Optional: Yes

- `referredBy`:
  - Type: String
  - Optional: Yes
  - Indexed: Yes

- `referredAt`:
  - Type: Date
  - Optional: Yes

## Next Steps

After running the migration, the following tasks can proceed:
- Task 1.2: Create ReferralRelationship model
- Task 2.1: Create ReferralCodeGenerator class
- Task 3.1: Create ReferralService class

## Notes

- The migration is idempotent and safe to run multiple times
- Existing users will have null values for the new fields until they complete KYC (for referralCode) or are referred (for referredBy/referredAt)
- The sparse index on referralCode allows multiple users to have null values while enforcing uniqueness for non-null values
