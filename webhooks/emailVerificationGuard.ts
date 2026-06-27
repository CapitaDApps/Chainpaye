/**
 * Pure guard logic for the email verification gate.
 * Extracted into its own module so it can be imported and tested
 * independently of the full webhook handler.
 */

/**
 * Returns true when the user must complete email verification before
 * any bot command is processed.
 *
 * Conditions:
 *  - User has completed KYC (`isVerified = true`)
 *  - User has NOT yet verified their email (`emailVerified = false`)
 */
export function shouldGateEmailVerification(user: {
  isVerified: boolean;
  emailVerified: boolean;
}): boolean {
  return user.isVerified && !user.emailVerified;
}
