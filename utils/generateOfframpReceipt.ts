/**
 * Offramp Receipt Generator
 * 
 * Separate receipt generation system specifically for offramp transactions.
 * Does not interfere with the existing transaction receipt system.
 */

import puppeteer from "puppeteer";
import fs from "fs-extra";
import path from "path";
import handlebars from "handlebars";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Interface for offramp receipt data
 */
export interface OfframpReceiptData {
  ngnAmount: string; // Formatted NGN amount (e.g., "₦150,000.00")
  cryptoSpentUsd: string; // USD value of crypto spent (e.g., "$100.50")
  fees: string; // Transaction fees (e.g., "$0.75")
  bankName: string;
  accountName: string;
  accountNumber: string;
  dateTime: string; // Formatted date and time
  transactionReference: string; // Quote ID or transaction ID
  status: "Successful" | "Pending" | "Failed";
  asset?: string; // Crypto asset (e.g., "USDC", "USDT")
  chain?: string; // Blockchain network (e.g., "Stellar", "Base", "Solana")
}

// Map country codes to IANA timezone identifiers
const COUNTRY_TIMEZONE_MAP: Record<string, string> = {
  NG: "Africa/Lagos",
  GH: "Africa/Accra",
  KE: "Africa/Nairobi",
  ZA: "Africa/Johannesburg",
  GB: "Europe/London",
  US: "America/New_York",
  CA: "America/Toronto",
};

/**
 * Format date for offramp receipt in the user's local timezone
 * Output: "Thursday, Mar 26, 2026 at 08:35 am"
 */
function formatOfframpDate(date: Date, countryCode?: string): string {
  const timeZone = (countryCode && COUNTRY_TIMEZONE_MAP[countryCode]) || "UTC";
  const d = new Date(date);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long", timeZone });
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
  const timePart = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone }).toLowerCase();
  return `${weekday}, ${datePart} at ${timePart}`;
}

/**
 * Format currency amount with symbol
 */
function formatCurrency(amount: number, currency: string): string {
  const normalizedCurrency = (currency || "").toUpperCase();
  
  if (normalizedCurrency === "NGN") {
    return `₦${amount.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  
  if (normalizedCurrency === "USD") {
    return `$${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  
  return `${normalizedCurrency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Prepare offramp receipt data from transaction details
 */
export function prepareOfframpReceiptData(
  ngnAmount: number,
  cryptoSpentUsd: number,
  fees: number,
  bankName: string,
  accountName: string,
  accountNumber: string,
  transactionDate: Date,
  transactionReference: string,
  status: "Successful" | "Pending" | "Failed" = "Successful",
  countryCode?: string
): OfframpReceiptData {
  return {
    ngnAmount: formatCurrency(ngnAmount, "NGN"),
    cryptoSpentUsd: formatCurrency(cryptoSpentUsd, "USD"),
    fees: formatCurrency(fees, "USD"),
    bankName,
    accountName,
    accountNumber,
    dateTime: formatOfframpDate(transactionDate, countryCode),
    transactionReference,
    status,
  };
}

/**
 * Generate offramp receipt image and return base64
 */
export async function generateOfframpReceipt(
  data: OfframpReceiptData
): Promise<string> {
  const launchOptions: any = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  };

  // Use environment variable for Chromium path (for Linux servers)
  // On Windows, leave undefined to use bundled Chromium
  // On Linux, set CHROMIUM_PATH=/usr/bin/chromium-browser in .env
  if (process.env.CHROMIUM_PATH) {
    launchOptions.executablePath = process.env.CHROMIUM_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();

    // Read logo images and convert to base64
    const logoPath = path.join(__dirname, "../public/logo.png");
    const logoIconPath = path.join(__dirname, "../public/logo-icon.jpg");

    const logoBuffer = await fs.readFile(logoPath);
    const logoIconBuffer = await fs.readFile(logoIconPath);

    const logoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
    const logoIconBase64 = `data:image/jpeg;base64,${logoIconBuffer.toString("base64")}`;

    // Read and compile template
    const templateHtml = await fs.readFile(
      path.join(__dirname, "../templates/offrampReceipt.hbs"),
      "utf-8"
    );
    const template = handlebars.compile(templateHtml);

    // Determine status class
    let statusClass = "status-success";
    if (data.status === "Pending") statusClass = "status-pending";
    else if (data.status === "Failed") statusClass = "status-failed";

    const html = template({
      ...data,
      logoBase64,
      logoIconBase64,
      statusClass,
    });

    // Replace image src attributes with base64 data URIs
    const htmlWithImages = html
      .replace(/src="logo\.png"/g, `src="${logoBase64}"`)
      .replace(/src="logo\.jpg"/g, `src="${logoBase64}"`)
      .replace(/src="logo-icon\.jpg"/g, `src="${logoIconBase64}"`)
      .replace(/url\('logo\.png'\)/g, `url('${logoBase64}')`);

    // Set content and wait for fonts to load
    await page.setContent(htmlWithImages, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // Wait for rendering to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Set viewport size
    await page.setViewport({
      width: 600,
      height: 1200,
      deviceScaleFactor: 2,
    });

    // Take screenshot
    const screenshotElement = await page.$(".screenshot-wrapper");

    if (!screenshotElement) {
      throw new Error("Screenshot wrapper not found in offramp receipt template");
    }

    const result = await screenshotElement.screenshot({
      omitBackground: true,
      encoding: "base64",
    });
    
    await browser.close();

    console.log(`Offramp receipt generated successfully`);
    return `data:image/png;base64,${result}`;
  } catch (error) {
    console.error("Error generating offramp receipt:", error);
    await browser.close();
    throw error;
  }
}
