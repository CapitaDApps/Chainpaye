# ChainPaye

ChainPaye is a WhatsApp bot built on the WhatsApp Business API that enables seamless cross-border payments using the Toronet blockchain. The bot allows users to easily send money, make payments, and manage their finances directly through WhatsApp.

## Features

### Core Functionality

- **User Verification**: Secure user onboarding with WhatsApp number verification
- **Wallet Management**: Integration with Toronet blockchain for wallet creation and management
- **Cross-Border Payments**: Send money between users in different countries (e.g., US to Nigeria)
- **Bank Integration**: Deposit and withdraw funds to/from traditional bank accounts
- **Stablecoin Support**: Support for ToroUSD (US Dollar stablecoin) and ToroNGN (Nigerian Naira stablecoin)

### Key Capabilities

- **Payment Processing**: Enable payments for goods and services
- **Peer-to-Peer Transfers**: Send money directly to other WhatsApp users
- **Currency Conversion**: Automatic conversion between supported currencies
- **Transaction History**: View and track all transactions
- **Security**: PIN-based authentication and secure wallet management

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
```

### Project Structure

```
chainpaye-whatsapp/
├── src/
│   ├── config/           # Configuration files
│   │   └── database.ts   # MongoDB connection configuration
│   ├── models/           # Mongoose data models
│   │   ├── User.ts       # User schema and methods
│   │   ├── Transaction.ts # Transaction schema and methods
│   │   └── Wallet.ts     # Wallet schema and methods
│   ├── services/         # External API integrations
│   │   ├── ToronetService.ts      # Toronet blockchain API service
│   │   └── WhatsAppBusinessService.ts # WhatsApp Business API service
│   ├── utils/            # Utility functions
│   │   └── logger.ts     # Winston logging configuration
│   └── index.ts          # Main application entry point
├── logs/                 # Application logs
├── dist/                 # Compiled JavaScript output
├── package.json
├── tsconfig.json
└── README.md
```

## Technology Stack

### Backend

- **Node.js** - JavaScript runtime
- **TypeScript** - Type-safe JavaScript
- **MongoDB** - NoSQL database for user data and transactions
- **Mongoose** - MongoDB object modeling for Node.js

### External APIs

- **WhatsApp Business API** - For WhatsApp integration and messaging
- **Toronet Blockchain API** - For blockchain operations and wallet management

### Development Tools

- **Winston** - Structured logging
- **Axios** - HTTP client for API calls
- **dotenv** - Environment variable management
- **bcryptjs** - Password hashing for security
- **jsonwebtoken** - JWT token handling

## Getting Started

### Prerequisites

- Node.js 18+ installed
- MongoDB database access
- WhatsApp Business API credentials
- Toronet Blockchain API credentials

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd chainpaye-whatsapp
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file with your configuration:

   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/chainpaye

   # WhatsApp Business API
   WHATSAPP_API_URL=https://graph.facebook.com
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   WHATSAPP_ACCESS_TOKEN=your_access_token
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token

   # Toronet API
   TORONET_API_URL=https://api.toronet.com
   TORONET_ADMIN_USER=admin_username
   TORONET_ADMIN_PASSWORD=admin_password

   # Application
   NODE_ENV=development
   LOG_LEVEL=info
   ```

4. **Build the application**

   ```bash
   pnpm build
   ```

5. **Start the application**

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
- **currency**: User's default currency (USD or NGN)
- **isVerified**: Account verification status
- **toronetWalletId**: Associated Toronet wallet ID
- **pin**: Security PIN for transactions

### Wallet Model

- **user**: Reference to User model
- **toronetWalletId**: Toronet wallet identifier
- **publicKey**: Wallet public key
- **balances**: Stablecoin balances (ToroUSD, ToroNGN)
- **isActive**: Wallet activation status
- **isFrozen**: Wallet freeze status for security

### Transaction Model

- **referenceId**: Unique transaction reference
- **type**: Transaction type (payment, transfer, deposit, withdrawal)
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
2. Bot responds requesting user details (name, country, email)
3. User provides information
4. Bot sends verification code via WhatsApp
5. User confirms verification code
6. Account is created and verified

### 2. Wallet Setup

1. Verified user is prompted to set up a security PIN (4-6 digits)
2. Bot creates Toronet wallet automatically
3. Wallet is linked to user account
4. User can now perform transactions

### 3. Making Payments

1. User selects "Send Money" from menu
2. User enters recipient's WhatsApp number
3. User enters amount and confirms currency
4. User enters PIN for authentication
5. Transaction is processed via Toronet blockchain
6. Both parties receive confirmation messages

### 4. Bank Operations

1. **Deposit**: User selects "Deposit to Wallet"

   - Enters amount and bank details
   - Transaction initiated with bank
   - Funds converted to stablecoins and credited to wallet

2. **Withdrawal**: User selects "Withdraw to Bank"
   - Enters amount and bank details
   - Stablecoins converted and sent to bank
   - User receives confirmation

## Security Features

### Authentication

- **PIN-based Authentication**: 4-6 digit PIN required for all transactions
- **WhatsApp Number Verification**: Users verified through their WhatsApp number
- **Session Management**: Secure session handling with timeouts

### Data Protection

- **Encrypted Storage**: Sensitive data encrypted in database
- **API Security**: Secure API communication with authentication tokens
- **Audit Logging**: Comprehensive logging of all transactions and operations

### Fraud Prevention

- **Transaction Limits**: Configurable limits for transactions
- **Wallet Freezing**: Ability to freeze wallets for security reasons
- **Verification Codes**: Time-limited verification codes for sensitive operations

## API Integration

### WhatsApp Business API

- **Message Templates**: Pre-approved message templates for notifications
- **Interactive Messages**: Buttons and lists for user interaction
- **Webhook Handling**: Process incoming messages and status updates
- **Media Handling**: Support for images, documents, and other media

### Toronet Blockchain API

- **Wallet Management**: Create and manage blockchain wallets
- **Transaction Processing**: Send and receive stablecoin transactions
- **Balance Queries**: Real-time balance information
- **Exchange Rates**: Current exchange rate information
- **Bank Integration**: Connect with traditional banking systems

## Monitoring and Logging

### Application Logs

- **Structured Logging**: Winston-based logging with multiple levels
- **Log Rotation**: Automatic log file rotation to manage disk space
- **Error Tracking**: Comprehensive error logging and reporting
- **Performance Metrics**: Transaction processing times and success rates

### Monitoring

- **Health Checks**: Application and external API health monitoring
- **Database Monitoring**: MongoDB performance and connection monitoring
- **API Response Times**: Track external API response times
- **Transaction Metrics**: Success rates, failure reasons, and volumes

## Development Guidelines

### Code Style

- **TypeScript**: Strict TypeScript configuration for type safety
- **ESLint**: Code linting for consistent style
- **Modular Architecture**: Clear separation of concerns
- **Error Handling**: Comprehensive error handling throughout the application

### Testing

- **Unit Tests**: Test individual components and functions
- **Integration Tests**: Test API integrations and database operations
- **End-to-End Tests**: Test complete user flows
- **Mock Services**: Mock external APIs for testing

## Deployment

### Environment Setup

- **Development**: Local development with hot reload
- **Staging**: Pre-production environment for testing
- **Production**: Production environment with monitoring

### Deployment Process

1. **Build Application**: Compile TypeScript to JavaScript
2. **Database Migration**: Run database migrations if needed
3. **Environment Configuration**: Set up production environment variables
4. **Service Deployment**: Deploy to cloud provider or server
5. **Monitoring Setup**: Configure monitoring and alerting

## Troubleshooting

### Common Issues

- **Database Connection**: Check MongoDB connection string and credentials
- **API Authentication**: Verify API keys and tokens for external services
- **Message Delivery**: Check WhatsApp Business API configuration
- **Transaction Failures**: Review Toronet API responses and error codes

### Debugging

- **Log Analysis**: Check application logs for error details
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

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:

- **Email**: support@chainpaye.com
- **Documentation**: [Project Documentation](https://docs.chainpaye.com)
- **Issues**: [GitHub Issues](https://github.com/chainpaye/issues)
