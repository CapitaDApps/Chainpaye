# Requirements Document

## Introduction

The crypto onramp feature allows ChainPaye WhatsApp bot users to purchase USDC or USDT stablecoins using Nigerian Naira (NGN) via the DexPay payment gateway. Users trigger the flow by typing "buy crypto", fill in purchase details through a WhatsApp Flow, receive bank transfer payment instructions, and confirm the transaction to complete the purchase. The receiving wallet address is automatically resolved from the user's Crossmint wallet based on the selected chain.

## Glossary

- **OnrampHandler**: The command handler that initiates the buy crypto flow when triggered by user text input.
- **OnrampFlowController**: The WhatsApp Flow webhook controller that handles encrypted flow interactions for both the buy crypto form and the complete transaction form.
- **OnrampFlowService**: The service layer that contains business logic for the onramp flow screens.
- **DexPayService**: The existing service that communicates with the DexPay B2B API for quote creation and execution.
- **CrossmintService**: The existing service that manages user crypto wallets via the Crossmint API.
- **BUY_CRYPTO_FORM**: The first WhatsApp Flow screen where the user enters fiatAmount, selects asset and chain.
- **RETURN_TO_CHAT**: The terminal WhatsApp Flow screen shown after the quote request is submitted.
- **COMPLETE_TRANSACTION_FORM**: The WhatsApp Flow screen showing quote details where the user confirms the bank transfer.
- **TRANSACTION_RECEIVED**: The terminal WhatsApp Flow screen shown after the user confirms the transaction.
- **Quote**: The DexPay response containing payment account details, token amount, and price for a given NGN amount.
- **Redis**: The in-memory data store used to cache quote data and flow tokens.
- **flowMiddleware**: The existing Express middleware that handles WhatsApp Flow request decryption and response encryption.
- **flowToken**: A UUID stored in Redis mapping to a user's phone number, used to identify the user during flow interactions.

---

## Requirements

### Requirement 1: Command Trigger

**User Story:** As a ChainPaye user, I want to type "buy crypto" in WhatsApp to start the crypto purchase flow, so that I can easily initiate a stablecoin purchase.

#### Acceptance Criteria

1. WHEN a user sends a message matching "buy crypto" or related trigger phrases, THE OnrampHandler SHALL open the BUY_CRYPTO_FORM WhatsApp Flow screen.
2. WHEN the buyCrypto command is triggered, THE OnrampHandler SHALL look up the user by their WhatsApp phone number before opening the flow.
3. IF the user is not found in the database, THEN THE OnrampHandler SHALL send a text message instructing the user to create an account first.

---

### Requirement 2: Buy Crypto Form — Data Collection

**User Story:** As a ChainPaye user, I want to enter the NGN amount, select a stablecoin asset, and choose a blockchain network in the WhatsApp Flow, so that I can specify exactly what I want to buy.

#### Acceptance Criteria

1. THE BUY_CRYPTO_FORM screen SHALL collect fiatAmount (numeric, NGN), asset (USDC or USDT), and chain from the user.
2. WHEN the user selects USDC as the asset, THE BUY_CRYPTO_FORM screen SHALL present BSC, SOL, BASE, and ARBITRUM as available chain options.
3. WHEN the user selects USDT as the asset, THE BUY_CRYPTO_FORM screen SHALL present BSC and SOL as available chain options.
4. THE BUY_CRYPTO_FORM screen SHALL set the transaction type to "BUY" without exposing it to the user.

---

### Requirement 3: Receiving Address Resolution

**User Story:** As a ChainPaye user, I want my receiving wallet address to be automatically determined based on the chain I selected, so that I don't have to manually enter a wallet address.

#### Acceptance Criteria

1. WHEN the user selects BSC, BASE, or ARBITRUM as the chain, THE OnrampFlowService SHALL fetch the user's EVM wallet address using `crossmintService.getOrCreateWallet(userId, "evm")`.
2. WHEN the user selects SOL as the chain, THE OnrampFlowService SHALL fetch the user's Solana wallet address using `crossmintService.getOrCreateWallet(userId, "solana")`.
3. IF no wallet exists for the required chain type, THEN THE CrossmintService SHALL create a new wallet automatically before returning the address.
4. IF wallet retrieval fails, THEN THE OnrampFlowService SHALL return an error message to the flow screen and halt the quote request.

---

### Requirement 4: DexPay Quote Request

**User Story:** As a ChainPaye user, I want the system to request a price quote from DexPay when I proceed from the buy form, so that I receive accurate payment instructions.

#### Acceptance Criteria

1. WHEN the user presses "Proceed" on BUY_CRYPTO_FORM, THE OnrampFlowService SHALL call the DexPay POST /quote endpoint with fiatAmount, asset, chain, type "BUY", and receivingAddress.
2. THE OnrampFlowService SHALL transition the flow to the RETURN_TO_CHAT terminal screen immediately after submitting the quote request.
3. IF the DexPay quote request fails, THEN THE OnrampFlowService SHALL send the user a WhatsApp text message describing the error.

---

### Requirement 5: Quote Storage

**User Story:** As a ChainPaye system, I want to persist the DexPay quote response in Redis, so that it can be retrieved when the user proceeds to complete the transaction.

#### Acceptance Criteria

1. WHEN a successful quote response is received from DexPay, THE OnrampFlowService SHALL store the full quote data in Redis under the key `onramp_quote:{phoneNumber}`.
2. THE OnrampFlowService SHALL set the Redis TTL for the quote to 1800 seconds (30 minutes).
3. WHEN the quote is retrieved for the complete transaction flow, THE OnrampFlowService SHALL parse the stored JSON back into a quote object.

---

### Requirement 6: Payment Details Notification

**User Story:** As a ChainPaye user, I want to receive the bank transfer details via WhatsApp message after the quote is generated, so that I know where to send my NGN payment.

#### Acceptance Criteria

1. WHEN a quote is successfully stored, THE WhatsAppBusinessService SHALL send a WhatsApp text message to the user containing fiatAmount, tokenAmount, price, bankName, accountName, and accountNumber.
2. WHEN the payment details message is sent, THE WhatsAppBusinessService SHALL also send a WhatsApp Flow message with a "Complete Transaction" CTA that opens the COMPLETE_TRANSACTION_FORM screen.
3. THE COMPLETE_TRANSACTION_FORM flow message SHALL be sent using `sendTextOnlyFlowWithDataById` with the quote data pre-populated as screen data.

---

### Requirement 7: Complete Transaction Form

**User Story:** As a ChainPaye user, I want to review the transaction details and confirm my bank transfer in the WhatsApp Flow, so that I can finalize the crypto purchase.

#### Acceptance Criteria

1. THE COMPLETE_TRANSACTION_FORM screen SHALL display fiatAmount, tokenAmount, price, bankName, accountName, and accountNumber as read-only fields.
2. THE COMPLETE_TRANSACTION_FORM screen SHALL NOT display the DexPay fee field.
3. WHEN the user presses "Proceed" on COMPLETE_TRANSACTION_FORM, THE OnrampFlowService SHALL call `dexPayService.finalizeQuote(quoteId)` to execute the quote.
4. THE OnrampFlowService SHALL transition the flow to the TRANSACTION_RECEIVED terminal screen after calling finalizeQuote.
5. IF the quote has expired (DexPay returns 410), THEN THE OnrampFlowService SHALL return an error message on the COMPLETE_TRANSACTION_FORM screen instructing the user to restart.

---

### Requirement 8: Transaction Recording

**User Story:** As a ChainPaye system, I want to save a record of each completed onramp transaction to the database, so that users can view it in their transaction history.

#### Acceptance Criteria

1. WHEN `finalizeQuote` returns a successful result, THE OnrampFlowService SHALL create a Transaction document with type `ON_RAMP`.
2. THE Transaction document SHALL include the fromUser (user's ObjectId), amount (fiatAmount in NGN), currency "NGN", and status PENDING.
3. THE TransactionType enum in `models/Transaction.ts` SHALL include the value `ON_RAMP = "on_ramp"`.
4. WHEN the transaction is saved, THE OnrampFlowService SHALL send a WhatsApp confirmation text message to the user.

---

### Requirement 9: Confirmation Message

**User Story:** As a ChainPaye user, I want to receive a WhatsApp confirmation message after completing the transaction, so that I know my purchase is being processed.

#### Acceptance Criteria

1. WHEN the transaction record is saved successfully, THE WhatsAppBusinessService SHALL send a confirmation message stating the transaction has been received and is being processed.
2. THE confirmation message SHALL include the fiatAmount, tokenAmount, and asset name.

---

### Requirement 10: Error Handling

**User Story:** As a ChainPaye user, I want to receive clear error messages when something goes wrong during the onramp flow, so that I understand what happened and can take corrective action.

#### Acceptance Criteria

1. IF the DexPay /quote API returns an error, THEN THE OnrampFlowService SHALL send the user a WhatsApp text message with a human-readable error description.
2. IF wallet creation or retrieval fails, THEN THE OnrampFlowService SHALL send the user a WhatsApp text message indicating the wallet could not be prepared.
3. IF the Redis quote lookup returns null on the COMPLETE_TRANSACTION_FORM screen, THEN THE OnrampFlowService SHALL return an error message on the screen instructing the user to restart the flow.
4. IF saving the transaction to the database fails, THEN THE OnrampFlowService SHALL log the error and still send the user a confirmation message.
5. WHEN any unhandled error occurs in the flow controller, THE OnrampFlowController SHALL log the error and return a graceful error response to the flow screen.
