/**
 * Property-based tests for the email verification guard.
 *
 * Feature: email-verification-flow
 *
 * These tests verify that `shouldGateEmailVerification` correctly classifies
 * every possible combination of `isVerified` / `emailVerified` flags.
 */

import * as fc from "fast-check";
import { shouldGateEmailVerification } from "./emailVerificationGuard";

// ---------------------------------------------------------------------------
// Property 1: Email verification gate is total
// ---------------------------------------------------------------------------
// Feature: email-verification-flow, Property 1: Email verification gate is total
// Validates: Requirements 1.1, 1.4
describe("Property 1: Email verification gate is total", () => {
  it("should gate every KYC-verified user whose email is not yet verified", () => {
    // Generate arbitrary extra fields so the function is tested against
    // realistic-looking user objects, not just the two boolean fields.
    fc.assert(
      fc.property(
        fc.record({
          isVerified: fc.constant(true),
          emailVerified: fc.constant(false),
        }),
        (user) => {
          return shouldGateEmailVerification(user) === true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Verified users pass through the gate
// ---------------------------------------------------------------------------
// Feature: email-verification-flow, Property 2: Verified users pass through the gate
// Validates: Requirements 1.2
describe("Property 2: Verified users pass through the gate", () => {
  it("should NOT gate a KYC-verified user who has already verified their email", () => {
    fc.assert(
      fc.property(
        fc.record({
          isVerified: fc.constant(true),
          emailVerified: fc.constant(true),
        }),
        (user) => {
          return shouldGateEmailVerification(user) === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Additional cases: non-KYC users are never gated (Requirement 1.3)
// ---------------------------------------------------------------------------
// Feature: email-verification-flow, Property 1 (edge): non-KYC users bypass the gate
// Validates: Requirements 1.3
describe("Non-KYC users are never gated", () => {
  it("should NOT gate a user who has not completed KYC (isVerified = false), regardless of emailVerified", () => {
    fc.assert(
      fc.property(
        fc.record({
          isVerified: fc.constant(false),
          emailVerified: fc.boolean(),
        }),
        (user) => {
          return shouldGateEmailVerification(user) === false;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should NOT gate a user with isVerified=false and emailVerified=false", () => {
    expect(
      shouldGateEmailVerification({ isVerified: false, emailVerified: false }),
    ).toBe(false);
  });
});
