# Requirements Document

## Introduction

After completing KYC, users of the ChainPaye WhatsApp bot must verify their email address before they can perform any bot actions. When a post-KYC user sends any message, the bot intercepts it and prompts them to complete email verification. The verification flow collects the user's email, confirms their identity via their 4-digit PIN, sends an OTP to the provided email, and validates the OTP. On success, the system registers the user as a customer on the Linkio onboarding API and saves the returned `customer_id` to the user record.

## Glossary

- **Bot**: The ChainPaye WhatsApp bot application.
- **User**: A registered ChainPaye user who has completed KYC (i.e., `isVerified = true`).
- **Email_Verification_Flow**: The WhatsApp Flow that guides the user through email collection, PIN confirmation, OTP entry, and success.
- **Email_Verification_Service**: The backend service that handles each screen transition of the Email_Verification_Flow.
- **Email_Verification_Guard**: The middleware/logic in the webhook message handler that intercepts messages from unverified users and triggers the Email_Verification_Flow.
- **OTP**: A 6-digit one-time password sent to the user's email address, valid for 10 minutes.
- **PIN**: The user's existing 4-digit transaction PIN stored (hashed) on their account.
- **EmailService**: The existing nodemailer-based service used to send emails.
- **Linkio_API**: The external onboarding API at `https://api.linkio.world/transactions/v2/direct_ramp/onboarding`.
- **customer_id**: The identifier returned by the Linkio_API after successful customer creation, stored on the User record.
- **emailVerified**: A boolean field on the User model indicating whether the user has completed email verification.

---

## Requirements

### Requirement 1: Gate Bot Actions Behind Email Verification

**User Story:** As a KYC-verified user who has not yet verified their email, I want to be prompted to verify my email when I message the bot, so that I cannot perform any actions until verification is complete.

#### Acceptance Criteria

1. WHEN a KYC-verified user (`isVerified = true`) sends any message to the Bot AND the user's `emailVerified` field is `false`, THEN the Email_Verification_Guard SHALL intercept the message and send the Email_Verification_Flow to the user instead of processing the command.
2. WHEN a KYC-verified user with `emailVerified = true` sends any message to the Bot, THEN the Email_Verification_Guard SHALL allow normal command processing to proceed without interruption.
3. WHEN a user who has not yet completed KYC sends a message, THEN the Email_Verification_Guard SHALL NOT apply email verification gating, and existing KYC-gating logic SHALL remain unaffected.
4. THE Email_Verification_Guard SHALL evaluate `emailVerified` status on every inbound message from a KYC-verified user before routing to any command handler.

---

### Requirement 2: Email Input Screen

**User Story:** As a KYC-verified user, I want to enter my email address in the verification flow, so that the system knows where to send my OTP.

#### Acceptance Criteria

1. WHEN the Email_Verification_Flow is opened, THE Email_Verification_Service SHALL present the `EMAIL_INPUT` screen as the first screen.
2. WHEN a user submits an email address on the `EMAIL_INPUT` screen, THE Email_Verification_Service SHALL validate that the submitted value matches the pattern `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
3. IF the submitted email address fails format validation, THEN THE Email_Verification_Service SHALL return the `EMAIL_INPUT` screen with a descriptive `error_message` and SHALL NOT advance to the next screen.
4. WHEN a valid email address is submitted on the `EMAIL_INPUT` screen, THE Email_Verification_Service SHALL advance the flow to the `PIN_CONFIRM` screen.

---

### Requirement 3: PIN Confirmation Screen

**User Story:** As a KYC-verified user, I want to confirm my identity with my PIN before an OTP is sent, so that no one else can trigger an OTP to my email.

#### Acceptance Criteria

1. WHEN the flow reaches the `PIN_CONFIRM` screen, THE Email_Verification_Service SHALL present a PIN entry field to the user.
2. WHEN a user submits a PIN on the `PIN_CONFIRM` screen, THE Email_Verification_Service SHALL retrieve the user's hashed PIN from the database and compare it using the existing `comparePin` method on the User model.
3. IF the submitted PIN does not match the stored PIN, THEN THE Email_Verification_Service SHALL return the `PIN_CONFIRM` screen with the error message "Incorrect PIN. Please try again." and SHALL NOT send an OTP.
4. WHEN the submitted PIN matches the stored PIN, THE Email_Verification_Service SHALL generate a 6-digit numeric OTP, store it in Redis with a 10-minute TTL keyed by the flow token, and advance the flow to the `OTP_INPUT` screen.
5. WHEN the OTP is generated and stored, THE Email_Verification_Service SHALL send the OTP to the email address collected in the `EMAIL_INPUT` screen via the EmailService.

---

### Requirement 4: OTP Input Screen

**User Story:** As a KYC-verified user, I want to enter the OTP sent to my email, so that I can prove I own the email address.

#### Acceptance Criteria

1. WHEN the flow reaches the `OTP_INPUT` screen, THE Email_Verification_Service SHALL present an OTP entry field to the user.
2. WHEN a user submits an OTP on the `OTP_INPUT` screen, THE Email_Verification_Service SHALL retrieve the stored OTP from Redis using the flow token.
3. IF the Redis key for the OTP has expired or does not exist, THEN THE Email_Verification_Service SHALL return the `OTP_INPUT` screen with the error message "OTP has expired. Please restart the verification." and SHALL NOT mark the email as verified.
4. IF the submitted OTP does not match the stored OTP, THEN THE Email_Verification_Service SHALL return the `OTP_INPUT` screen with the error message "Incorrect OTP. Please try again." and SHALL NOT mark the email as verified.
5. WHEN the submitted OTP matches the stored OTP, THE Email_Verification_Service SHALL delete the OTP from Redis, save the verified email address to the User record, set `emailVerified = true` on the User record, and advance the flow to the `SUCCESS` screen.

---

### Requirement 5: Success Screen and Linkio Onboarding

**User Story:** As a KYC-verified user who has just verified my email, I want the system to register me on the Linkio platform and show me a success screen, so that I can immediately start using all bot features.

#### Acceptance Criteria

1. WHEN the flow advances to the `SUCCESS` screen, THE Email_Verification_Service SHALL display a confirmation message to the user indicating that their email has been verified.
2. WHEN `emailVerified` is set to `true` on the User record, THE Email_Verification_Service SHALL send a POST request to `https://api.linkio.world/transactions/v2/direct_ramp/onboarding` with the header `ngnc-sec-key: ngnc_s_lk_0cd3b9819b72a06fb4d5f28ded9accc4b434262b8d30620e12e8f932249bf3a2` and query parameters `email`, `last_name`, `first_name`, and `country` populated from the User record.
3. WHEN the Linkio_API returns a response with `status = "Success"`, THE Email_Verification_Service SHALL extract the `customer_id` from the response `data` object and save it to the User record.
4. IF the Linkio_API returns an error response or the request fails, THEN THE Email_Verification_Service SHALL log the error and SHALL NOT block the user from accessing the bot (email verification is still considered complete).
5. WHEN the `SUCCESS` screen flow completion event (`nfm_reply`) is received by the webhook handler, THE Bot SHALL send the user a WhatsApp text message confirming successful email verification and then present the main menu.

---

### Requirement 6: User Model Extensions

**User Story:** As a developer, I want the User model to store email verification state and the Linkio customer ID, so that the system can correctly gate actions and track onboarding status.

#### Acceptance Criteria

1. THE User model SHALL include an `emailVerified` boolean field with a default value of `false`.
2. THE User model SHALL include a `linkioCustomerId` optional string field to store the `customer_id` returned by the Linkio_API.
3. WHEN `emailVerified` is set to `true`, THE User model SHALL retain the verified email address in the existing `email` field.
4. THE User model SHALL enforce that the `email` field is unique and sparse (allowing multiple users without an email while preventing duplicate verified emails).

---

### Requirement 7: OTP Email Delivery

**User Story:** As a KYC-verified user, I want to receive a clearly formatted OTP email, so that I can easily find and enter my verification code.

#### Acceptance Criteria

1. WHEN the EmailService sends an OTP email, THE EmailService SHALL address it to the email provided by the user in the `EMAIL_INPUT` screen.
2. WHEN the EmailService sends an OTP email, THE EmailService SHALL include the 6-digit OTP prominently in the email body.
3. WHEN the EmailService sends an OTP email, THE EmailService SHALL state that the OTP expires in 10 minutes.
4. IF the EmailService fails to send the OTP email, THEN THE Email_Verification_Service SHALL return the `PIN_CONFIRM` screen with the error message "Failed to send OTP. Please try again." and SHALL NOT advance the flow.

---

### Requirement 8: Flow JSON Definition

**User Story:** As a developer, I want a WhatsApp Flow JSON file that defines all screens of the email verification flow, so that the flow can be registered with the Meta WhatsApp Business API.

#### Acceptance Criteria

1. THE Email_Verification_Flow JSON SHALL define the screens `EMAIL_INPUT`, `PIN_CONFIRM`, `OTP_INPUT`, and `SUCCESS` in the `routing_model`.
2. THE Email_Verification_Flow JSON SHALL define each screen with the appropriate input fields, error message display, and footer action buttons consistent with existing flow JSON files in the project.
3. THE `SUCCESS` screen SHALL be marked as `terminal: true` and `success: true` and SHALL include a completion payload with `type: "email-verification-complete"`.
