/**
 * Logger utility using Winston for structured logging
 * This provides consistent logging across the application
 */

import winston from "winston";

/**
 * Create and configure the Winston logger
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "chainpaye-whatsapp" },
  transports: [
    // Write all logs with importance level of 'error' or higher to 'error.log'
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with importance level of 'info' or higher to 'combined.log'
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

/**
 * If we're not in production, log to the console with a simple format
 */
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

/**
 * Helper function to log WhatsApp messages
 * @param direction - 'incoming' or 'outgoing'
 * @param from - Sender phone number
 * @param to - Recipient phone number
 * @param message - Message content
 */
export const logWhatsAppMessage = (
  direction: "incoming" | "outgoing",
  from: string,
  to: string,
  message: string
): void => {
  logger.info({
    type: "whatsapp_message",
    direction,
    from,
    to,
    message: message.length > 100 ? message.substring(0, 100) + "..." : message,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Helper function to log Toronet API calls
 * @param endpoint - API endpoint
 * @param method - HTTP method
 * @param requestData - Request data (optional)
 * @param responseData - Response data (optional)
 * @param error - Error if any (optional)
 */
export const logToronetApiCall = (
  endpoint: string,
  method: string,
  requestData?: any,
  responseData?: any,
  error?: any
): void => {
  logger.info({
    type: "toronet_api_call",
    endpoint,
    method,
    requestData: requestData ? JSON.stringify(requestData) : undefined,
    responseData: responseData ? JSON.stringify(responseData) : undefined,
    error: error ? error.message : undefined,
    timestamp: new Date().toISOString(),
  });
};
