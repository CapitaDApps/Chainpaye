# Payment Link Implementation Guide

## What Was Implemented

Payment links are now implemented end-to-end for WhatsApp:

1. Trigger-based command routing from incoming messages.
2. Payment-link flow launcher from WhatsApp messages.
3. Flow backend processing (`/flow/generate-link`) with:
   - Input validation
   - Currency/payment-method rule enforcement
   - PIN verification
   - Payment Link API call (`POST /payment-links`)
4. Final response sent in two ways:
   - In-flow success screen (`LINK_CREATED`)
   - Direct WhatsApp message containing the generated link
5. Upload-ready WhatsApp Flow JSON added.

## Files Added

- `commands/handlers/paymentLinkHandler.ts`
- `webhooks/payment_link_flow.json`
- `PAYMENT_LINK_IMPLEMENTATION.md`

## Files Updated

- `commands/config.ts`
- `commands/handlers/index.ts`
- `commands/route.ts`
- `config/whatsapp.ts`
- `services/WhatsAppBusinessService.ts`
- `webhooks/controllers/grl.controller.ts`
- `webhooks/services/grl.service.ts`

## Message Triggers Added

Examples that now open the payment-link flow:

- `/paymentlink`
- `/paymentlinks`
- `/createlink`
- `/getpaid`
- `payment link`
- `create payment link`
- `generate payment link`
- `request payment`
- `invoice link`
- `get paid`

## WhatsApp Flow JSON To Upload

Use:

- `webhooks/payment_link_flow.json`

This flow uses these screens:

- `CREATE_LINK_DETAILS`
- `SELECT_METHOD`
- `PIN`
- `LINK_CREATED` (terminal)

The backend endpoint it expects is:

- `POST /flow/generate-link`

## Required Environment Variables

Set these before testing:

- `WHATSAPP_PAYMENT_LINK_FLOW_ID` (or `WHATSAPP_STAGING_PAYMENT_LINK_FLOW_ID` on staging)
- `PAYMENT_LINK_API_BASE_URL` (example: `https://your-api-domain.com/api/v1`)

Optional:

- `PAYMENT_LINK_API_KEY`
- `PAYMENT_LINK_API_TIMEOUT_MS` (default `15000`)
- `PAYMENT_LINK_MERCHANT_ID` (falls back to user `userId`)
- `PAYMENT_LINK_PUBLIC_BASE_URL` (fallback URL builder for shared link)

## Currency Rules Enforced

- `NGN`: `bank` only
- `USD`: `bank` or `card`
- `GBP`: `card` only
- `EUR`: `card` only

## How To Test

1. Upload `webhooks/payment_link_flow.json` in WhatsApp Business Manager.
2. Publish it and set the generated flow ID to `WHATSAPP_PAYMENT_LINK_FLOW_ID`.
3. Ensure your server is running and reachable by Meta.
4. Ensure `PAYMENT_LINK_API_BASE_URL` points to your payment-link API from `PaymentLink.md`.
5. From WhatsApp, send: `payment link`.
6. Complete the flow:
   - Title
   - Amount
   - Currency
   - Optional description/success URL
   - Payment method
   - PIN
7. Verify both results:
   - Flow reaches `LINK_CREATED` with `link_url`
   - A normal WhatsApp message is sent with the created payment link

## Error Cases You Can Verify

- Wrong PIN -> stays on `PIN` with error
- Invalid amount -> validation error in flow
- Invalid currency/method combination -> validation error in flow
- Missing session token -> session-expired error
- Payment API unavailable -> flow returns API error on `PIN` screen
