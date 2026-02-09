# EUR/GBP Parity Audit (Excluding Deposit/Topup)

This document lists places where EUR/GBP are not yet implemented with the same level of support as NGN/USD.

Scope note:
- I intentionally excluded deposit/topup paths per your request.
- No code changes are included in this audit; this is only a gap list.

## 1) User Currency Model Still USD/NGN-Only
- File: `models/User.ts:20`
  - Current: `currency` type is `"USD" | "NGN"`.
- File: `models/User.ts:86`
  - Current: schema enum is `["USD", "NGN"]`.
- File: `models/User.ts:89`
  - Current: default currency logic resolves to USD or NGN only.
- Gap:
  - User-level preferred/default currency does not include EUR/GBP.

## 2) Internal Wallet Transfer Service Supports Only USD/NGN
- File: `services/WalletService.ts:128`
  - Current: `switch (currency.toUpperCase())` branches only for USD and NGN.
- File: `services/WalletService.ts:129`
  - Current: USD transfer logic.
- File: `services/WalletService.ts:225`
  - Current: NGN transfer logic.
- File: `services/WalletService.ts:320`
  - Current: any other currency throws unsupported.
- Gap:
  - No EUR/GBP transfer path in core transfer service.

## 3) Toronet Service Missing EUR/GBP Transfer + Withdrawal Bank Helpers
- File: `services/ToronetService.ts:786`
  - Current: `transferNGN`.
- File: `services/ToronetService.ts:806`
  - Current: `transferUSD`.
- Gap:
  - No `transferEUR` and `transferGBP` wrappers.

- File: `services/ToronetService.ts:1013`
  - Current: `getBankListNGN`.
- File: `services/ToronetService.ts:1034`
  - Current: `getBankListUSD`.
- Gap:
  - No `getBankListEUR` / `getBankListGBP` helper methods.

- File: `services/ToronetService.ts:1055`
  - Current: only `resolveBankAccountNameNGN`.
- Gap:
  - No account name resolution helpers for USD/EUR/GBP flows (if required by provider behavior).

- File: `services/ToronetService.ts:913`
  - Current: withdrawal description text is hardcoded as `"ToroNGN Exchange"`.
- Gap:
  - Not currency-aware for non-NGN withdrawals.

## 4) Transfer WhatsApp Flow Service Only Offers USD/NGN
- File: `webhooks/services/transferFlow.service.ts:52`
  - Current: flow dropdown data only includes USD and NGN.
- Gap:
  - EUR/GBP not available to users in transfer flow entry screen.

## 5) Transfer Flow JSON Only Has USD/NGN Currency Choices
- File: `webhooks/transfer_flow.json:31`
  - Current: USD option.
- File: `webhooks/transfer_flow.json:35`
  - Current: NGN option.
- Gap:
  - JSON flow schema/options do not include EUR/GBP.

## 6) Withdrawal WhatsApp Flow Service Supports Only USD/NGN
- File: `webhooks/services/withdrawalFlow.service.ts:67`
  - Current: currency selection switch handles USD and NGN only.
- File: `webhooks/services/withdrawalFlow.service.ts:108`
  - Current: summary/build details logic split only for USD/NGN.
- File: `webhooks/services/withdrawalFlow.service.ts:240`
  - Current: execution/PIN branch only for USD/NGN.
- Gap:
  - End-to-end withdrawal flow has no EUR/GBP handling.

## 7) Withdrawal Flow JSON Only Has USD/NGN
- File: `webhooks/withdrawal_flow.json:47`
  - Current: USD option.
- File: `webhooks/withdrawal_flow.json:51`
  - Current: NGN option.
- Gap:
  - Users cannot choose EUR/GBP in withdrawal flow UI.

## 8) Receipt Generator Is Not EUR/GBP-Safe
- File: `utils/generateReceipt.ts:58`
  - Current: currency symbol logic is `USD => "$"`, otherwise defaults to Naira symbol.
- Gap:
  - EUR and GBP receipts will display wrong symbol.

- File: `utils/generateReceipt.ts:135`
  - Current: conversion exchange-rate text is hardcoded to `1 USD @ ... NGN`.
- Gap:
  - Conversion receipts are incorrect for EUR/GBP pairs.

## 9) Invoice Flow Service Still USD/NGN-Only (If Used)
- File: `webhooks/services/invoice.service.ts:34`
  - Current: currency array only includes USD and NGN.
- Gap:
  - No EUR/GBP parity in invoice flow service.

## 10) Legacy Generic Flow Sample Still USD/NGN-Only (If Used)
- File: `webhooks/flow.ts:41`
  - Current: currency list only USD/NGN.
- Gap:
  - Legacy sample flow not aligned with four-currency support.

## 11) Conversion Trigger Phrases Are Not Fully Symmetric (Low Priority)
- File: `commands/config.ts:417`
  - Current: specific examples include some pair phrases, but not full pair coverage (e.g., EUR<->GBP, EUR<->USD, GBP<->USD phrasing variants).
- Gap:
  - Not a hard blocker because generic `convert` trigger exists, but natural-language coverage is incomplete.

## Notes
- I did not include deposit/topup files by design.
- Payment link and conversion core services already support EUR/GBP in current implementation; this report focuses on remaining gaps.
