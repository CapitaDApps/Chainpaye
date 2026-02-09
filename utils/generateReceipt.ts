import puppeteer from "puppeteer";
import fs from "fs-extra";
import path from "path";
import handlebars from "handlebars";
import { fileURLToPath } from "url";
import { TransactionType, TransactionStatus } from "../models/Transaction";
import { IUser } from "../models/User";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Define Interfaces representing receipt data scenarios

type TransactionDirection = "DEBIT" | "CREDIT" | "CONVERSION";

// Base interface for common fields
interface BaseReceiptData {
  transactionType: string; // e.g., 'Transfer', 'Withdrawal', 'Deposit'
  status: "Successful" | "Pending" | "Failed";
  transactionDate: string;
  transactionReference: string;
  // Optional fields that depend on the specific transaction
  senderName?: string;
  sourceInstitution?: string;
  beneficiary?: string;
  beneficiaryInstitution?: string;
  // Additional optional fields from Transaction model
  fees?: string;
  totalAmount?: string;
  failureReason?: string;
  description?: string;
  transactionHash?: string;
}

// Interface for standard money movement (Transfer, Withdraw, Deposit)
interface StandardTransactionReceipt extends BaseReceiptData {
  isConversion: false;
  transactionDirection: TransactionDirection;
  mainAmount: string; // e.g., "₦100.00"
}

// Interface for Currency Conversion
interface ConversionReceipt extends BaseReceiptData {
  isConversion: true;
  transactionDirection: "CONVERSION";
  amountFrom: string; // e.g., "100.00 USD"
  amountTo: string; // e.g., "150,000.00 NGN"
  exchangeRate: string; // e.g., "1 USD = 1500 NGN"
}

// Union type for any possible receipt data
type ReceiptData = StandardTransactionReceipt | ConversionReceipt;

/**
 * Format currency amount with symbol
 */
function formatAmount(amount: number, currency: string): string {
  const normalizedCurrency = (currency || "").toUpperCase();
  const prefixByCurrency: Record<string, string> = {
    USD: "$",
    NGN: "NGN ",
    EUR: "EUR ",
    GBP: "GBP ",
  };
  const prefix =
    prefixByCurrency[normalizedCurrency] || `${normalizedCurrency} `;

  return `${prefix}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatExchangeRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0";
  if (rate >= 1) return rate.toFixed(2);
  return rate.toFixed(8).replace(/\.?0+$/, "");
}

/**
 * Map transaction status to receipt status
 */
function mapTransactionStatus(
  status: TransactionStatus
): "Successful" | "Pending" | "Failed" {
  switch (status) {
    case TransactionStatus.COMPLETED:
      return "Successful";
    case TransactionStatus.PENDING:
    case TransactionStatus.PROCESSING:
      return "Pending";
    case TransactionStatus.FAILED:
    case TransactionStatus.CANCELLED:
      return "Failed";
    default:
      return "Pending";
  }
}

/**
 * Format date for receipt
 */
function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  return new Date(date).toLocaleDateString("en-US", options);
}

/**
 * Format transaction data for receipt generation based on project Transaction model
 */
export async function formatTransactionData(
  transaction: any,
  user: IUser,
  counterpartyUser?: IUser
): Promise<ReceiptData> {
  const status = mapTransactionStatus(transaction.status);
  const transactionDate = formatDate(transaction.createdAt);

  // Prepare additional fields
  const fees = transaction.fees
    ? formatAmount(transaction.fees, transaction.currency)
    : undefined;
  const totalAmount =
    transaction.totalAmount && transaction.totalAmount !== transaction.amount
      ? formatAmount(transaction.totalAmount, transaction.currency)
      : undefined;
  const failureReason = transaction.failureReason;
  const description = transaction.description;
  const transactionHash = transaction.hash || transaction.toronetTransactionId;

  // Handle CONVERSION transactions
  if (transaction.type === TransactionType.CONVERSION) {
    const amountFrom = formatAmount(
      transaction.fromAmount,
      transaction.fromCurrency
    );
    const amountTo = formatAmount(transaction.toAmount, transaction.toCurrency);
    const fromAmountValue = Number(transaction.fromAmount);
    const toAmountValue = Number(transaction.toAmount);
    const computedRate =
      Number.isFinite(fromAmountValue) &&
      Number.isFinite(toAmountValue) &&
      fromAmountValue > 0
        ? toAmountValue / fromAmountValue
        : NaN;
    const exchangeRate = Number.isFinite(computedRate)
      ? `1 ${transaction.fromCurrency} = ${formatExchangeRate(
          computedRate
        )} ${transaction.toCurrency}`
      : "N/A";

    const conversionReceipt: ConversionReceipt = {
      isConversion: true,
      transactionDirection: "CONVERSION",
      transactionType: "Currency Swap",
      status,
      amountFrom: `${amountFrom} ${transaction.fromCurrency}`,
      amountTo: `${amountTo} ${transaction.toCurrency}`,
      exchangeRate,
      sourceInstitution: `${transaction.fromCurrency} Wallet`,
      beneficiaryInstitution: `${transaction.toCurrency} Wallet`,
      transactionDate,
      transactionReference: transaction.referenceId,
    };

    // Conditionally add optional fields
    if (fees) conversionReceipt.fees = fees;
    if (totalAmount) conversionReceipt.totalAmount = totalAmount;
    if (failureReason) conversionReceipt.failureReason = failureReason;
    if (description) conversionReceipt.description = description;
    if (transactionHash) conversionReceipt.transactionHash = transactionHash;

    return conversionReceipt;
  }

  // Determine transaction direction and details
  let transactionDirection: TransactionDirection = "DEBIT";
  let transactionType = transaction.type;
  let mainAmount = formatAmount(transaction.amount, transaction.currency);
  let senderName: string | undefined;
  let sourceInstitution: string | undefined;
  let beneficiary: string | undefined;
  let beneficiaryInstitution: string | undefined;

  const userName = `${user.firstName} ${user.lastName}`.trim();
  const userPhone = user.whatsappNumber?.replace("+", "") || "";

  switch (transaction.type) {
    case TransactionType.TRANSFER:
      // Handle DEBIT (sender) or CREDIT (receiver)
      if (transaction.entryType === "DEBIT") {
        transactionDirection = "DEBIT";
        transactionType = "Transfer";
        senderName = userName;
        sourceInstitution = "CHAINPAYE WALLET";
        if (counterpartyUser) {
          beneficiary = `${counterpartyUser.firstName} ${
            counterpartyUser.lastName
          } | ${counterpartyUser.whatsappNumber?.replace("+", "")}`;
        }
        beneficiaryInstitution = "CHAINPAYE WALLET";
      } else if (transaction.entryType === "CREDIT") {
        transactionDirection = "CREDIT";
        transactionType = "Transfer";
        if (counterpartyUser) {
          senderName = `${counterpartyUser.firstName} ${counterpartyUser.lastName}`;
          sourceInstitution = "CHAINPAYE WALLET";
        }
        beneficiary = `${userName} | ${userPhone}`;
        beneficiaryInstitution = "CHAINPAYE WALLET";
      }
      break;

    case TransactionType.DEPOSIT:
      transactionDirection = "CREDIT";
      transactionType = "Deposit";
      senderName = "DEPOSIT / BANK TRANSFER";
      beneficiary = `${userName} | ${userPhone}`;
      sourceInstitution = "External Bank";
      beneficiaryInstitution = "CHAINPAYE WALLET";
      break;

    case TransactionType.WITHDRAWAL:
      transactionDirection = "DEBIT";
      transactionType = "Withdrawal";
      senderName = userName;
      sourceInstitution = `CHAINPAYE ${transaction.currency} WALLET`;
      // Add bank details if available
      if (transaction.bankDetails) {
        beneficiary = `${transaction.bankDetails.accountName} | ${transaction.bankDetails.accountNumber}`;
        beneficiaryInstitution = transaction.bankDetails.bankName;
      } else {
        beneficiary = "External Bank Account";
        beneficiaryInstitution = "External Bank";
      }
      break;

    case TransactionType.DIRECT_TRANSFER:
      transactionDirection = "CREDIT";
      transactionType = "Direct Deposit";
      senderName = "DIRECT TRANSFER";
      beneficiary = `${userName} | ${userPhone}`;
      sourceInstitution = "Blockchain";
      beneficiaryInstitution = "CHAINPAYE WALLET";
      break;

    default:
      transactionType = "Transaction";
      transactionDirection =
        (transaction.entryType as TransactionDirection) || "DEBIT";
      break;
  }

  const standardReceipt: StandardTransactionReceipt = {
    isConversion: false,
    transactionDirection,
    transactionType,
    status,
    mainAmount,
    transactionDate,
    transactionReference: transaction.referenceId,
  };

  // Conditionally add optional fields
  if (senderName) standardReceipt.senderName = senderName;
  if (sourceInstitution) standardReceipt.sourceInstitution = sourceInstitution;
  if (beneficiary) standardReceipt.beneficiary = beneficiary;
  if (beneficiaryInstitution)
    standardReceipt.beneficiaryInstitution = beneficiaryInstitution;
  if (fees) standardReceipt.fees = fees;
  if (totalAmount) standardReceipt.totalAmount = totalAmount;
  if (failureReason) standardReceipt.failureReason = failureReason;
  if (description) standardReceipt.description = description;
  if (transactionHash) standardReceipt.transactionHash = transactionHash;

  return standardReceipt;
}

// 2. Helper Function to prep data for the template (calculating CSS classes)
function prepareTemplateData(data: ReceiptData): any {
  let tagClass = "";
  if (data.transactionDirection === "DEBIT") tagClass = "tag-debit";
  else if (data.transactionDirection === "CREDIT") tagClass = "tag-credit";
  else if (data.transactionDirection === "CONVERSION")
    tagClass = "tag-conversion";

  let statusClass = "";
  if (data.status === "Successful") statusClass = "status-success";
  else if (data.status === "Pending") statusClass = "status-pending";
  else statusClass = "status-failed";

  return {
    ...data,
    tagClass,
    statusClass,
  };
}

// 3. Core Function: Generate Receipt Image and return base64
export async function generateReceipt(data: ReceiptData): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true, // Use new headless mode
    args: [
      "--no-sandbox", // <--- REQUIRED for EC2 root user
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // Prevents memory crashes on low-RAM instances
      "--disable-gpu",
    ],
    executablePath: "/usr/bin/chromium-browser", // Specify path to Chromium on your server
  });

  try {
    const page = await browser.newPage();

    // Read logo images and convert to base64
    const logoPath = path.join(__dirname, "../public/logo.jpg");
    const logoIconPath = path.join(__dirname, "../public/logo-icon.jpg");

    const logoBuffer = await fs.readFile(logoPath);
    const logoIconBuffer = await fs.readFile(logoIconPath);

    const logoBase64 = `data:image/jpeg;base64,${logoBuffer.toString(
      "base64"
    )}`;
    const logoIconBase64 = `data:image/jpeg;base64,${logoIconBuffer.toString(
      "base64"
    )}`;

    // Read and compile template
    const templateHtml = await fs.readFile(
      path.join(__dirname, "../templates/transactionReceipts.hbs"),
      "utf-8"
    );
    const template = handlebars.compile(templateHtml);

    // Prepare data with necessary CSS classes and logo base64 strings
    const compiledData = prepareTemplateData(data);
    const html = template({
      ...compiledData,
      logoBase64,
      logoIconBase64,
    });

    // Replace image src attributes with base64 data URIs
    const htmlWithImages = html
      .replace('src="/logo.jpg"', `src="${logoBase64}"`)
      .replace('src="/logo-icon.jpg"', `src="${logoIconBase64}"`);

    // Set content and wait for fonts to load for consistent rendering
    await page.setContent(htmlWithImages, { waitUntil: "networkidle0" });

    // Important: Set viewport size to ensure the receipt renders fully within the view
    await page.setViewport({
      width: 600,
      height: 1000,
      deviceScaleFactor: 2,
    });

    // Select the receipt element itself to avoid taking a screenshot of the whole body background
    const receiptElement = await page.$(".receipt-container");

    if (!receiptElement) {
      throw new Error("Receipt container not found in template");
    }

    // Take screenshot of just the receipt element with transparent background and return as base64
    const result = await receiptElement.screenshot({
      omitBackground: true, // ensures the jagged edge doesn't have white boxes behind it
      encoding: "base64",
    });
    await browser.close();

    console.log(`Receipt generated successfully`);
    return `data:image/png;base64,${result}`;
  } catch (error) {
    console.error("Error generating receipt:", error);
    await browser.close();
    throw error;
  }
}
