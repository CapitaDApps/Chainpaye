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
 * Format date for offramp receipt
 */
function formatOfframpDate(date) {
    const options = {
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
 * Format currency amount with symbol
 */
function formatCurrency(amount, currency) {
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
export function prepareOfframpReceiptData(ngnAmount, cryptoSpentUsd, cryptoAmount, cryptoSymbol, bankName, accountName, accountNumber, transactionDate, transactionReference, exchangeRate, status = "Successful") {
    return {
        ngnAmount: formatCurrency(ngnAmount, "NGN"),
        cryptoSpentUsd: formatCurrency(cryptoSpentUsd, "USD"),
        cryptoAmount: `${cryptoAmount.toFixed(6)} ${cryptoSymbol.toUpperCase()}`,
        bankName,
        accountName,
        accountNumber,
        dateTime: formatOfframpDate(transactionDate),
        transactionReference,
        exchangeRate: exchangeRate
            ? `1 USD = ₦${exchangeRate.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : undefined,
        status,
    };
}
/**
 * Generate offramp receipt image and return base64
 */
export async function generateOfframpReceipt(data) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
        executablePath: "/usr/bin/chromium-browser",
    });
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
        const templateHtml = await fs.readFile(path.join(__dirname, "../templates/offrampReceipt.hbs"), "utf-8");
        const template = handlebars.compile(templateHtml);
        // Determine status class
        let statusClass = "status-success";
        if (data.status === "Pending")
            statusClass = "status-pending";
        else if (data.status === "Failed")
            statusClass = "status-failed";
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
    }
    catch (error) {
        console.error("Error generating offramp receipt:", error);
        await browser.close();
        throw error;
    }
}
