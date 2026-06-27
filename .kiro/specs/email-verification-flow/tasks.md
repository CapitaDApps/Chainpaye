# Implementation Plan: Email Verification Flow

## Overview

Implement the email verification gate and WhatsApp flow for ChainPaye. Tasks build incrementally: model changes first, then the email/OTP service, then the flow service and controller, then the flow JSON, then the guard, and finally wiring everything together.

## Tasks

- [x] 1. Extend the User model with email verification fields
  - Add `emailVerified: boolean` (default `false`) to `IUser` interface and `UserSchema` in `models/User.ts`
  - Add `linkioCustomerId?: string` (sparse, optional) to `IUser` interface and `UserSchema`
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 1.1 Write unit tests for User model defaults
    - Assert a newly created User document has `emailVerified = false`
    - Assert `linkioCustomerId` is absent by default
    - _Requirements: 6.1, 6.2_

- [x] 2. Add OTP email function to EmailService
  - Add `sendEmailVerificationOtp(toEmail: string, otp: string): Promise<void>` to `services/EmailService.ts`
  - Email body must include the 6-digit OTP prominently and state it expires in 10 minutes
  - _Requirements: 7.1, 7.2, 7.3_

  - [x] 2.1 Write unit tests for sendEmailVerificationOtp
    - Mock nodemailer transporter; assert `to`, subject, and OTP appear in mail options
    - Assert the 10-minute expiry notice is present in the HTML body
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 3. Implement the email verification flow service
  - Create `webhooks/services/emailVerificationFlow.service.ts`
  - Export `emailVerificationFlowScreen(decryptedBody)` handling `ping`, `error`, `INIT`, and `data_exchange` actions
  - `INIT` → return `EMAIL_INPUT` screen
  - `EMAIL_INPUT` data_exchange: validate email format; on valid → return `PIN_CONFIRM`; on invalid → return `EMAIL_INPUT` with `error_message`
  - `PIN_CONFIRM` data_exchange: fetch user with `+pin`, call `user.comparePin(pin)`; on match → generate 6-digit OTP, store in Redis as `otp:{flow_token}` with 600s TTL, call `sendEmailVerificationOtp`, return `OTP_INPUT`; on mismatch → return `PIN_CONFIRM` with error; on email send failure → return `PIN_CONFIRM` with error
  - `OTP_INPUT` data_exchange: fetch OTP from Redis; if missing/expired → return `OTP_INPUT` with expiry error; if mismatch → return `OTP_INPUT` with error; if match → delete Redis key, update User (`email`, `emailVerified: true`), call Linkio API, save `linkioCustomerId` if successful (log and continue on failure), return `SUCCESS`
  - Store Linkio API key as `process.env.LINKIO_SEC_KEY`; never hardcode
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4_

  - [x] 3.1 Write property test: invalid emails are rejected (Property 3)
    - **Property 3: Invalid email addresses are rejected**
    - **Validates: Requirements 2.2, 2.3**
    - Use fast-check to generate arbitrary non-email strings; assert `EMAIL_INPUT` screen returned with non-empty `error_message`

  - [x] 3.2 Write property test: valid emails advance the flow (Property 4)
    - **Property 4: Valid email addresses advance the flow**
    - **Validates: Requirements 2.4**
    - Use fast-check to generate valid email strings; assert `PIN_CONFIRM` screen returned

  - [x] 3.3 Write property test: wrong PIN does not send OTP (Property 5)
    - **Property 5: Incorrect PIN does not send OTP**
    - **Validates: Requirements 3.3**
    - Generate arbitrary PIN strings that do not match the stored PIN; assert `PIN_CONFIRM` returned with error and Redis has no `otp:` key

  - [x] 3.4 Write property test: correct PIN generates and stores OTP (Property 6)
    - **Property 6: Correct PIN generates and stores OTP**
    - **Validates: Requirements 3.4**
    - Use correct PIN; assert Redis contains a 6-digit numeric string under `otp:{flow_token}` with TTL ≤ 600s and flow returns `OTP_INPUT`

  - [x] 3.5 Write property test: wrong OTP does not verify email (Property 7)
    - **Property 7: Incorrect OTP does not verify email**
    - **Validates: Requirements 4.4**
    - Generate arbitrary OTP strings that don't match stored OTP; assert `emailVerified` stays `false` and `OTP_INPUT` returned with error

  - [x] 3.6 Write property test: correct OTP completes verification (Property 8)
    - **Property 8: Correct OTP completes verification**
    - **Validates: Requirements 4.5**
    - Use correct OTP; assert `emailVerified = true`, Redis key deleted, email saved, flow returns `SUCCESS`

  - [x] 3.7 Write property test: expired OTP prevents verification (Property 9)
    - **Property 9: OTP expiry prevents verification**
    - **Validates: Requirements 4.3**
    - Simulate missing/expired Redis key; assert `OTP_INPUT` returned with error and `emailVerified` stays `false`

  - [x] 3.8 Write property test: Linkio failure does not block access (Property 10)
    - **Property 10: Linkio failure does not block access**
    - **Validates: Requirements 5.4**
    - Mock Linkio to throw; assert `emailVerified` stays `true` and flow returns `SUCCESS`

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create the flow controller
  - Create `webhooks/controllers/emailVerificationFlow.controller.ts`
  - Use `flowMiddleware` wrapper (same pattern as `kyc.controller.ts`)
  - Call `emailVerificationFlowScreen(decryptedBody)` and return the result
  - _Requirements: 2.1, 3.1, 4.1, 5.1_

- [x] 6. Register the route
  - In `webhooks/route/route.ts`, import `emailVerificationFlowController` and add `router.post("/email-verification", emailVerificationFlowController)`
  - _Requirements: 2.1_

- [x] 7. Add flow ID to WhatsApp config
  - In `config/whatsapp.ts`, add `EMAIL_VERIFICATION` key to both `PRODUCTION_FLOW_IDS` and `STAGING_FLOW_IDS` reading from `process.env.WHATSAPP_EMAIL_VERIFICATION_FLOW_ID` and `process.env.WHATSAPP_STAGING_EMAIL_VERIFICATION_FLOW_ID`
  - _Requirements: 8.1_

- [x] 8. Add flow trigger method to WhatsAppBusinessService
  - In `services/WhatsAppBusinessService.ts`, add `async sendEmailVerificationFlowById(to: string): Promise<void>`
  - Use the existing `sendTextOnlyFlowById` private helper with `EMAIL_INPUT` as the initial screen and `WHATSAPP_CONFIG.FLOW_IDS.EMAIL_VERIFICATION` as the flow ID
  - _Requirements: 1.1_

- [x] 9. Create the WhatsApp Flow JSON
  - Create `webhooks/email_verification_flow.json` following the `version: "7.2"` / `data_api_version: "3.0"` format
  - Routing model: `EMAIL_INPUT → PIN_CONFIRM → OTP_INPUT → SUCCESS`
  - `EMAIL_INPUT`: TextInput for email (input-type: email), error display, Footer with data_exchange action
  - `PIN_CONFIRM`: TextInput for PIN (input-type: password), carries `email` in payload, error display, Footer with data_exchange action
  - `OTP_INPUT`: TextInput for OTP (input-type: number), carries `email` in payload, error display, Footer with data_exchange action
  - `SUCCESS`: terminal screen (`terminal: true`, `success: true`), Footer with `complete` action and payload `{ type: "email-verification-complete" }`
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 10. Implement the email verification guard in the webhook handler
  - In `webhooks/index.ts`, inside the registered-user branch (after `isRegistered` check), add a guard block before `commandRouteHandler` is called:
    - If `user.isVerified && !user.emailVerified`, call `sendEmailVerificationFlowById(phone)` and return `res.sendStatus(200)`
  - Extend the `nfm_reply` handler to handle `responseJson.type === "email-verification-complete"`: send a confirmation WhatsApp message and call `sendMenuMessageMyFlowId`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.5_

  - [x] 10.1 Write property test: guard blocks unverified users (Properties 1 & 2)
    - **Property 1: Email verification gate is total**
    - **Property 2: Verified users pass through the gate**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - Extract guard logic into a pure testable function; use fast-check to generate user objects with varying `isVerified`/`emailVerified` combinations; assert correct routing for each combination

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- The Linkio API key (`LINKIO_SEC_KEY`) must be added to `.env` before testing the OTP success path
- The WhatsApp Flow JSON must be uploaded to Meta Business Suite and the resulting flow ID set in environment variables before the flow can be triggered in production
- Property tests use **fast-check** (already installed) and should run a minimum of 100 iterations each
- Each property test references its design document property number in a comment: `// Feature: email-verification-flow, Property N: ...`
