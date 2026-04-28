# ChainPaye

ChainPaye is a WhatsApp-based cross-border payment bot built on the WhatsApp Business API. It enables users to send money, off-ramp crypto, manage multi-chain wallets, and withdraw to bank accounts — all through WhatsApp, with no app download required.

## Features

- **User Onboarding & KYC**: WhatsApp number-based registration with KYC verification, PIN setup (Argon2-hashed), and email verification
- **Multi-Chain Wallets**: EVM (BSC, Base, Arbitrum), Solana, and Stellar wallets via Crossmint; stablecoin support (USDC, USDT)
- **Peer-to-Peer Transfers**: Send money directly to other ChainPaye users
- **Bank Withdrawals**: Withdraw to bank accounts via Linkio payout integration
- **Crypto Off-Ramp**: Off-ramp crypto assets to fiat in under 50 seconds
- **Currency Conversion**: Convert between USD, EUR, GBP, and NGN
- **Payment Links**: Generate shareable links to receive payments in USD, EUR, GBP, or NGN
- **Image Payment Detection**: AI-powered payment detection from images (OpenAI)
- **Referral System**: Referral codes, earnings tracking (flat fee + percentage), leaderboard, and withdrawal
- **Transaction History & Receipts**: Full history with PDF receipt generation
- **Admin Dashboard**: User management, transaction oversight, referral withdrawals, leaderboard

## WhatsApp Commands

| Command / Trigger | Action |
|---|---|
| `menu` / `start` | Show main menu |
| `/sendmoney` / `transfer` | Transfer to another user |
| `/banktransfer` / `withdraw` | Withdraw to bank account |
| `/deposit` / `top up` | Top up wallet |
| `/offramp` / `sell crypto` | Off-ramp crypto to fiat |
| `/convert` / `currency` | Convert between currencies |
| `/myaccount` / `balance` | View account & balances |
| `/wallets` | View all crypto wallet addresses |
| `/transactionhistory` / `history` | View past transactions |
| `/paymentlink` | Generate a payment link |
| `/referral` | View referral dashboard |
| `/buycrypto` | On-ramp fiat to crypto |
| `/resetpin` | Reset your PIN |
| `/support` | Contact support |

## Architecture

```
WhatsApp Business API (v24.0)
        │
        ▼
Express.js Server
├── /webhook          — Incoming messages & flow replies
├── /flow/*           — WhatsApp Flow endpoints (20+ flows)
├── /admin/*          — Admin API (auth, users, transactions, referrals)
└── /                 — Health check
        │
        ├── Command Router — Parses text messages, routes to handlers
        ├── Service Layer  — Business logic (User, Transaction, Wallet, Referral, etc.)
        └── Job Scheduler  — Agenda background jobs (top-up polling, referral notifications)
        │
        ├── MongoDB        — Users, transactions, wallets, referrals
        ├── Redis          — Sessions, caching, referral state
        └── External APIs
            ├── Toronet     — Stablecoin wallet & transfers
            ├── Crossmint   — Multi-chain wallet management
            ├── Linkio      — Bank payout processing
            ├── Paystack    — Bank list & account resolution
            ├── OpenAI      — Image payment detection
            └── Zoho Mail   — Email notifications (SMTP)
```

## Project Structure

```
chainpaye-whatsapp/
├── commands/              # Command routing and handlers
│   ├── handlers/          # One handler per feature
│   ├── config.ts          # Command triggers and aliases
│   └── route.ts           # Message-to-command routing
├── config/                # App configuration (DB, env, constants)
├── controllers/           # Admin API controllers
├── jobs/                  # Agenda background jobs
├── models/                # Mongoose schemas (User, Transaction, Wallet, etc.)
├── repositories/          # Data access layer
├── routes/                # Express route definitions
├── services/              # External API integrations and business logic
│   └── crypto-off-ramp/   # Off-ramp workflow services
├── templates/             # Handlebars receipt templates
├── types/                 # Shared TypeScript types
├── utils/                 # Helpers (receipt generation, logging, etc.)
├── webhooks/              # WhatsApp webhook handling
│   ├── controllers/       # Flow-specific controllers
│   ├── services/          # Flow-specific services
│   ├── middlewares/       # Flow encryption middleware
│   └── *.json             # WhatsApp Flow definitions
└── public/                # Static assets (admin UI, reset PIN page)
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB
- Redis
- WhatsApp Business API credentials
- Crossmint API credentials
- Toronet API credentials

### Installation

```bash
pnpm install
cp .env.example .env
# Fill in your credentials in .env
```

### Running

```bash
# Development (hot reload)
pnpm dev

# Production
pnpm build
pnpm start

# PM2 (recommended for production)
pm2 start ecosystem.config.js
```

### Testing

```bash
pnpm test
pnpm test:coverage
pnpm typecheck
```

## Environment Variables

See `.env.example` for the full list. Key groups:

| Group | Variables |
|---|---|
| Database | `MONGODB_URI` |
| Redis | `REDIS_URL` |
| WhatsApp | `WHATSAPP_API_URL`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_VERSION` |
| Flow Encryption | `PRIVATE_KEY`, `PASSPHRASE` |
| WhatsApp Flow IDs | `WHATSAPP_*_FLOW_ID` (20+ flows, production + staging variants) |
| Crossmint | `CROSSMINT_API_KEY`, `CROSSMINT_ADMIN_EVM_ADDRESS`, `CROSSMINT_ADMIN_SOLANA_ADDRESS`, `CROSSMINT_ADMIN_EVM_PRIVATE_KEY`, `CROSSMINT_ADMIN_SOLANA_PRIVATE_KEY` |
| Stellar | `STELLAR_RECEIVING_ADDRESS`, `STELLAR_MEMO_TYPE`, `STELLAR_MEMO_VALUE` |
| Toronet | `TORONET_API_URL`, `TORONET_ADMIN_ADDRESS`, `TORONET_ADMIN_PASSWORD` |
| Linkio | `LINKIO_SEC_KEY` |
| Paystack | `PAYSTACK_SECRET_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Email (SMTP) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Security | `JWT_SECRET`, `JWT_EXPIRES_IN`, `PIN_SALT_ROUNDS` |
| Offramp Fees | `OFFRAMP_FLAT_FEE_USD`, `OFFRAMP_SPREAD_NGN`, `OFFRAMP_MIN_AMOUNT_NGN`, `OFFRAMP_MAX_AMOUNT_NGN` |
| Referral Withdrawals | `REFERRAL_WITHDRAWAL_MIN_AMOUNT`, `REFERRAL_WITHDRAWAL_FREQUENCY_DAYS`, `REFERRAL_WITHDRAWAL_CHAIN`, `REFERRAL_WITHDRAWAL_TOKEN` |
| App | `NODE_ENV`, `PORT`, `LOG_LEVEL` |

### Staging Environment

Running on `PORT=3001` activates staging mode, which restricts access to numbers listed in `STAGING_ALLOWED_WHATSAPP_NUMBERS`. Each feature has a corresponding `WHATSAPP_STAGING_*_FLOW_ID` variable.

## Webhook Setup

1. Set your webhook URL in the WhatsApp Business API dashboard: `https://your-domain.com/webhook`
2. Set the verify token to match `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
3. Subscribe to: `messages`, `message_status`, `message_template_status_update`

## License

MIT
