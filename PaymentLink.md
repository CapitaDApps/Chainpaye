# ChainPaye Payment Link API Documentation

## Base URL

```
https://your-api-domain.com/api/v1
```

## Authentication

Currently, all endpoints are public. In production, implement proper authentication and authorization.

## CORS (Cross-Origin Resource Sharing)

The API supports cross-origin requests from frontend applications.

### CORS Configuration

- **Allowed Origins:** Configurable via `CORS_ORIGIN` environment variable
- **Allowed Methods:** GET, POST, PUT, PATCH, DELETE, OPTIONS
- **Credentials:** Supported (cookies and authentication headers)
- **Exposed Headers:** Rate limit headers are exposed for client monitoring

### Development

```bash
CORS_ORIGIN=*  # Allows all origins
```

### Production

```bash
CORS_ORIGIN=https://chainpaye.com,https://www.chainpaye.com
```

For detailed CORS configuration, see [CORS_CONFIGURATION.md](CORS_CONFIGURATION.md).

## Rate Limiting

The API implements comprehensive rate limiting to ensure fair usage and protect against abuse. All requests are subject to rate limits based on IP address and endpoint type.

### Rate Limit Headers

All responses include rate limit information in headers:

- `RateLimit-Limit`: Maximum number of requests allowed in the window
- `RateLimit-Remaining`: Number of requests remaining in the current window
- `RateLimit-Reset`: Unix timestamp when the rate limit resets

### Rate Limit Configuration

| Endpoint Type         | Limit | Window     | Applies To            |
| --------------------- | ----- | ---------- | --------------------- |
| Burst Protection      | 20    | 1 minute   | All endpoints         |
| General API           | 100   | 15 minutes | All endpoints         |
| Payment Link Creation | 20    | 10 minutes | POST /payment-links   |
| Payment Access        | 50    | 5 minutes  | GET/POST /payment/:id |
| Transaction Recording | 30    | 5 minutes  | POST /transactions    |
| Read Operations       | 200   | 15 minutes | All GET requests      |
| Sensitive Operations  | 10    | 30 minutes | PATCH enable/disable  |

### Rate Limit Exceeded Response

When rate limit is exceeded, the API returns HTTP 429:

```json
{
  "success": false,
  "error": "Too many requests",
  "message": "Too many requests from this IP, please try again later.",
  "retryAfter": "15 minutes",
  "timestamp": "2026-02-07T12:00:00.000Z",
  "correlationId": "rate-limit-exceeded"
}
```

For detailed rate limiting documentation, see [RATE_LIMITING.md](RATE_LIMITING.md).

## Common Response Format

All API responses follow this standard format:

```json
{
  "success": boolean,
  "data": object | array | null,
  "message": string,
  "error": string | null,
  "timestamp": string (ISO 8601),
  "correlationId": string
}
```

## Error Handling

- **400 Bad Request**: Validation errors, invalid parameters
- **404 Not Found**: Resource not found
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server errors

---

## Health Check

### GET /health

Check API health status.

**Response:**

```json
{
  "success": true,
  "message": "Payment Link System API is running",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "version": "1.0.0"
}
```

---

## Payment Links

### POST /payment-links

Create a new payment link.

**Request Body:**

```json
{
  "merchantId": "string (required, 1-255 chars)",
  "userId": "string (required, 1-255 chars)",
  "name": "string (required, 1-100 chars)",
  "amount": "string (required, decimal as string)",
  "currency": "NGN | USD | GBP | EUR (required)",
  "token": "string (required, 1-100 chars)",
  "selectedCurrency": "string (required, 1-10 chars)",
  "paymentType": "bank | card (required)",
  "description": "string (optional, max 500 chars)",
  "successUrl": "string (optional, max 500 chars)",
  "metadata": "object (optional)"
}
```

**Currency & Payment Type Rules:**

- **NGN**: Only `"paymentType": "bank"` allowed
- **USD**: Both `"bank"` and `"card"` allowed
- **GBP, EUR**: only `"card"` allowed

**Example Request:**

```json
{
  "merchantId": "merchant-123",
  "userId": "user-456",
  "name": "Tech Solutions Ltd",
  "amount": "250.00",
  "currency": "USD",
  "token": "USDT",
  "selectedCurrency": "USD",
  "paymentType": "card",
  "description": "Professional services payment",
  "successUrl": "https://mysite.com/success"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "merchantId": "merchant-123",
    "userId": "user-456",
    "name": "Tech Solutions Ltd",
    "amount": "250.00",
    "currency": "USD",
    "description": "Professional services payment",
    "isActive": true,
    "address": "0x3c45e44daae997b3ac8644ff3fdd13c120634f10",
    "token": "USDT",
    "selectedCurrency": "USD",
    "paymentType": "card",
    "successUrl": "https://mysite.com/success",
    "linkUrl": "https://chainpaye.com/payment/507f1f77bcf86cd799439011",
    "metadata": {},
    "createdAt": "2026-02-04T10:00:00.000Z",
    "updatedAt": "2026-02-04T10:00:00.000Z"
  },
  "message": "Payment link created successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "abc123-def456"
}
```

### GET /payment-links/:id

Get payment link by ID.

**Parameters:**

- `id` (path): Payment link ID

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "merchantId": "merchant-123",
    "userId": "user-456",
    "name": "Tech Solutions Ltd",
    "amount": "250.00",
    "currency": "USD",
    "description": "Professional services payment",
    "isActive": true,
    "address": "0x3c45e44daae997b3ac8644ff3fdd13c120634f10",
    "token": "USDT",
    "selectedCurrency": "USD",
    "paymentType": "card",
    "successUrl": "https://mysite.com/success",
    "linkUrl": "https://chainpaye.com/payment/507f1f77bcf86cd799439011",
    "metadata": {},
    "createdAt": "2026-02-04T10:00:00.000Z",
    "updatedAt": "2026-02-04T10:00:00.000Z"
  },
  "message": "Payment link retrieved successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "xyz789-abc123"
}
```

### GET /payment-links

List payment links for a merchant with pagination.

**Query Parameters:**

- `merchantId` (required): Merchant ID to filter by
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `sortBy` (optional): Field to sort by
- `sortOrder` (optional): `asc` or `desc`

**Example Request:**

```
GET /payment-links?merchantId=merchant-123&page=1&limit=10&sortBy=createdAt&sortOrder=desc
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "paymentLinks": [
      {
        "id": "507f1f77bcf86cd799439011",
        "merchantId": "merchant-123",
        "userId": "user-456",
        "name": "Tech Solutions Ltd",
        "amount": "250.00",
        "currency": "USD",
        "description": "Professional services payment",
        "isActive": true,
        "address": "0x3c45e44daae997b3ac8644ff3fdd13c120634f10",
        "token": "USDT",
        "selectedCurrency": "USD",
        "paymentType": "card",
        "successUrl": "https://mysite.com/success",
        "linkUrl": "https://chainpaye.com/payment/507f1f77bcf86cd799439011",
        "metadata": {},
        "createdAt": "2026-02-04T10:00:00.000Z",
        "updatedAt": "2026-02-04T10:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10
  },
  "message": "Payment links retrieved successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "list123-def456"
}
```

### PATCH /payment-links/:id/disable

Disable a payment link.

**Parameters:**

- `id` (path): Payment link ID

**Request Body (optional):**

```json
{
  "reason": "string (optional, max 255 chars)"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Payment link disabled successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "disable123-def456"
}
```

### PATCH /payment-links/:id/enable

Enable a payment link.

**Parameters:**

- `id` (path): Payment link ID

**Request Body (optional):**

```json
{
  "reason": "string (optional, max 255 chars)"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Payment link enabled successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "enable123-def456"
}
```

### GET /payment-links/:id/status

Get payment link status and statistics.

**Parameters:**

- `id` (path): Payment link ID

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "isActive": true,
    "transactionCount": 5,
    "totalAmount": "1250.00",
    "lastTransactionAt": "2026-02-04T09:30:00.000Z"
  },
  "message": "Payment link status retrieved successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "status123-def456"
}
```

### GET /payment-links/:id/verify

Verify payment link and get payment details (public endpoint for verification).

**Parameters:**

- `id` (path): Payment link ID

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "isActive": true,
    "name": "Tech Solutions Ltd",
    "address": "0x3c45e44daae997b3ac8644ff3fdd13c120634f10",
    "token": "USDT",
    "currency": "USD",
    "selectedCurrency": "USD",
    "paymentType": "card",
    "amount": "250.00",
    "description": "Professional services payment",
    "successUrl": "https://mysite.com/success"
  },
  "correlationId": "verify123-def456"
}
```

### POST /payment-links/:id/access

Handle payment link access (when user opens the payment link).

**Parameters:**

- `id` (path): Payment link ID

**Request Body (optional):**

```json
{
  "payerInfo": {
    "payername": "string (optional)",
    "payeraddress": "string (optional)",
    "payercity": "string (optional)",
    "payerstate": "string (optional)",
    "payercountry": "string (optional)",
    "payerzipcode": "string (optional)",
    "payerphone": "string (optional)"
  }
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "amount": "250.00",
    "currency": "USD",
    "selectedCurrency": "USD",
    "description": "Professional services payment",
    "address": "0x3c45e44daae997b3ac8644ff3fdd13c120634f10",
    "token": "USDT",
    "paymentType": "card",
    "successUrl": "https://mysite.com/success",
    "linkUrl": "https://chainpaye.com/payment/507f1f77bcf86cd799439011",
    "toronetReference": "toro_ref_123456",
    "transactionId": "trans_789012",
    "paymentInitialization": {
      "id": "init_345678",
      "status": "SUCCESS",
      "toronetResponse": {
        "success": true,
        "txid": "toro_ref_123456"
      }
    }
  },
  "message": "Payment link accessed and initialized successfully",
  "correlationId": "access123-def456"
}
```

### POST /payment-links/:id

Alternative endpoint for payment link access (same as `/access`).

**Parameters:**

- `id` (path): Payment link ID

**Request/Response:** Same as `POST /payment-links/:id/access`

### GET /payment-links/:linkId/transactions

Get transactions for a specific payment link.

**Parameters:**

- `linkId` (path): Payment link ID

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 100)
- `sortBy` (optional): Field to sort by
- `sortOrder` (optional): `asc` or `desc`

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "trans_789012",
        "paymentLinkId": "507f1f77bcf86cd799439011",
        "reference": "ref_unique_123",
        "state": "COMPLETED",
        "amount": "250.00",
        "currency": "USD",
        "payerInfo": {
          "email": "user@example.com",
          "phone": "+1234567890"
        },
        "toronetReference": "toro_ref_123456",
        "metadata": {},
        "createdAt": "2026-02-04T09:30:00.000Z",
        "updatedAt": "2026-02-04T09:35:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10
  },
  "message": "Transactions retrieved successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "trans123-def456"
}
```

---

## Transactions

### POST /transactions

Create a new transaction.

**Request Body:**

```json
{
  "paymentLinkId": "string (required, 1-255 chars)",
  "payerInfo": {
    "email": "string (optional, valid email)",
    "phone": "string (optional)",
    "metadata": "object (optional)"
  },
  "metadata": "object (optional)"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "id": "trans_789012",
    "paymentLinkId": "507f1f77bcf86cd799439011",
    "reference": "ref_unique_123",
    "state": "PENDING",
    "amount": "250.00",
    "currency": "USD",
    "payerInfo": {
      "email": "user@example.com",
      "phone": "+1234567890"
    },
    "toronetReference": null,
    "metadata": {},
    "createdAt": "2026-02-04T09:30:00.000Z",
    "updatedAt": "2026-02-04T09:30:00.000Z"
  },
  "message": "Transaction created successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "create123-def456"
}
```

### GET /transactions/:id

Get transaction by ID.

**Parameters:**

- `id` (path): Transaction ID

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "trans_789012",
    "paymentLinkId": "507f1f77bcf86cd799439011",
    "reference": "ref_unique_123",
    "state": "COMPLETED",
    "amount": "250.00",
    "currency": "USD",
    "payerInfo": {
      "email": "user@example.com",
      "phone": "+1234567890"
    },
    "toronetReference": "toro_ref_123456",
    "metadata": {},
    "createdAt": "2026-02-04T09:30:00.000Z",
    "updatedAt": "2026-02-04T09:35:00.000Z"
  },
  "message": "Transaction retrieved successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "get123-def456"
}
```

### POST /transactions/:id/initialize

Initialize payment for a transaction.

**Parameters:**

- `id` (path): Transaction ID

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "transactionId": "trans_789012",
    "toronetReference": "toro_ref_123456",
    "status": "INITIALIZED"
  },
  "message": "Payment initialized successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "init123-def456"
}
```

### PATCH /transactions/:id/state

Transition transaction state.

**Parameters:**

- `id` (path): Transaction ID

**Request Body:**

```json
{
  "newState": "PENDING | INITIALIZED | PAID | COMPLETED | PAYOUT_FAILED",
  "reason": "string (required, 1-255 chars)",
  "metadata": "object (optional)"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "trans_789012",
    "previousState": "INITIALIZED",
    "newState": "PAID",
    "reason": "Payment confirmed by Toronet",
    "transitionedAt": "2026-02-04T09:35:00.000Z"
  },
  "message": "Transaction state updated successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "state123-def456"
}
```

### GET /transactions/:id/state-history

Get transaction state history.

**Parameters:**

- `id` (path): Transaction ID

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "transactionId": "trans_789012",
    "stateHistory": [
      {
        "state": "PENDING",
        "reason": "Transaction created",
        "timestamp": "2026-02-04T09:30:00.000Z"
      },
      {
        "state": "INITIALIZED",
        "reason": "Payment initialized with Toronet",
        "timestamp": "2026-02-04T09:32:00.000Z"
      },
      {
        "state": "PAID",
        "reason": "Payment confirmed by Toronet",
        "timestamp": "2026-02-04T09:35:00.000Z"
      }
    ]
  },
  "message": "State history retrieved successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "history123-def456"
}
```

### POST /record-transaction/:transactionId

Record transaction completion (standalone endpoint).

**Parameters:**

- `transactionId` (path): Transaction ID

**Request Body:**

```json
{
  "amount": "string (required, decimal as string)",
  "currency": "NGN | USD | GBP | EUR (required)",
  "senderName": "string (required, 1-100 chars)",
  "senderPhone": "string (required, 1-20 chars)",
  "paidAt": "string (required, ISO 8601 datetime)"
}
```

**Example Request:**

```json
{
  "amount": "250.00",
  "currency": "USD",
  "senderName": "John Doe",
  "senderPhone": "+1234567890",
  "paidAt": "2026-02-04T09:35:00.000Z"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "transactionId": "trans_789012",
    "state": "PAID",
    "recordedAmount": "250.00",
    "recordedCurrency": "USD",
    "senderName": "John Doe",
    "senderPhone": "+1234567890",
    "paidAt": "2026-02-04T09:35:00.000Z",
    "recordedAt": "2026-02-04T10:00:00.000Z"
  },
  "message": "Transaction recorded successfully",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "record123-def456"
}
```

---

## ChainPaye Direct Access

These endpoints handle direct access to payment links via the ChainPaye URL format.

### GET /:id

Handle direct ChainPaye link access (GET request).

**Parameters:**

- `id` (path): Payment link ID

**Response:** Same as `POST /payment-links/:id/access`

### POST /:id

Handle direct ChainPaye link access (POST request).

**Parameters:**

- `id` (path): Payment link ID

**Request/Response:** Same as `POST /payment-links/:id/access`

---

## Error Responses

### Validation Error (400)

```json
{
  "success": false,
  "error": "Validation failed",
  "message": "Body: Currency must be one of: NGN, USD, GBP, EUR",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "error123-def456"
}
```

### Not Found Error (404)

```json
{
  "success": false,
  "error": "Payment link not found",
  "message": "Payment link not found",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "error123-def456"
}
```

### Server Error (500)

```json
{
  "success": false,
  "error": "Internal server error",
  "message": "An unexpected error occurred",
  "timestamp": "2026-02-04T10:00:00.000Z",
  "correlationId": "error123-def456"
}
```

---

## Rate Limiting

Currently not implemented. Consider implementing rate limiting in production.

## CORS

Configure CORS headers appropriately for your frontend domains in production.

## Security Considerations

- Implement proper authentication and authorization
- Use HTTPS in production
- Validate and sanitize all inputs
- Implement request rate limiting
- Add proper logging and monitoring
- Use environment variables for sensitive configuration

## Pagination

All list endpoints support pagination with these query parameters:

- `page`: Page number (starts from 1)
- `limit`: Items per page (max 100)
- `sortBy`: Field to sort by
- `sortOrder`: `asc` or `desc`

## Correlation IDs

All responses include a `correlationId` for request tracking and debugging.

## Supported Currencies

- **NGN**: Nigerian Naira (bank transfers only)
- **USD**: US Dollar (card payments and bank transfers)
- **GBP**: British Pound (card payments and bank transfers)
- **EUR**: Euro (card payments and bank transfers)

## Transaction States

- **PENDING**: Initial state
- **INITIALIZED**: Payment initialized with Toronet
- **PAID**: Payment confirmed
- **COMPLETED**: Transaction completed successfully
- **PAYOUT_FAILED**: Payout failed (requires retry)
