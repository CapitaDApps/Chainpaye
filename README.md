# ChainPaye

ChainPaye is a WhatsApp bot built on the WhatsApp Business API that enables seamless cross-border payments using the Toronet blockchain. The bot allows users to easily send money, make payments, and manage their finances directly through WhatsApp.

## Features

### Core Functionality

- **User Verification**: Secure user onboarding with WhatsApp number verification
- **Wallet Management**: Integration with Toronet blockchain for wallet creation and management
- **Cross-Border Payments**: Send money between users in different countries (e.g., US to Nigeria, UK to Nigeria)
- **Multi-Currency Support**: Support for USD, EUR, GBP, and NGN
- **Bank Integration**: Deposit and withdraw funds to/from traditional bank accounts

### Key Capabilities

- **Peer-to-Peer Transfers**: Send money directly to other ChainPaye users via WhatsApp
- **Bank Transfers**: Withdraw funds from your ChainPaye wallet to your bank account
- **Currency Conversion**: Convert between supported currencies (USD, EUR, GBP, NGN)
- **Crypto Off-Ramp**: Off-ramp crypto assets directly to fiat in under 50 seconds
- **Payment Links**: Generate payment links to receive payments in USD, EUR, GBP, or NGN
- **Transaction History**: View and track all your transactions
- **Account Information**: Check your wallet balances and account details instantly
- **Flow-Based Interactions**: Interactive WhatsApp Flows for seamless user experience

### WhatsApp Commands

The bot supports both command-based and natural language triggers:

- `/banktransfer` or "withdraw" - Transfer from wallet to bank accounts
- `/convert` or "currency" - Convert between fiat currencies
- `/deposit` or "top up" - Top up your ChainPaye wallet
- `/myaccount` or "balance" - View account details and balances
- `/offramp` or "sell crypto" - Off-ramp crypto to fiat
- `/sendmoney` or "transfer" - Transfer money to another ChainPaye user
- `/transactionhistory` or "history" - View past transactions

## Architecture

### System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WhatsApp      │    │   ChainPaye     │    │   Toronet      │
│   Business API  │◄──►│   WhatsApp Bot  │◄──►│   Blockchain   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   MongoDB       │
                       │   Database      │
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Redis         │
                       │   Cache         │
                       └─────────────────┘
```

### Project Structure

```
chainpaye-whatsapp/
├── commands/              # Command handlers and routing
│   ├── handlers/          # Individual command handlers
│   │   ├── accountInfoHandler.ts
│   │   ├── conversionHandler.ts
│   │   ├── cryptoTopUpHandler.ts
│   │   ├── topUpHandler.ts
│   │   ├── transactionHandler.ts
│   │   ├── transferHandler.ts
│   │   └── withdrawalHandler.ts
│   ├── config.ts          # Command configuration and triggers
│   └── route.ts           # Command routing logic
├── config/                # Configuration files
│   ├── constants.ts       # Application constants
│   └── database.ts        # MongoDB connection configuration
├── jobs/                  # Background jobs (Agenda)
│   ├── topUp/            # Top-up job definitions
│   ├── cryptoTopUp/      # Crypto top-up job definitions
│   ├── config.ts         # Job configuration
│   ├── definitions.ts    # Job definitions
│   ├── index.ts          # Job initialization
│   └── types.ts          # Job type definitions
├── models/                # Mongoose data models
│   ├── User.ts           # User schema and methods
│   ├── Transaction.ts    # Transaction schema and methods
│   └── Wallet.ts         # Wallet schema and methods
├── services/              # External API integrations
│   ├── ToronetService.ts      # Toronet blockchain API service
│   ├── TransactionService.ts  # Transaction processing service
│   ├── UserService.ts         # User management service
│   ├── WalletService.ts       # Wallet operations service
│   ├── WhatsAppBusinessService.ts # WhatsApp Business API service
│   ├── redis.ts               # Redis client configuration
│   └── ipdata.ts              # IP geolocation service
├── utils/                 # Utility functions
│   ├── countryCodeMapping.ts
│   ├── generateReceipt.ts
│   ├── logger.ts         # Winston logging configuration
│   └── sendReceipt.ts
├── webhooks/              # Webhook handling
│   ├── controllers/      # Flow controllers
│   │   ├── conversion.controller.ts
│   │   ├── cryptoTopUp.controller.ts
│   │   ├── invoice.controller.ts
│   │   ├── setupPinFlow.controller.ts
│   │   ├── topUpFlow.controller.ts
│   │   ├── transferFlow.controller.ts
│   │   ├── userSetup.controller.ts
│   │   └── withdrawalFlow.controller.ts
│   ├── middlewares/      # Webhook middlewares
│   │   └── flowEncryption.middleware.ts
│   ├── route/            # Flow routes
│   ├── services/         # Flow services
│   ├── utils/            # Webhook utilities
│   ├── types/            # Type definitions
│   ├── encryption.ts     # Encryption utilities
│   ├── flow.ts           # Flow handling
│   ├── index.ts          # Webhook entry point
│   └── middleware.ts     # Express middleware
├── logs/                 # Application logs
├── public/               # Static files
├── templates/            # Receipt templates
├── index.ts              # Main application entry point
├── package.json
├── tsconfig.json
├── .env                  # Production environment variables
├── .env.development      # Development environment variables
└── README.md
```

## Technology Stack

### Backend

- **Node.js** - JavaScript runtime
- **TypeScript** - Type-safe JavaScript
- **Express** - Web framework for API endpoints
- **MongoDB** - NoSQL database for user data and transactions
- **Mongoose** - MongoDB object modeling for Node.js
- **Redis** - In-memory data store for caching and session management
- **Agenda** - Job scheduling for background tasks

### External APIs

- **WhatsApp Business API** - For WhatsApp integration and messaging (v24.0)
- **WhatsApp Flows** - Interactive flows for enhanced user experience
- **Toronet Blockchain API** - For blockchain operations and wallet management

### Security & Performance

- **Helmet** - Security middleware for Express
- **Express Rate Limit** - Rate limiting to prevent abuse
- **Argon2** - Password hashing for PIN security
- **Crypto-js** - Encryption utilities
- **Joi** - Data validation

### Development Tools

- **Winston** - Structured logging
- **Axios** - HTTP client for API calls
- **dotenv** - Environment variable management
- **UUID** - Unique ID generation
- **Handlebars** - Template engine for receipts

## Getting Started

### Prerequisites

- Node.js 18+ installed
- MongoDB database access
- WhatsApp Business API credentials (v24.0)
- Toronet Blockchain API credentials
- Redis server for caching

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd Chainpaye
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   The application automatically loads environment variables based on the `NODE_ENV`:
   - Production: Loads from `.env`
   - Development: Loads from `.env.development`

   ```bash
   # For development
   cp .env.example .env.development

   # For production
   cp .env.example .env
   ```

   Edit the environment file with your configuration:

   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/chainpaye

   # Redis
   REDIS_URL=redis://localhost:6379

   # WhatsApp Business API (v24.0)
   GRAPH_API_TOKEN=your_access_token
   BUSINESS_PHONE_NUMBER_ID=your_phone_number_id
   VERIFY_TOKEN=your_verify_token
   APP_SECRET=your_app_secret

   # Private Key for Flow Encryption
   PRIVATE_KEY=your_private_key
   PASSPHRASE=your_passphrase

   # Toronet API
   TORONET_API_URL=https://api.toronet.com
   TORONET_ADMIN_ADDRESS=admin_username
   TORONET_ADMIN_PASSWORD=admin_password

   # Application
   NODE_ENV=development
   LOG_LEVEL=info
   PORT=3000
   ```

4. **Set NODE_ENV**

   ```bash
   # For development
   export NODE_ENV=development

   # For production
   export NODE_ENV=production
   ```

5. **Build the application**

   ```bash
   pnpm build
   ```

6. **Start the application**

   ```bash
   pnpm start
   ```

   For development with hot reload:

   ```bash
   pnpm dev
   ```

## Database Schema

### User Model

- **whatsappNumber**: User's WhatsApp phone number (unique identifier)
- **firstName**: User's first name
- **lastName**: User's last name
- **email**: User's email (optional)
- **country**: User's country code (ISO 3166-1 alpha-2)
- **currency**: User's default currency (USD, EUR, GBP, or NGN)
- **isVerified**: Account verification status
- **toronetWalletId**: Associated Toronet wallet ID
- **pin**: Security PIN for transactions (hashed with Argon2)

### Wallet Model

- **userId**: Reference to User model
- **toronetWalletId**: Toronet wallet identifier
- **publicKey**: Wallet public key
- **balances**: Stablecoin balances (ToroUSD, ToroNGN, etc.)
- **isActive**: Wallet activation status
- **isFrozen**: Wallet freeze status for security

### Transaction Model

- **referenceId**: Unique transaction reference
- **type**: Transaction type (payment, transfer, deposit, withdrawal, conversion, crypto-offramp)
- **status**: Transaction status (pending, processing, completed, failed)
- **fromUser**: Sender user reference
- **toUser**: Recipient user reference
- **amount**: Transaction amount
- **currency**: Transaction currency
- **toronetTransactionId**: Toronet blockchain transaction ID
- **bankDetails**: Bank account information for deposits/withdrawals

## User Flow

### 1. User Registration

1. User sends a message to the ChainPaye WhatsApp number
2. Bot responds with an interactive WhatsApp Flow for user details
3. User provides information (name, country, email)
4. Account is created and verified
5. User is prompted to set up a security PIN

### 2. Wallet Setup

1. Verified user sets up a security PIN (4-6 digits)
2. Bot creates Toronet wallet automatically
3. Wallet is linked to user account
4. User can now perform transactions

### 3. Making Payments

1. User selects "Send Money" from menu or sends `/sendmoney`
2. User enters recipient's WhatsApp number
3. User enters amount and confirms currency
4. User enters PIN for authentication
5. Transaction is processed via Toronet blockchain
6. Both parties receive confirmation messages

### 4. Bank Withdrawals

1. User selects "Withdraw to Bank" or sends `/banktransfer`
2. User selects withdrawal currency
3. User enters amount and bank details
4. User confirms with PIN
5. Funds are transferred to user's bank account
6. User receives confirmation

### 5. Currency Conversion

1. User selects "Convert" or sends `/convert`
2. User selects source and target currencies
3. User enters amount
4. System processes conversion
5. User receives confirmation with new balances

### 6. Crypto Off-Ramp

1. User selects "Off-ramp" or sends `/offramp`
2. User selects crypto network
3. User sends crypto to provided address
4. System detects transaction and converts to fiat
5. User receives fiat in wallet within 50 seconds

## Security Features

### Authentication

- **PIN-based Authentication**: 4-6 digit PIN required for all transactions (hashed with Argon2)
- **WhatsApp Number Verification**: Users verified through their WhatsApp number
- **Session Management**: Secure session handling with Redis
- **Flow Token Encryption**: Encrypted flow tokens for secure data exchange

### Data Protection

- **Encrypted Storage**: Sensitive data encrypted in database
- **API Security**: Secure API communication with authentication tokens
- **Webhook Signature Verification**: Verify incoming webhook signatures
- **Helmet**: Security headers for Express

### Fraud Prevention

- **Transaction Limits**: Configurable limits for transactions
- **Wallet Freezing**: Ability to freeze wallets for security reasons
- **Rate Limiting**: Prevent abuse with rate limiting middleware
- **Audit Logging**: Comprehensive logging of all transactions and operations

## API Integration

### WhatsApp Business API (v24.0)

- **Message Templates**: Pre-approved message templates for notifications
- **Interactive Flows**: WhatsApp Flows for enhanced user experience
- **Webhook Handling**: Process incoming messages and status updates
- **Media Handling**: Support for images, documents, and other media
- **Read Receipts**: Message read confirmation
- **Typing Indicators**: Show typing status for better UX

### Toronet Blockchain API

- **Wallet Management**: Create and manage blockchain wallets
- **Transaction Processing**: Send and receive stablecoin transactions
- **Balance Queries**: Real-time balance information
- **Virtual Wallet Updates**: Update virtual wallet for indirect transfers
- **Exchange Rates**: Current exchange rate information

## Monitoring and Logging

### Application Logs

- **Structured Logging**: Winston-based logging with multiple levels
- **Log Rotation**: Automatic log file rotation to manage disk space
- **Error Tracking**: Comprehensive error logging and reporting

### Monitoring

- **Health Checks**: Application health check endpoint at `/`
- **Database Monitoring**: MongoDB connection monitoring
- **API Response Times**: Track external API response times
- **Transaction Metrics**: Success rates, failure reasons, and volumes

## Development Guidelines

### Code Style

- **TypeScript**: Strict TypeScript configuration for type safety
- **Modular Architecture**: Clear separation of concerns
- **Error Handling**: Comprehensive error handling throughout the application
- **Service Layer Pattern**: Business logic in service layer

### Environment Management

The application uses environment-based dotenv loading:

- **Development**: Set `NODE_ENV=development` to load from `.env.development`
- **Production**: Set `NODE_ENV=production` to load from `.env`

This ensures sensitive production credentials are never used in development.

## Deployment

### Environment Setup

- **Development**: Local development with hot reload (`pnpm dev`)
- **Production**: Production environment with monitoring

### Deployment Process

1. **Set Environment**: Configure `NODE_ENV=production`
2. **Install Dependencies**: Run `pnpm install --production`
3. **Build Application**: Run `pnpm build`
4. **Set Environment Variables**: Ensure `.env` is configured with production values
5. **Start Application**: Run `pnpm start` or use a process manager like PM2

### Using PM2 (Recommended for Production)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# View logs
pm2 logs chainpaye

# Restart application
pm2 restart chainpaye
```

## Troubleshooting

### Common Issues

- **Database Connection**: Check MongoDB connection string and credentials
- **API Authentication**: Verify API keys and tokens for external services
- **Message Delivery**: Check WhatsApp Business API configuration and Flow IDs
- **Transaction Failures**: Review Toronet API responses and error codes
- **Redis Connection**: Ensure Redis server is running

### Debugging

- **Log Analysis**: Check application logs in the `logs/` directory
- **API Testing**: Test external APIs independently
- **Database Queries**: Verify database operations and data integrity
- **Network Issues**: Check network connectivity and firewall settings

## Contributing

### Development Workflow

1. Clone the repository
2. Create a feature branch
3. Make changes with proper testing
4. Create a pull request with description
5. Code review and merge

### Code Review Guidelines

- **Functionality**: Verify the feature works as expected
- **Code Quality**: Check for clean, maintainable code
- **Testing**: Ensure adequate test coverage
- **Documentation**: Update documentation as needed

## License

MIT License - see LICENSE file for details

## Support

For support, email support@chainpaye.com or open an issue in the repository.
