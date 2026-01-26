# Testing Off-ramp Flow

This guide explains how to test the complete off-ramp flow implementation, including both the conversational WhatsApp interface and the WhatsApp Flow interface.

## Overview

The off-ramp flow has been implemented with two interfaces:
1. **Conversational Interface**: Traditional WhatsApp chat-based interaction
2. **WhatsApp Flow Interface**: Interactive form-based flow for better UX

## Prerequisites

1. **Environment Setup**: Ensure all environment variables are configured
2. **Services Running**: Start the development server
3. **Test Data**: Have test user accounts and wallet addresses ready

## Testing the Conversational Interface

### 1. Start Off-ramp Process

Send a WhatsApp message:
```
offramp
```

Expected response: Display of user wallets and supported assets.

### 2. Asset Selection

Send a message specifying asset and chain:
```
USDC on Solana
```
or
```
USDT BEP20
```

Expected response: Wallet address and deposit instructions.

### 3. Spend Crypto

After depositing crypto, send:
```
spend crypto
```

Expected response: Request for NGN amount.

### 4. Amount Input

Send the desired NGN amount:
```
50000
```

Expected response: Bank selection list.

### 5. Bank Selection

Select a bank by number or name:
```
1
```
or
```
Access Bank
```

Expected response: Request for account number.

### 6. Account Number

Enter your account number:
```
1234567890
```

Expected response: Account verification and confirmation request.

### 7. Account Confirmation

Confirm the account details:
```
yes
```

Expected response: Quote generation and display.

### 8. Transaction Confirmation

Proceed with the transaction:
```
proceed
```

Expected response: PIN request.

### 9. PIN Verification

Enter your 4-digit PIN:
```
1234
```

Expected response: Transaction processing and completion.

## Testing the WhatsApp Flow Interface

### 1. Flow Endpoint Testing

Use the test script to test the flow endpoints:

```bash
node scripts/test-offramp-flow.js
```

This will test all flow screens in sequence.

### 2. Manual Flow Testing

You can test individual flow screens using curl or Postman:

```bash
curl -X POST http://localhost:3000/webhook/offramp-flow \
  -H "Content-Type: application/json" \
  -d '{
    "version": "3.0",
    "action": "data_exchange",
    "screen": "OFFRAMP_ASSET_SELECTION",
    "data": {
      "asset": "USDC",
      "chain": "solana"
    },
    "flow_token": "base64_encoded_token"
  }'
```

### 3. Flow Screens

The flow includes these screens:
1. `OFFRAMP_ASSET_SELECTION` - Select asset and chain
2. `OFFRAMP_WALLET_DISPLAY` - Show wallet information
3. `OFFRAMP_AMOUNT_INPUT` - Enter NGN amount
4. `OFFRAMP_BANK_SELECTION` - Select bank
5. `OFFRAMP_ACCOUNT_INPUT` - Enter account number
6. `OFFRAMP_ACCOUNT_CONFIRMATION` - Confirm account details
7. `OFFRAMP_QUOTE_REVIEW` - Review quote and fees
8. `OFFRAMP_PIN_VERIFICATION` - Enter PIN
9. `OFFRAMP_SUCCESS` - Transaction completion

## Testing Scripts

### 1. Complete Off-ramp Test

```bash
node scripts/manual-test-offramp.js
```

Tests the complete off-ramp process with real API calls.

### 2. Wallet Address Test

```bash
node scripts/test-wallet-addresses.js
```

Verifies wallet address configuration for all supported chains.

### 3. Flow Integration Test

```bash
node scripts/test-offramp-flow.js
```

Tests the WhatsApp Flow endpoints and data flow.

### 4. Notification Test

```bash
node scripts/test-notifications.js
```

Tests deposit and success notifications.

## Error Scenarios to Test

### 1. Invalid Asset/Chain Combinations

- USDT on Base (not supported)
- BTC on any chain (not supported)

### 2. Insufficient Balance

- Try to withdraw more than available balance
- Account with zero balance

### 3. Invalid Input Formats

- Invalid account numbers (not 10 digits)
- Invalid amounts (below minimum, above maximum)
- Invalid PIN format

### 4. Account Resolution Failures

- Non-existent account numbers
- Inactive accounts
- Bank service unavailable

### 5. Quote Expiration

- Wait more than 10 minutes after quote generation
- Try to proceed with expired quote

### 6. Network Issues

- Crossmint API failures
- DexPay API failures
- Database connection issues

## Expected Behaviors

### Success Flow

1. **Asset Selection**: Validates combination and creates/retrieves wallet
2. **Deposit Detection**: Sends immediate notification when crypto is received
3. **Amount Validation**: Checks minimum (₦1,000) and maximum (₦5,000,000) limits
4. **Bank Integration**: Fetches real bank list from DexPay
5. **Account Resolution**: Verifies account details with bank
6. **Quote Generation**: Calculates real-time rates and fees
7. **Balance Check**: Ensures sufficient crypto including fees
8. **PIN Verification**: Validates user PIN securely
9. **Transaction Execution**: Transfers crypto and completes off-ramp
10. **Success Notification**: Sends detailed completion message

### Error Handling

1. **Graceful Failures**: All errors return user-friendly messages
2. **Session Management**: Sessions expire after 30 minutes
3. **Retry Logic**: Users can retry failed steps
4. **Support Integration**: Error messages include support contact info

## Monitoring and Logs

### Log Files

- `logs/combined.log` - All application logs
- `logs/error.log` - Error-specific logs

### Key Log Events

- Off-ramp session creation
- Asset/chain selection
- Wallet creation/retrieval
- Balance checks
- Quote generation
- Transaction execution
- Success/failure notifications

### Metrics to Monitor

- Off-ramp completion rate
- Average transaction time
- Error rates by step
- Popular asset/chain combinations
- Fee collection amounts

## Troubleshooting

### Common Issues

1. **Session Expired**: User took too long, restart with `offramp`
2. **Insufficient Balance**: Check wallet balance and deposit more
3. **Invalid Account**: Verify account number and bank selection
4. **Quote Expired**: Generate new quote by restarting process
5. **PIN Issues**: Ensure PIN is set and correct

### Debug Commands

```bash
# Check Redis sessions
redis-cli keys "offramp_session:*"

# View session data
redis-cli get "offramp_session:+2348106535142"

# Check user data
node -e "
const { userService } = require('./services');
userService.getUser('+2348106535142').then(console.log);
"
```

## Integration with WhatsApp Business

### Flow Registration

1. Create flow in Meta Business Suite
2. Upload the `webhooks/offramp_flow.json` configuration
3. Set webhook endpoint to `/webhook/offramp-flow`
4. Test flow in WhatsApp Business API

### Template Messages

Create template messages for:
- Deposit notifications with "Spend Crypto" CTA
- Transaction completion confirmations
- Error notifications with retry options

## Security Considerations

### Flow Token Validation

- Implement proper JWT token verification
- Validate token expiration
- Verify token signature

### PIN Security

- Never log PIN values
- Use secure comparison methods
- Implement rate limiting for PIN attempts

### Transaction Security

- Validate all amounts and addresses
- Implement transaction limits
- Log all financial operations

## Performance Optimization

### Caching

- Cache bank lists for 1 hour
- Cache exchange rates for 5 minutes
- Cache user wallet data for 10 minutes

### Database Optimization

- Index frequently queried fields
- Use connection pooling
- Implement query timeouts

### API Rate Limiting

- Implement rate limiting for external APIs
- Use exponential backoff for retries
- Monitor API usage quotas

## Conclusion

The off-ramp flow provides a comprehensive crypto-to-fiat conversion system with both conversational and flow-based interfaces. Regular testing ensures reliability and user satisfaction.

For support or questions, contact the development team or refer to the API documentation.