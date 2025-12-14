import { createCanvas, CanvasRenderingContext2D } from "canvas";
import * as fs from "fs";

// Define the shape of the data we expect
export interface ReceiptData {
  amount: string;
  currency: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  transactionId: string;
  routingNO?: string; // Optional because NGN transactions don't have it
}

/**
 * Generates a receipt image for a transaction.
 * @param data - The transaction details matching the ReceiptData interface.
 * @returns Promise<Buffer> - The image buffer ready for WhatsApp.
 */
export async function generateReceipt(data: ReceiptData): Promise<Buffer> {
  // 1. Setup Canvas Dimensions
  const width = 600;
  const height = 800;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  // 2. Define Colors
  const colors = {
    bg: "#FFFFFF",
    textPrimary: "#333333",
    textSecondary: "#666666",
    brand: "#4CAF50",
    line: "#E0E0E0",
  };

  // --- DRAWING LOGIC ---

  // A. Background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  // B. Header (Success Icon)
  // Green Circle
  ctx.fillStyle = colors.brand;
  ctx.beginPath();
  ctx.arc(width / 2, 80, 40, 0, Math.PI * 2);
  ctx.fill();

  // White Checkmark
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 5;
  ctx.lineCap = "round"; // Makes the checkmark edges softer
  ctx.beginPath();
  ctx.moveTo(width / 2 - 15, 80);
  ctx.lineTo(width / 2 - 5, 90);
  ctx.lineTo(width / 2 + 20, 65);
  ctx.stroke();

  // Title
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "bold 30px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Transfer Successful", width / 2, 160);

  // C. The Amount
  ctx.fillStyle = colors.textPrimary;
  ctx.font = "bold 50px Arial";
  ctx.fillText(`${data.currency} ${data.amount}`, width / 2, 230);

  // Date
  ctx.fillStyle = colors.textSecondary;
  ctx.font = "20px Arial";
  const dateString = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  ctx.fillText(dateString, width / 2, 270);

  // D. Divider Line
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 300);
  ctx.lineTo(width - 50, 300);
  ctx.stroke();

  // E. Transaction Details
  const startY = 350;
  const lineHeight = 50;
  const leftMargin = 60;
  const rightMargin = width - 60;

  // Build the details array dynamically based on available data
  const details: Array<{ label: string; value: string }> = [
    { label: "Recipient", value: data.accountName },
    { label: "Bank", value: data.bankName },
    { label: "Account No", value: data.accountNumber },
  ];

  // Only add Routing Number if it exists (e.g., for USD)
  if (data.routingNO) {
    details.push({ label: "Routing No", value: data.routingNO });
  }

  details.push(
    { label: "Type", value: "Wallet Top-up" },
    { label: "Ref", value: data.transactionId }
  );

  ctx.font = "22px Arial";

  details.forEach((item, index) => {
    const currentY = startY + index * lineHeight;

    // Label (Left)
    ctx.fillStyle = colors.textSecondary;
    ctx.textAlign = "left";
    ctx.fillText(item.label, leftMargin, currentY);

    // Value (Right)
    ctx.fillStyle = colors.textPrimary;
    ctx.textAlign = "right";
    ctx.fillText(item.value, rightMargin, currentY);
  });

  // F. Footer
  const footerY = height - 60;
  ctx.fillStyle = colors.brand;
  ctx.fillRect(0, height - 20, width, 20); // Bottom strip

  ctx.fillStyle = colors.textSecondary;
  ctx.font = "18px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Thank you for using our service!", width / 2, footerY);

  return canvas.toBuffer("image/png");
}

// --- EXAMPLE USAGE (Can be removed in production) ---

(async () => {
  const mockData: ReceiptData = {
    amount: "150.00",
    currency: "USD",
    accountName: "Jane Smith",
    bankName: "Chase Bank",
    accountNumber: "9876543210",
    routingNO: "021000021",
    transactionId: "TXN_ABC123",
  };

  try {
    const buffer = await generateReceipt(mockData);
    fs.writeFileSync("receipt_ts_test.png", buffer);
    console.log("Receipt generated successfully!");
  } catch (err) {
    console.error("Error:", err);
  }
})();
