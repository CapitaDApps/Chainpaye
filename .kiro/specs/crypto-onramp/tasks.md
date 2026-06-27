# Implementation Plan: Crypto Onramp

## Overview

Implement the crypto onramp feature for ChainPaye by adding a "buy crypto" command, two WhatsApp Flows, a flow controller/service, and wiring everything into the existing command router, webhook routes, and WhatsApp service.

## Tasks

- [x] 1. Extend data model and config
  - [x] 1.1 Add `ON_RAMP = "on_ramp"` to the `TransactionType` enum in `models/Transaction.ts`
    - _Requirements: 8.3_
  - [ ]* 1.2 Write unit test asserting `TransactionType.ON_RAMP === "on_ramp"`
    - _Requirements: 8.3_
  - [x] 1.3 Add `ONRAMP` and `COMPLETE_TRANSACTION` entries to both `PRODUCTION_FLOW_IDS` and `STAGING_FLOW_IDS` in `config/whatsapp.ts`, reading from env vars `WHATSAPP_ONRAMP_FLOW_ID` and `WHATSAPP_COMPLETE_TRANSACTION_FLOW_ID`
    - _Requirements: 6.2, 6.3_

- [x] 2. Add buyCrypto command trigger
  - [x] 2.1 Add `buyCrypto` entry to `COMMANDS` in `commands/config.ts` with triggers `["buy crypto", "buy usdc", "buy usdt", "/buycrypto"]` and priority 5
    - _Requirements: 1.1_
  - [ ]* 2.2 Write property test: for each trigger string in the buyCrypto config, `findMatchingCommand(trigger)` returns `"buyCrypto"`
    - **Property 1 (partial): chain-to-chainType mapping is exhaustive and correct**
    - _Requirements: 1.1_

- [x] 3. Implement OnrampHandler
  - [x] 3.1 Create `commands/handlers/onrampHandler.ts` exporting `handleBuyCrypto(phoneNumber: string): Promise<void>`
    - Look up user via `User.findOne({ whatsappNumber: phone })`
    - If not found, send error text and return
    - Call `whatsappBusinessService.sendBuyCryptoFlow(phone)`
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ]* 3.2 Write unit tests for `handleBuyCrypto`: user-not-found path sends error message; happy path calls `sendBuyCryptoFlow`
    - _Requirements: 1.2, 1.3_
  - [x] 3.3 Add `case "buyCrypto": await handleBuyCrypto(from); break;` to the switch in `commands/route.ts` and import `handleBuyCrypto`
    - _Requirements: 1.1_

- [x] 4. Implement WhatsApp flow send methods
  - [x] 4.1 Add `sendBuyCryptoFlow(to: string): Promise<void>` to `WhatsAppBusinessService`
    - Calls `sendTextOnlyFlowWithDataById` with `WHATSAPP_CONFIG.FLOW_IDS.ONRAMP`, screen `"BUY_CRYPTO_FORM"`, body text, and CTA "Buy Crypto"
    - Stores `flowToken → to` in Redis (handled inside `sendTextOnlyFlowWithDataById`)
    - _Requirements: 1.1, 6.3_
  - [x] 4.2 Add `sendCompleteTransactionFlow(to: string, quoteData: OnrampQuoteData): Promise<void>` to `WhatsAppBusinessService`
    - Calls `sendTextOnlyFlowWithDataById` with `WHATSAPP_CONFIG.FLOW_IDS.COMPLETE_TRANSACTION`, screen `"COMPLETE_TRANSACTION_FORM"`, and passes quoteData fields as screenData
    - _Requirements: 6.2, 6.3_

- [x] 5. Implement OnrampFlowService
  - [x] 5.1 Create `webhooks/services/onrampFlowService.ts` exporting `getOnrampFlowScreen(decryptedBody)`
    - Handle `ping` → `{ data: { status: "active" } }`
    - Handle `INIT` → `{ screen: "BUY_CRYPTO_FORM", data: {} }`
    - _Requirements: 4.2_
  - [x] 5.2 Implement `BUY_CRYPTO_FORM` screen handler inside `getOnrampFlowScreen`
    - Resolve phone from Redis via `flow_token`
    - Look up user; resolve chainType from chain (BSC/BASE/ARBITRUM → "evm", SOL → "solana")
    - Call `crossmintService.getOrCreateWallet(userId, chainType)` to get `receivingAddress`
    - Build DexPay quote request with `type: "BUY"` and call `dexPayService.getQuote(request)` (POST /quote)
    - On success: store quote in Redis (`onramp_quote:{phone}`, TTL 1800), fire-and-forget payment details message and `sendCompleteTransactionFlow`, return `RETURN_TO_CHAT` screen
    - On wallet error or DexPay error: fire-and-forget error text, return `BUY_CRYPTO_FORM` with `error_message`
    - _Requirements: 3.1, 3.2, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 6.2, 10.1, 10.2_
  - [ ]* 5.3 Write property test: for any chain in {BSC, BASE, ARBITRUM, SOL}, the chainType mapping returns the correct value
    - **Property 1: chain-to-chainType mapping is exhaustive and correct**
    - **Validates: Requirements 3.1, 3.2**
  - [ ]* 5.4 Write property test: for any valid OnrampQuoteData, `JSON.parse(JSON.stringify(quoteData))` deep-equals the original (Redis round-trip simulation)
    - **Property 2: quote Redis round-trip**
    - **Validates: Requirements 5.1, 5.3**
  - [ ]* 5.5 Write property test: for any quote stored, the TTL passed to `redisClient.set` equals 1800
    - **Property 3: quote TTL is always 1800 seconds**
    - **Validates: Requirements 5.2**
  - [ ]* 5.6 Write property test: for any OnrampQuoteData, the payment details message string contains fiatAmount, tokenAmount, price, bankName, accountName, and accountNumber
    - **Property 4: payment details message contains all required fields**
    - **Validates: Requirements 6.1**
  - [ ]* 5.7 Write property test: for any valid form inputs, the DexPay quote request payload always has `type === "BUY"`
    - **Property 7: quote request always includes type BUY**
    - **Validates: Requirements 2.4, 4.1**
  - [x] 5.8 Implement `COMPLETE_TRANSACTION_FORM` screen handler inside `getOnrampFlowScreen`
    - Resolve phone from Redis via `flow_token`
    - GET `onramp_quote:{phone}` from Redis; if null return `error_message` on screen
    - Call `dexPayService.finalizeQuote(quoteData.id)`
    - On success: fire-and-forget DB save and confirmation message, return `TRANSACTION_RECEIVED` screen
    - On 410 expired: return `error_message` on screen
    - On other error: return `error_message` on screen
    - _Requirements: 5.3, 7.3, 7.4, 7.5, 8.1, 8.2, 8.4, 9.1, 10.3, 10.4_
  - [ ]* 5.9 Write property test: for any error-triggering input (null Redis, DexPay error, wallet error), the returned object has a non-empty `error_message`
    - **Property 5: error response always contains error_message**
    - **Validates: Requirements 10.1, 10.2, 10.3, 7.5**
  - [ ]* 5.10 Write property test: for any successful finalizeQuote, the Transaction created has type=ON_RAMP, currency="NGN", status=PENDING, amount=fiatAmount
    - **Property 6: transaction invariants on successful finalize**
    - **Validates: Requirements 8.1, 8.2**
  - [ ]* 5.11 Write property test: for any OnrampQuoteData, the confirmation message contains fiatAmount, tokenAmount, and asset
    - **Property 8: confirmation message contains required fields**
    - **Validates: Requirements 9.2**

- [ ] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement OnrampFlowController
  - [x] 7.1 Create `webhooks/controllers/onrampFlow.controller.ts`
    - Import `flowMiddleware` and `getOnrampFlowScreen`
    - Define `onrampFlowHandler(req, res)` that calls `getOnrampFlowScreen(req.decryptedData.decryptedBody)`
    - Export `onrampFlowController = flowMiddleware(onrampFlowHandler)`
    - _Requirements: 10.5_

- [x] 8. Create WhatsApp Flow JSON definitions
  - [x] 8.1 Create `webhooks/buy_crypto_flow.json` with screens `BUY_CRYPTO_FORM` (inputs: fiatAmount number, asset dropdown, chain dropdown) and `RETURN_TO_CHAT` (terminal, message: "Return to chat for further instructions.")
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 8.2 Create `webhooks/complete_transaction_flow.json` with screens `COMPLETE_TRANSACTION_FORM` (read-only fields: fiatAmount, tokenAmount, price, bankName, accountName, accountNumber — no fee field) and `TRANSACTION_RECEIVED` (terminal, message: "Your transaction has been received and is being processed.")
    - _Requirements: 7.1, 7.2_

- [x] 9. Register webhook routes
  - [x] 9.1 Add `import { onrampFlowController } from "../controllers/onrampFlow.controller"` and register `router.post("/buy-crypto", onrampFlowController)` and `router.post("/complete-transaction", onrampFlowController)` in `webhooks/route/route.ts`
    - _Requirements: 4.1, 7.3_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests use `fast-check` with minimum 100 iterations each
- The `sendBuyCryptoFlow` and `sendCompleteTransactionFlow` methods follow the same pattern as `sendReferralWithdrawalFlow` in `WhatsAppBusinessService`
- The `onrampFlowController` follows the same pattern as `handleReferralWithdrawalFlow` in `referralWithdrawalFlow.controller.ts`
- Flow JSON files must be uploaded to Meta and the resulting flow IDs added to env vars before the feature is live
